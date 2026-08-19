/**
 * Renaming and forgetting a registered pair — the server call and the client
 * state it has to leave consistent, in one place because the order matters.
 *
 * The dependencies arrive from outside so the ordering rule below is a few
 * synchronous assertions in a plain node test rather than something to be
 * checked by reading a component.
 */

import { dismiss, type DismissalStorage } from "./dismissed";

/** The slice of the device store these actions write. */
export interface DeviceWriter {
  rename(serial: string, name: string): void;
  remove(serial: string): void;
}

/** The two procedures, as the client calls them. */
export interface DeviceApi {
  rename(input: { serial: string; name: string }): Promise<unknown>;
  forget(input: { serial: string }): Promise<unknown>;
}

export interface DeviceActionDeps {
  api: DeviceApi;
  store: DeviceWriter;
  storage: DismissalStorage;
  userId: string;
}

export async function renameDevice(
  { api, store }: DeviceActionDeps,
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
  { api, store, storage, userId }: DeviceActionDeps,
  serial: string,
): Promise<void> {
  await api.forget({ serial });
  dismiss(storage, userId, serial);
  store.remove(serial);
}
