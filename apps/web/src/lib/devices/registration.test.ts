import { describe, expect, it } from "vitest";
import type { EarsConnectionState } from "$lib/ears/connection-state";
import type { DeviceIdentity } from "$lib/ears/protocol";
import { dismissalKeyFor, type DismissalStorage } from "./dismissed";
import { registrationPrompt, resolveRegistration, type Registration } from "./registration";
import type { Device } from "./store.svelte";

function device(serial: string, name: string): Device {
  return {
    ownerId: "owner",
    serial,
    name,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

function connected(identity: DeviceIdentity): EarsConnectionState {
  return {
    status: "connected",
    deviceId: "opaque-id",
    deviceName: "Robo Cat Ears",
    capability: { protocolVersion: 1, slotCount: 16, maxChunkBytes: 509, identity },
    slots: [],
  };
}

const WITH_SERIAL = connected({ kind: "serial", serial: "deadbeef0001" });

describe("resolveRegistration", () => {
  it.each([
    ["unsupported", { status: "unsupported" }],
    ["disconnected", { status: "disconnected", notice: null }],
    ["connecting", { status: "connecting" }],
  ] as const)("knows nothing about a pair it is not connected to (%s)", (_label, state) => {
    expect(resolveRegistration(state, [])).toEqual({ kind: "unknown" });
  });

  it("matches a connected serial against the list", () => {
    expect(resolveRegistration(WITH_SERIAL, [device("deadbeef0001", "Blep")])).toEqual({
      kind: "registered",
      serial: "deadbeef0001",
      name: "Blep",
    });
  });

  it("calls a serial the list does not hold unregistered", () => {
    expect(resolveRegistration(WITH_SERIAL, [device("00000000beef", "Someone else's")])).toEqual({
      kind: "unregistered",
      serial: "deadbeef0001",
    });
  });

  it("calls an empty list unregistered — empty is a real answer", () => {
    expect(resolveRegistration(WITH_SERIAL, [])).toEqual({
      kind: "unregistered",
      serial: "deadbeef0001",
    });
  });

  // §10.6: null and empty are opposites. Under null, claiming "unregistered"
  // nags someone about ears they named months ago, so it degrades to the app
  // as it already ships instead.
  it("refuses to guess when the list is unknown, and never says unregistered", () => {
    expect(resolveRegistration(WITH_SERIAL, null)).toEqual({ kind: "unknown" });
  });

  it("tells a pre-serial pair their firmware is behind", () => {
    const verdict = resolveRegistration(connected({ kind: "pre-serial" }), []);

    expect(verdict.kind).toBe("unregisterable");
    expect(verdict).toMatchObject({ reason: expect.stringMatching(/firmware/i) });
  });

  // §7.3: sending this person to update their firmware is an errand that
  // cannot succeed, so the two reasons must not collapse into one
  it("tells an unidentified pair something different from the firmware sentence", () => {
    const unidentified = resolveRegistration(connected({ kind: "unidentified" }), []);
    const preSerial = resolveRegistration(connected({ kind: "pre-serial" }), []);

    expect(unidentified.kind).toBe("unregisterable");
    expect(unidentified).toMatchObject({ reason: expect.not.stringMatching(/firmware/i) });
    expect(unidentified).not.toEqual(preSerial);
  });

  // the reason is a fact about the ears, not about the list, so it survives a
  // list we could not fetch — and "cannot be registered" is never a false
  // "unregistered", which is the only thing §10.6 is protecting
  it("still names the reason when the list is unknown", () => {
    expect(resolveRegistration(connected({ kind: "pre-serial" }), null).kind).toBe(
      "unregisterable",
    );
  });

  // §10.3: only the modal consults the dismissal store. If a dismissal could
  // reach this function, the profile page could hide its own register row —
  // and the second door would be closable by the key that closes the first.
  it("takes no dismissal input at all", () => {
    expect(resolveRegistration).toHaveLength(2);
  });
});

describe("registrationPrompt", () => {
  const storage = (keys: string[]): DismissalStorage => ({
    getItem: (key) => (keys.includes(key) ? "1" : null),
    setItem: () => {},
  });

  const unregistered: Registration = { kind: "unregistered", serial: "deadbeef0001" };

  it("asks about a connected pair the user has not registered or declined", () => {
    expect(registrationPrompt(unregistered, storage([]), "user-1")).toEqual({
      serial: "deadbeef0001",
    });
  });

  it("stays shut once that pair has been declined", () => {
    const declined = storage([dismissalKeyFor("user-1", "deadbeef0001")]);

    expect(registrationPrompt(unregistered, declined, "user-1")).toBeNull();
  });

  // §3: sharing a browser must not let one user's "not now" silence another's
  it("is another user's question again, in the same browser", () => {
    const declined = storage([dismissalKeyFor("user-1", "deadbeef0001")]);

    expect(registrationPrompt(unregistered, declined, "user-2")).toEqual({
      serial: "deadbeef0001",
    });
  });

  it.each([
    ["registered", { kind: "registered", serial: "deadbeef0001", name: "Blep" }],
    ["unregisterable", { kind: "unregisterable", reason: "firmware" }],
    ["unknown", { kind: "unknown" }],
  ] as const)("never opens on a %s verdict", (_label, verdict) => {
    expect(registrationPrompt(verdict, storage([]), "user-1")).toBeNull();
  });

  // §10.7: connecting is a signed-out capability, and the chip is a connection
  // status display rather than a place to acquire accounts
  it("never opens when nobody is signed in", () => {
    expect(registrationPrompt(unregistered, storage([]), null)).toBeNull();
  });
});
