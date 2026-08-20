/**
 * The one live connection to a pair of ears, as reactive state.
 *
 * Module-level and singular on purpose: every GATT operation in the app
 * serializes through this object's session, because concurrent Web Bluetooth
 * operations may reject with `NetworkError` and Blink has no operation queue.
 *
 * It survives client-side navigation and deliberately does not survive a
 * reload — browsers will not persist device permission without Chrome flags we
 * will not ask users to set, so connect-per-session is the contract and the
 * chip says so out loud.
 */

import type { EarsConnectionState } from "./chip";
import { handshake } from "./connect";
import type { Slot } from "./protocol";
import { createSession, type EarsSession } from "./session";
import { bluetoothSupported, openEarsLink } from "./web-bluetooth";

function createEarsConnection() {
  let state = $state<EarsConnectionState>(
    bluetoothSupported() ? { status: "disconnected", notice: null } : { status: "unsupported" },
  );
  let session: EarsSession | undefined;

  function disconnected(notice: string | null): void {
    session = undefined;
    state = { status: "disconnected", notice };
  }

  async function connect(): Promise<void> {
    if (state.status !== "disconnected") return;
    state = { status: "connecting" };

    const opened = await openEarsLink();
    if (opened.kind === "cancelled") return disconnected(null);
    if (opened.kind === "failed") return disconnected(opened.message);

    const live = createSession(opened.link);
    session = live;
    opened.link.onDisconnect(() => {
      // only while connected: a drop during the handshake is already being
      // reported by the handshake's own result, in better words
      if (state.status === "connected") disconnected("Your ears disconnected.");
    });

    const result = await handshake(live);
    if (result.ok === false) return disconnected(result.message);

    state = {
      status: "connected",
      deviceId: live.deviceId,
      deviceName: live.deviceName,
      capability: result.capability,
      slots: result.slots,
    };
  }

  return {
    get state(): EarsConnectionState {
      return state;
    },
    /** The serialized request path, for everything that rides on the connection. */
    get session(): EarsSession | undefined {
      return session;
    },
    connect,
    /**
     * What an upload learnt about the slots. Ignored unless still connected to
     * the same device, so a listing can never be shown against another pair.
     */
    updateSlots(deviceId: string, slots: readonly Slot[]): void {
      if (state.status !== "connected" || state.deviceId !== deviceId) return;
      state = { ...state, slots };
    },
    disconnect(): void {
      session?.disconnect();
      disconnected(null);
    },
  };
}

export const ears = createEarsConnection();
