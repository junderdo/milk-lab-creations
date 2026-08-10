/**
 * What the header chip says, as a pure function of the connection.
 *
 * The chip is the only place that connects and it doubles as the connection's
 * status display, so every state it can be in has copy here rather than in the
 * component.
 */

import type { Capability, Slot } from "./protocol";

export type EarsConnectionState =
  /** No `navigator.bluetooth` at all: iOS, Firefox. */
  | { readonly status: "unsupported" }
  | { readonly status: "disconnected"; readonly notice: string | null }
  | { readonly status: "connecting" }
  | {
      readonly status: "connected";
      /** The slot list is tagged with the device it came from, never reused across one. */
      readonly deviceId: string;
      readonly deviceName: string;
      readonly capability: Capability;
      readonly slots: readonly Slot[];
    };

export interface ChipView {
  readonly label: string;
  /**
   * The second line, always rendered — never only a tooltip, which never opens
   * on a touch device, and touch devices are exactly where the feature is
   * missing.
   */
  readonly detail: string;
  readonly tone: "unavailable" | "idle" | "busy" | "live";
  readonly action: "connect" | "disconnect" | "none";
}

const PER_SESSION = "this tab only";

export function slotSummary(slots: readonly Slot[]): string {
  const used = slots.filter((slot) => slot.entry !== null).length;
  return `${used} of ${slots.length} slots used`;
}

export function chipView(state: EarsConnectionState): ChipView {
  switch (state.status) {
    case "unsupported":
      return {
        label: "Ears need Chrome",
        detail: "Not Firefox, and never iPhone or iPad",
        tone: "unavailable",
        action: "none",
      };
    case "disconnected":
      return {
        label: "Connect ears",
        detail: state.notice ?? "For this tab only — gone on reload",
        tone: "idle",
        action: "connect",
      };
    case "connecting":
      return {
        label: "Connecting…",
        detail: "Asking what your ears can do",
        tone: "busy",
        action: "none",
      };
    case "connected":
      return {
        label: state.deviceName,
        detail: `${slotSummary(state.slots)} · ${PER_SESSION}`,
        tone: "live",
        action: "disconnect",
      };
    default: {
      const unhandled: never = state;
      throw new Error(`unhandled connection state: ${String(unhandled)}`);
    }
  }
}
