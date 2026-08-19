/**
 * What a dismissal is keyed by, and what happens when the browser will not
 * hand storage over — the two things the store promises.
 */

import { describe, expect, it } from "vitest";
import {
  dismiss,
  dismissalKeyFor,
  isDismissed,
  localDismissalStorage,
  type DismissalStorage,
} from "./dismissed";

const USER = "user-1";
const OTHER_USER = "user-2";
const SERIAL = "0a1b2c3d4e5f";
const OTHER_SERIAL = "ffeeddccbbaa";

/** A `localStorage` stand-in that can be told to fail the way a blocked origin does. */
function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  let failing = false;
  const refuse = () => {
    if (failing) throw new Error("SecurityError");
  };
  return {
    items,
    fail() {
      failing = true;
    },
    getItem(key: string) {
      refuse();
      return items.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      refuse();
      items.set(key, value);
    },
  } satisfies DismissalStorage & Record<string, unknown>;
}

describe("dismissals", () => {
  it("has nothing to say about a pair nobody dismissed", () => {
    expect(isDismissed(fakeStorage(), USER, SERIAL)).toBe(false);
  });

  it("remembers a dismissal", () => {
    const storage = fakeStorage();
    dismiss(storage, USER, SERIAL);
    expect(isDismissed(storage, USER, SERIAL)).toBe(true);
  });

  it("scopes a dismissal to one pair", () => {
    const storage = fakeStorage();
    dismiss(storage, USER, SERIAL);
    expect(isDismissed(storage, USER, OTHER_SERIAL)).toBe(false);
  });

  // a shared browser must not let one person's "not now" silence another's prompt
  it("scopes a dismissal to one user", () => {
    const storage = fakeStorage();
    dismiss(storage, USER, SERIAL);
    expect(isDismissed(storage, OTHER_USER, SERIAL)).toBe(false);
  });

  it("counts any leftover value as dismissed, whatever an older build wrote", () => {
    const storage = fakeStorage({ [dismissalKeyFor(USER, SERIAL)]: "" });
    expect(isDismissed(storage, USER, SERIAL)).toBe(true);
  });

  it("costs a prompt rather than a render when storage refuses", () => {
    const storage = fakeStorage();
    storage.fail();
    expect(() => dismiss(storage, USER, SERIAL)).not.toThrow();
    expect(isDismissed(storage, USER, SERIAL)).toBe(false);
  });

  it("stands in for a localStorage that is not there", () => {
    const storage = localDismissalStorage();
    expect(() => dismiss(storage, USER, SERIAL)).not.toThrow();
    expect(isDismissed(storage, USER, SERIAL)).toBe(false);
  });
});
