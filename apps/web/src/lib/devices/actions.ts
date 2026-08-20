/**
 * Renaming and forgetting a registered pair — the server call and the client
 * state it has to leave consistent, in one place because the order matters.
 *
 * The dependencies arrive from outside so the ordering rule below is a few
 * synchronous assertions in a plain node test rather than something to be
 * checked by reading a component.
 */

import { dismiss, type DismissalStorage } from "./dismissed";
import type { Device } from "./store.svelte";

/** The slice of the device store these actions write. */
export interface DeviceWriter {
  rename(serial: string, name: string): void;
  remove(serial: string): void;
  add(device: Device): void;
  seed(devices: Device[] | null): void;
}

/** The procedures, as the client calls them. */
export interface DeviceApi {
  rename(input: { serial: string; name: string }): Promise<unknown>;
  forget(input: { serial: string }): Promise<unknown>;
  register(input: { serial: string; name: string }): Promise<Device>;
  list(): Promise<Device[]>;
}

// Each action asks for only the slice it touches, so the profile table is not
// made to supply a `register` it would never call, and a harness stays as small
// as the action it exercises.
export type RenameDeps = { api: Pick<DeviceApi, "rename">; store: Pick<DeviceWriter, "rename"> };

export type ForgetDeps = {
  api: Pick<DeviceApi, "forget">;
  store: Pick<DeviceWriter, "remove">;
  storage: DismissalStorage;
  userId: string;
};

export type RegisterDeps = {
  api: Pick<DeviceApi, "register" | "list">;
  store: Pick<DeviceWriter, "add" | "seed">;
};

export async function renameDevice(
  { api, store }: RenameDeps,
  serial: string,
  name: string,
): Promise<void> {
  await api.rename({ serial, name });
  store.rename(serial, name);
}

/**
 * Forgetting also dismisses: the two are the same intent — "I don't want these
 * in my list" — expressed at two moments (`docs/spec/profile-and-devices.md`
 * §3.3).
 *
 * **The dismissal is written before the row leaves the store, and the order is
 * load-bearing.** The registration prompt is derived from the device list, so
 * removing the row flips the verdict to "unregistered" in the same frame;
 * without the key already written, forgetting a pair you are connected to does
 * not merely re-offer registration later, it reopens the modal immediately.
 */
export async function forgetDevice(
  { api, store, storage, userId }: ForgetDeps,
  serial: string,
): Promise<void> {
  await api.forget({ serial });
  dismiss(storage, userId, serial);
  store.remove(serial);
}

/**
 * Registering a pair: the modal's Save, and the one refetch in this design.
 *
 * The serial is a parameter rather than something read from the connection when
 * the call resolves, by which point the connected state may be gone — the value
 * shown to the user is the value written. A disconnect mid-save deliberately
 * does not cancel it: the user answered the question, and the row is theirs
 * whether or not the ears are still powered on
 * (`docs/spec/profile-and-devices.md` §10.8).
 */
export async function registerDevice(
  { api, store }: RegisterDeps,
  serial: string,
  name: string,
): Promise<void> {
  let created: Device;
  try {
    created = await api.register({ serial, name });
  } catch (error) {
    if (!isConflict(error)) throw error;
    // §4 accepts a stale cache, so this is reachable with no bug: registered on
    // another device, and the user's intent is already satisfied. Refetching
    // brings in the row, which flips the verdict and closes the dialog by
    // itself; an inline error would leave it permanently stuck, because the
    // local list would still lack the row.
    store.seed(await api.list());
    return;
  }
  // the row as the server created it — building one here would mean inventing
  // `createdAt`, which the profile table displays
  store.add(created);
}

/**
 * Matching the code rather than the message, as `isAnimationCapError` does:
 * `register`'s only CONFLICT is an already-registered serial.
 */
function isConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { data } = error as { data?: unknown };
  if (typeof data !== "object" || data === null) return false;
  return (data as { code?: unknown }).code === "CONFLICT";
}
