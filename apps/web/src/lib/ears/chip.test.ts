import { describe, expect, it } from "vitest";
import { chipView, slotSummary } from "./chip";
import type { Slot } from "./protocol";

const capability = { protocolVersion: 1, slotCount: 16, maxChunkBytes: 509 };

function slots(occupied: number[]): Slot[] {
  return Array.from({ length: capability.slotCount }, (_unused, index) => ({
    index,
    entry: occupied.includes(index)
      ? { index, animationId: null, name: `Slot ${index}` }
      : null,
  }));
}

describe("chipView", () => {
  it("stays visible where Web Bluetooth is absent and says which browser is needed", () => {
    const view = chipView({ status: "unsupported" });

    expect(view.label).toBe("Ears need Chrome");
    expect(view.action).toBe("none");
    expect(view.detail).toMatch(/iPhone/);
  });

  it("says connect-per-session while disconnected rather than pretending otherwise", () => {
    const view = chipView({ status: "disconnected", notice: null });

    expect(view.label).toBe("Connect ears");
    expect(view.action).toBe("connect");
    expect(view.detail).toMatch(/reload/i);
  });

  it("shows why the last attempt ended, and still offers to connect", () => {
    const view = chipView({ status: "disconnected", notice: "Your ears dropped the connection." });

    expect(view.detail).toBe("Your ears dropped the connection.");
    expect(view.action).toBe("connect");
  });

  it("offers nothing to click while connecting", () => {
    expect(chipView({ status: "connecting" })).toMatchObject({ action: "none", tone: "busy" });
  });

  it("shows the device and its real occupancy once connected", () => {
    const view = chipView({
      status: "connected",
      deviceId: "ears-1",
      deviceName: "ROBO_CAT_EARS",
      capability,
      slots: slots([0, 5]),
    });

    expect(view.label).toBe("ROBO_CAT_EARS");
    expect(view.detail).toContain("2 of 16 slots used");
    expect(view.action).toBe("disconnect");
    expect(view.tone).toBe("live");
  });
});

describe("slotSummary", () => {
  it("counts the occupied slots against the count the ears reported", () => {
    expect(slotSummary(slots([]))).toBe("0 of 16 slots used");
    expect(slotSummary(slots([3]))).toBe("1 of 16 slots used");
  });
});
