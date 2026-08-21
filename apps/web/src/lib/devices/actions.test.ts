/**
 * The order forgetting happens in, which the registration prompt depends on,
 * and what a failed call is allowed to leave behind.
 */

import { describe, expect, it } from "vitest";
import {
  forgetDevice,
  registerDevice,
  renameDevice,
  type DeviceApi,
  type ForgetDeps,
  type RenameDeps,
} from "./actions";
import { dismissalKeyFor, type DismissalStorage } from "./dismissed";
import type { Device } from "./store.svelte";

const USER = "user-1";
const SERIAL = "0a1b2c3d4e5f";

/** Every write, in the order it happened — the thing under test is the order. */
function harness(overrides?: { rename?: () => Promise<unknown>; forget?: () => Promise<unknown> }) {
  const writes: string[] = [];
  const items = new Map<string, string>();
  const storage: DismissalStorage = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      writes.push(`dismiss:${key}`);
      items.set(key, value);
    },
  };
  const deps: RenameDeps & ForgetDeps = {
    api: {
      rename: overrides?.rename ?? (async () => ({})),
      forget: overrides?.forget ?? (async () => ({})),
    },
    store: {
      rename: (serial, name) => writes.push(`store.rename:${serial}:${name}`),
      remove: (serial) => writes.push(`store.remove:${serial}`),
    },
    storage,
    userId: USER,
  };
  return { deps, writes, items };
}

describe("renameDevice", () => {
  it("updates the store once the server has agreed", async () => {
    const { deps, writes } = harness();
    await renameDevice(deps, SERIAL, "Studio ears");
    expect(writes).toEqual([`store.rename:${SERIAL}:Studio ears`]);
  });

  it("leaves the store alone when the call fails", async () => {
    const { deps, writes } = harness({
      rename: () => Promise.reject(new Error("offline")),
    });
    await expect(renameDevice(deps, SERIAL, "Studio ears")).rejects.toThrow();
    expect(writes).toEqual([]);
  });
});

describe("forgetDevice", () => {
  // the prompt is derived from the list, so a row removed before the key is
  // written reopens the registration modal in the same frame
  it("writes the dismissal before the row leaves the store", async () => {
    const { deps, writes } = harness();
    await forgetDevice(deps, SERIAL);
    expect(writes).toEqual([`dismiss:${dismissalKeyFor(USER, SERIAL)}`, `store.remove:${SERIAL}`]);
  });

  it("neither dismisses nor removes when the call fails", async () => {
    const { deps, writes } = harness({
      forget: () => Promise.reject(new Error("offline")),
    });
    await expect(forgetDevice(deps, SERIAL)).rejects.toThrow();
    expect(writes).toEqual([]);
  });
});

describe("registerDevice", () => {
  const row = (serial: string, name: string) => ({
    ownerId: "owner",
    serial,
    name,
    createdAt: new Date("2026-02-02T00:00:00Z"),
    updatedAt: new Date("2026-02-02T00:00:00Z"),
  });

  const conflict = Object.assign(new Error("already registered"), {
    data: { code: "CONFLICT" },
  });

  function registerHarness(register: DeviceApi["register"], list?: DeviceApi["list"]) {
    const added: Device[] = [];
    const seeded: (Device[] | null)[] = [];
    const deps = {
      api: { register, list: list ?? (async () => []) },
      store: {
        add: (device: Device) => added.push(device),
        seed: (devices: Device[] | null) => seeded.push(devices),
      },
    };
    return { deps, added, seeded };
  }

  it("pushes the row the server created", async () => {
    const created = row(SERIAL, "Blep");
    const { deps, added } = registerHarness(async () => created);

    await registerDevice(deps, SERIAL, "Blep");

    expect(added).toEqual([created]);
  });

  it("sends the serial it was handed, not one it went looking for", async () => {
    const calls: unknown[] = [];
    const { deps } = registerHarness(async (input) => {
      calls.push(input);
      return row(input.serial, input.name);
    });

    await registerDevice(deps, SERIAL, "Blep");

    expect(calls).toEqual([{ serial: SERIAL, name: "Blep" }]);
  });

  // reachable with no bug at all: register on your phone, leave a laptop tab
  // open, connect, press Save
  it("self-heals a CONFLICT by refetching, so the verdict flips and the dialog closes", async () => {
    const elsewhere = [row(SERIAL, "Named on my phone")];
    const { deps, added, seeded } = registerHarness(
      async () => {
        throw conflict;
      },
      async () => elsewhere,
    );

    await expect(registerDevice(deps, SERIAL, "Blep")).resolves.toBeUndefined();

    expect(seeded).toEqual([elsewhere]);
    expect(added).toEqual([]);
  });

  // the list is unchanged, so the verdict stays true, so the dialog stays open
  // by itself — an inline message with Save re-enabled is the whole requirement
  it("rethrows anything else, and leaves the store alone", async () => {
    const { deps, added, seeded } = registerHarness(async () => {
      throw new Error("offline");
    });

    await expect(registerDevice(deps, SERIAL, "Blep")).rejects.toThrow("offline");

    expect(added).toEqual([]);
    expect(seeded).toEqual([]);
  });

  // a refetch that fails leaves the user with a dialog that stays open and a
  // Save they can press again — the same place an ordinary failure leaves them
  it("surfaces a CONFLICT whose refetch also failed rather than closing on a lie", async () => {
    const { deps, seeded } = registerHarness(
      async () => {
        throw conflict;
      },
      async () => {
        throw new Error("offline");
      },
    );

    await expect(registerDevice(deps, SERIAL, "Blep")).rejects.toThrow();

    expect(seeded).toEqual([]);
  });
});
