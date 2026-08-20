/**
 * Whether the pair currently connected is one the user has registered — decided
 * once, for the three places that ask.
 *
 * The chip (§10.5), the registration modal (§10.4) and the profile page's
 * register row (§8.5, §8.6) all need the same verdict, and §7.3's two reason
 * strings need exactly one implementation. So this is one producer and three
 * readers, in the shape `chipView` and `sendEligibility` already use: a pure
 * function returning a decided verdict, consumed by a component's `$derived`.
 *
 * **Dismissals are deliberately not an input.** Only the modal consults the
 * dismissal store, which makes "a dismissal silences the prompt, never the
 * feature" (§3.1) structural rather than remembered: the profile page *cannot*
 * hide its own register row on a dismissal, because it never sees one. The
 * second door cannot be closed by the key that closes the first.
 *
 * `docs/spec/profile-and-devices.md` §10.3.
 */

import type { EarsConnectionState } from "$lib/ears/chip";
import type { DeviceIdentity } from "$lib/ears/protocol";
import { isDismissed, type DismissalStorage } from "./dismissed";
import type { Device } from "./store.svelte";

export type Registration =
  /** Not connected, or we could not find out what is registered. */
  | { readonly kind: "unknown" }
  /** Connected to a pair that cannot be registered, and why. */
  | { readonly kind: "unregisterable"; readonly reason: string }
  | { readonly kind: "unregistered"; readonly serial: string }
  | { readonly kind: "registered"; readonly serial: string; readonly name: string };

const UNKNOWN: Registration = { kind: "unknown" };

/**
 * Two sentences, not one. At rollout essentially every pair in existence is
 * pre-serial, so that is the whole population for a while and "update your
 * firmware" is the only actionable thing to say. The all-zero case is two
 * register reads away from impossible, and telling that person to update
 * firmware sends them on an errand that cannot succeed (§7.3).
 */
const REASONS = {
  "pre-serial":
    "These ears are running firmware from before ears could identify themselves — their firmware needs updating before you can register them.",
  unidentified:
    "These ears couldn't identify themselves, so there's nothing to register them under.",
} as const satisfies Record<Exclude<DeviceIdentity["kind"], "serial">, string>;

export function resolveRegistration(
  state: EarsConnectionState,
  devices: readonly Device[] | null,
): Registration {
  if (state.status !== "connected") return UNKNOWN;

  const { identity } = state.capability;
  // ordered before the list check on purpose: the reason is a fact about the
  // ears, not about the list, so it survives a fetch we could not make — and
  // "cannot be registered" is never a false "unregistered", which is the only
  // thing §10.6's null branch is protecting against
  if (identity.kind !== "serial") {
    return { kind: "unregisterable", reason: REASONS[identity.kind] };
  }

  // null is "we could not find out" and empty is "you have registered nothing";
  // under the first, saying "unregistered" nags someone about ears they named
  // months ago (§10.6)
  if (devices === null) return UNKNOWN;

  const registered = devices.find((device) => device.serial === identity.serial);
  return registered === undefined
    ? { kind: "unregistered", serial: identity.serial }
    : { kind: "registered", serial: identity.serial, name: registered.name };
}

/**
 * The pair the registration modal should be asking about, or `null`.
 *
 * **Derived, never fired** (§10.4). Nothing signals "now prompt" out of
 * `connect()` — that would make the connection depend on the logged-in user,
 * the tRPC device list and `localStorage`, the exact coupling §4 refused when
 * it kept name resolution off the connect path. Nor does an `$effect` run on
 * the connect transition: an effect fires once, at connect, and these inputs
 * need not all be ready at that instant, so it would have to sequence itself
 * against a pending fetch — a race inside the moment. A derived value becomes
 * true when its inputs agree, whenever that is.
 *
 * The consequence is what makes closing free in every direction: Save pushes
 * the row into the store, "Not now" writes the key, a disconnect drops the
 * connected state, and each flips this to `null` on its own. Nothing ever
 * writes `open = false`, so no dialog can be left open against a connection
 * that is gone — and **a closing gesture that writes nothing cannot close the
 * dialog**, which is why Esc and the backdrop dismiss rather than merely hide.
 *
 * This is the one place a dismissal is read; `resolveRegistration` above never
 * sees one, so the profile page's register row cannot be silenced by it.
 */
export function registrationPrompt(
  registration: Registration,
  storage: DismissalStorage,
  userId: string | null,
): { readonly serial: string } | null {
  if (registration.kind !== "unregistered" || userId === null) return null;
  if (isDismissed(storage, userId, registration.serial)) return null;

  return { serial: registration.serial };
}
