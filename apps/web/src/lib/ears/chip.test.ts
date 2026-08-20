import { describe, expect, it } from "vitest";
import type { Registration } from "$lib/devices/registration";
import { chipView, slotSummary } from "./chip";
import type { Slot } from "./protocol";

const capability = {
  protocolVersion: 1,
  slotCount: 16,
  maxChunkBytes: 509,
  identity: { kind: "pre-serial" },
} as const;

const UNKNOWN: Registration = { kind: "unknown" };

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
    const view = chipView({ status: "unsupported" }, UNKNOWN);

    expect(view.label).toBe("Ears need Chrome");
    expect(view.action).toBe("none");
    expect(view.detail).toMatch(/iPhone/);
  });

  it("says connect-per-session while disconnected rather than pretending otherwise", () => {
    const view = chipView({ status: "disconnected", notice: null }, UNKNOWN);

    expect(view.label).toBe("Connect ears");
    expect(view.action).toBe("connect");
    expect(view.detail).toMatch(/reload/i);
  });

  it("shows why the last attempt ended, and still offers to connect", () => {
    const view = chipView({ status: "disconnected", notice: "Your ears dropped the connection." }, UNKNOWN);

    expect(view.detail).toBe("Your ears dropped the connection.");
    expect(view.action).toBe("connect");
  });

  it("offers nothing to click while connecting", () => {
    expect(chipView({ status: "connecting" }, UNKNOWN)).toMatchObject({ action: "none", tone: "busy" });
  });

  it("shows the device and its real occupancy once connected", () => {
    const view = chipView({
      status: "connected",
      deviceId: "ears-1",
      deviceName: "ROBO_CAT_EARS",
      capability,
      slots: slots([0, 5]),
    }, UNKNOWN);

    expect(view.label).toBe("ROBO_CAT_EARS");
    expect(view.detail).toContain("2 of 16 slots used");
    expect(view.action).toBe("disconnect");
    expect(view.tone).toBe("live");
  });

  describe("what registration adds", () => {
    const connected = {
      status: "connected",
      deviceId: "ears-1",
      deviceName: "ROBO_CAT_EARS",
      capability,
      slots: slots([0, 5]),
    } as const;

    // §4: the user's chosen name has to appear where the user already looks,
    // or they named a database row rather than their ears
    it("shows the chosen name as the label once the pair is registered", () => {
      const view = chipView(connected, {
        kind: "registered",
        serial: "deadbeef0001",
        name: "Blep",
      });

      expect(view.label).toBe("Blep");
      expect(view.detail).toContain("2 of 16 slots used");
    });

    // §10.5: the name is the label and "Unregistered" is the detail, so the
    // two rules are about different lines and never compete
    it("names the situation in the detail line, keeping the advertised label", () => {
      const view = chipView(connected, { kind: "unregistered", serial: "deadbeef0001" });

      expect(view.label).toBe("ROBO_CAT_EARS");
      expect(view.detail).toBe("Unregistered · this tab only");
    });

    // the chip is max-w-56 with the detail clamped to two lines: there is no
    // third segment to be had, and the sentence naming something to do wins
    it("displaces the slot summary rather than joining it", () => {
      const view = chipView(connected, { kind: "unregistered", serial: "deadbeef0001" });

      expect(view.detail).not.toContain("slots used");
    });

    // that line is a prod toward an action, and for these ears there is no
    // action — the explanation belongs where there is room for a sentence
    it("stays quiet about ears that cannot be registered at all", () => {
      const view = chipView(connected, { kind: "unregisterable", reason: "anything at all" });

      expect(view.detail).not.toMatch(/unregistered/i);
      expect(view.detail).not.toContain("anything at all");
      expect(view).toEqual(chipView(connected, UNKNOWN));
    });

    // signed out and failed-fetch share this branch, which is what stops
    // either from producing a false "Unregistered"
    it("is byte-identical to today's chip when it does not know", () => {
      expect(chipView(connected, UNKNOWN)).toEqual({
        label: "ROBO_CAT_EARS",
        detail: "2 of 16 slots used · this tab only",
        tone: "live",
        action: "disconnect",
      });
    });

    // §8.5 settles this: the chip stays a status display with one verb and
    // gains no menu, because the profile page is the second door
    it("offers no verb beyond the three, whatever the registration says", () => {
      const verdicts: Registration[] = [
        UNKNOWN,
        { kind: "unregisterable", reason: "r" },
        { kind: "unregistered", serial: "deadbeef0001" },
        { kind: "registered", serial: "deadbeef0001", name: "Blep" },
      ];

      for (const verdict of verdicts) {
        expect(["connect", "disconnect", "none"]).toContain(chipView(connected, verdict).action);
      }
    });
  });
});

describe("slotSummary", () => {
  it("counts the occupied slots against the count the ears reported", () => {
    expect(slotSummary(slots([]))).toBe("0 of 16 slots used");
    expect(slotSummary(slots([3]))).toBe("1 of 16 slots used");
  });
});
