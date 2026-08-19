/**
 * The order forgetting happens in, which the registration prompt depends on,
 * and what a failed call is allowed to leave behind.
 */

import { describe, expect, it } from "vitest";
import { forgetDevice, renameDevice, type DeviceActionDeps } from "./actions";
import { dismissalKeyFor, type DismissalStorage } from "./dismissed";

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
  const deps: DeviceActionDeps = {
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
    expect(writes).toEqual([
      `dismiss:${dismissalKeyFor(USER, SERIAL)}`,
      `store.remove:${SERIAL}`,
    ]);
  });

  it("neither dismisses nor removes when the call fails", async () => {
    const { deps, writes } = harness({
      forget: () => Promise.reject(new Error("offline")),
    });
    await expect(forgetDevice(deps, SERIAL)).rejects.toThrow();
    expect(writes).toEqual([]);
  });
});
