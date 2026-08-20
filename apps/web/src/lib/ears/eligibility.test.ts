import { describe, expect, it } from "vitest";
import type { EarsConnectionState } from "./chip";
import { sendEligibility } from "./eligibility";
import { buildSlots, type Capability } from "./protocol";

const capability: Capability = {
  protocolVersion: 1,
  slotCount: 16,
  maxChunkBytes: 512,
  identity: { kind: "pre-serial" },
};

const connected: EarsConnectionState = {
  status: "connected",
  deviceId: "ears-1",
  deviceName: "ROBO_CAT_EARS",
  capability,
  slots: buildSlots(16, []),
};

const sendable = { robotSlug: "robo-cat-ears", keyframeCount: 12, readableKeyframeCount: 12 };

describe("sendEligibility", () => {
  it("allows a robo-cat-ears animation once the ears are connected", () => {
    expect(sendEligibility(connected, sendable)).toEqual({ canSend: true, reason: null });
  });

  it("names the numbers when the animation has more keyframes than the ears hold", () => {
    const verdict = sendEligibility(connected, { ...sendable, keyframeCount: 71 });

    expect(verdict.canSend).toBe(false);
    expect(verdict.reason).toContain("64");
    expect(verdict.reason).toContain("71");
  });

  it("refuses an animation with no keyframes", () => {
    expect(
      sendEligibility(connected, { ...sendable, keyframeCount: 0, readableKeyframeCount: 0 })
        .canSend,
    ).toBe(false);
  });

  it("refuses to send a shortened animation when the browser could not read it all", () => {
    const verdict = sendEligibility(connected, { ...sendable, readableKeyframeCount: 11 });

    expect(verdict.canSend).toBe(false);
    expect(verdict.reason).toContain("shortened");
  });

  it("says it is too big before it says it is unreadable, since the number is the answer", () => {
    const verdict = sendEligibility(connected, {
      ...sendable,
      keyframeCount: 71,
      readableKeyframeCount: 70,
    });

    expect(verdict.reason).toContain("71");
  });

  it("refuses an animation built for a different robot", () => {
    const verdict = sendEligibility(connected, { ...sendable, robotSlug: "robo-dog-tail" });

    expect(verdict.canSend).toBe(false);
    expect(verdict.reason).toContain("robo-dog-tail");
  });

  it("refuses an animation whose robot is unknown", () => {
    expect(sendEligibility(connected, { ...sendable, robotSlug: undefined }).canSend).toBe(false);
  });

  it("says the browser cannot do it at all, rather than asking for a connection", () => {
    const verdict = sendEligibility({ status: "unsupported" }, sendable);

    expect(verdict.canSend).toBe(false);
    expect(verdict.reason).toContain("Chrome");
  });

  it("points at the header chip when nothing is connected", () => {
    const verdict = sendEligibility({ status: "disconnected", notice: null }, sendable);

    expect(verdict.canSend).toBe(false);
    expect(verdict.reason).toContain("header");
  });

  it("waits rather than inviting a second connect while one is in flight", () => {
    expect(sendEligibility({ status: "connecting" }, sendable).canSend).toBe(false);
  });

  it("prefers the animation's own problem over asking the user to connect first", () => {
    const verdict = sendEligibility(
      { status: "disconnected", notice: null },
      { ...sendable, keyframeCount: 71 },
    );

    expect(verdict.reason).toContain("71");
  });
});
