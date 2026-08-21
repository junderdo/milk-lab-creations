/**
 * Whether the pair currently connected is one the user has registered — decided
 * once, for the chip, the modal and the profile page's register row.
 *
 * **Dismissals are deliberately not an input.** Only `registrationPrompt` below
 * consults them, which is what makes "a dismissal silences the prompt, never
 * the feature" structural: the profile page cannot hide its own register row on
 * a dismissal, because it never sees one.
 *
 * `docs/spec/profile-and-devices.md` §10.3.
 */

import type { EarsConnectionState } from "$lib/ears/connection-state";
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
 * Two sentences, not one: firmware-behind is fixable and cannot-identify is
 * not, so collapsing them sends one of the two users on an errand that cannot
 * succeed (§7.3).
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
  // before the list check on purpose: the reason is a fact about the ears, not
  // about the list, so it survives a fetch we could not make. Deviates from
  // §10.6's literal "null resolves to unknown" — see the PR description.
  if (identity.kind !== "serial") {
    return { kind: "unregisterable", reason: REASONS[identity.kind] };
  }

  // null is "we could not find out", empty is "you have registered nothing" —
  // saying "unregistered" under the first nags someone about ears they named
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
 * Derived, never fired (§10.4): a signal out of `connect()` would make the
 * connection depend on the logged-in user, the device list and `localStorage`,
 * and an `$effect` on the connect transition would fire before those inputs
 * are necessarily ready. A derived value becomes true when they agree, whenever
 * that is.
 *
 * The consequence is that every outcome closes the dialog by flipping this to
 * `null`, and nothing ever writes `open = false` — which is why a gesture that
 * writes nothing, Esc included, has to dismiss rather than merely hide.
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
