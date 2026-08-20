/**
 * What the app knows about the live connection, as a closed set of states.
 *
 * Its own module rather than a type inside `chip.ts` so the dependency between
 * `lib/ears/` and `lib/devices/` stays acyclic: `chip.ts` imports `Registration`
 * from `lib/devices/registration.ts` (§10.9), and `resolveRegistration` needs
 * this state to decide one — which would put the two files in a cycle if this
 * type lived beside the view that consumes it.
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
