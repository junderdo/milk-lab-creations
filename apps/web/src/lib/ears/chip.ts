/**
 * What the header chip says, as a pure function of the connection.
 *
 * The chip is the only place that connects and it doubles as the connection's
 * status display, so every state it can be in has copy here rather than in the
 * component.
 */

import type { Registration } from "$lib/devices/registration";
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
  /**
   * Three verbs, closed on purpose. The chip is the app's most-pressed control
   * and a menu would put a rarely-used verb behind an extra press on it, then
   * duplicate the profile page once that exists — two doors to one action is
   * what makes both harder to describe (`docs/spec/profile-and-devices.md`
   * §8.5).
   */
  readonly action: "connect" | "disconnect" | "none";
}

const PER_SESSION = "this tab only";

export function slotSummary(slots: readonly Slot[]): string {
  const used = slots.filter((slot) => slot.entry !== null).length;
  return `${used} of ${slots.length} slots used`;
}

/**
 * The registration verdict arrives from outside rather than being read here:
 * resolving it needs the device list, and the connection deliberately knows
 * nothing about tRPC or the logged-in user. This is the shape
 * `sendEligibility(state, animation)` already uses.
 */
export function chipView(state: EarsConnectionState, registration: Registration): ChipView {
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
        // §4's chosen name is the label; §8.5's "Unregistered" is the detail.
        // Different lines, so the two rules never compete.
        label: registration.kind === "registered" ? registration.name : state.deviceName,
        // "Unregistered" displaces the slot summary rather than joining it: the
        // chip is `max-w-56` with the detail clamped to two lines, so there is
        // no third segment to be had, and the more useful sentence at that
        // moment is the one naming something to do. It is self-limiting — it
        // goes as soon as the user answers, either way — and the slot count
        // stays where it is operationally needed, in the send dialog.
        //
        // Ears that *cannot* be registered are deliberately not labelled this
        // way: the line is a prod toward an action, and for them there is no
        // action (§10.5). They read as an ordinary connection, which is also
        // what stops a failed fetch or a signed-out session from lying.
        detail:
          registration.kind === "unregistered"
            ? `Unregistered · ${PER_SESSION}`
            : `${slotSummary(state.slots)} · ${PER_SESSION}`,
        tone: "live",
        action: "disconnect",
      };
    default: {
      const unhandled: never = state;
      throw new Error(`unhandled connection state: ${String(unhandled)}`);
    }
  }
}
