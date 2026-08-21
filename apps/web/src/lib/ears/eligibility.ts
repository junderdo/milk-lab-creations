/**
 * Whether "Send to my ears" can do anything yet, and the sentence to render
 * when it cannot — the button stays visible and disabled, because a missing
 * button is a mystery and a whole chunked transfer to learn `TOO_LARGE` is a
 * worse answer than the specific number.
 *
 * These limits are UX only, never a trust boundary: the ears validate
 * identically whatever this says.
 */

import { ROBOT_PROFILES } from "@milklab/api/limits";
import type { EarsConnectionState } from "./connection-state";

/** The only robot the store surface exists for at protocol version 1. */
export const EARS_ROBOT_SLUG = "robo-cat-ears";

export interface SendableAnimation {
  readonly robotSlug: string | undefined;
  /** What the row says the animation has. */
  readonly keyframeCount: number;
  /**
   * What the browser could actually parse out of the payload, and therefore
   * what it would pack. Short of `keyframeCount` means sending a different
   * animation than the one on the page, so it refuses rather than truncating.
   */
  readonly readableKeyframeCount: number;
}

export interface SendVerdict {
  readonly canSend: boolean;
  readonly reason: string | null;
}

const CAN_SEND: SendVerdict = { canSend: true, reason: null };

function refuse(reason: string): SendVerdict {
  return { canSend: false, reason };
}

export function sendEligibility(
  state: EarsConnectionState,
  animation: SendableAnimation,
): SendVerdict {
  // the animation's own problems come first: they outlive any connection, and
  // "connect first" followed by "it never would have fitted" is a wasted trip
  const intrinsic = animationVerdict(animation);
  if (intrinsic !== null) return intrinsic;

  switch (state.status) {
    case "unsupported":
      return refuse(
        "Sending to your ears needs Chrome — on a computer or Android. Firefox can't do it, and neither can iPhone or iPad.",
      );
    case "disconnected":
      return refuse("Connect your ears from the chip in the header first.");
    case "connecting":
      return refuse("Still connecting to your ears…");
    case "connected":
      return CAN_SEND;
    default: {
      const unhandled: never = state;
      throw new Error(`unhandled connection state: ${String(unhandled)}`);
    }
  }
}

function animationVerdict(animation: SendableAnimation): SendVerdict | null {
  if (animation.robotSlug !== EARS_ROBOT_SLUG) {
    return refuse(
      animation.robotSlug === undefined
        ? "This animation doesn't say which robot it's for, so it can't be sent to a pair of ears."
        : `This animation is built for ${animation.robotSlug}, and your ears are ${EARS_ROBOT_SLUG}.`,
    );
  }

  const profile = ROBOT_PROFILES[EARS_ROBOT_SLUG];
  if (profile === undefined) {
    return refuse("This app doesn't know what your ears can hold, so it won't guess.");
  }

  if (animation.keyframeCount < 1) {
    return refuse("This animation has no keyframes, so there's nothing to send.");
  }

  if (animation.keyframeCount > profile.maxKeyframes) {
    return refuse(
      `Your ears hold ${profile.maxKeyframes} keyframes; this one has ${animation.keyframeCount}.`,
    );
  }

  if (animation.readableKeyframeCount !== animation.keyframeCount) {
    return refuse(
      "This app could only read part of this animation, so it won't send a shortened version of it.",
    );
  }

  return null;
}
