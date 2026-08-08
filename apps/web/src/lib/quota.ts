/**
 * The per-user animation cap, as the UI needs it: how to say it, when to block
 * a button, and how to recognise the rejection when one gets through anyway.
 *
 * Both guards are needed. The count a page loaded with is a snapshot — another
 * tab, or a remix from a phone, moves it — so the buttons here are a courtesy
 * and the server's FORBIDDEN is the truth. `isAnimationCapError` is what keeps
 * the two saying the same sentence.
 */

import { MAX_ANIMATIONS_PER_USER } from "@milklab/api/limits";

export const ANIMATION_LIMIT = MAX_ANIMATIONS_PER_USER;

export const atAnimationCap = (count: number) => count >= ANIMATION_LIMIT;

/** Amber territory in the counter — the last few before it stops. */
export const nearAnimationCap = (count: number) => count >= ANIMATION_LIMIT - 3;

export const ANIMATION_CAP_MESSAGE = `You've reached your limit of ${ANIMATION_LIMIT} animations. Delete one to make room.`;

/**
 * The cap is the API's only FORBIDDEN: reads answer NOT_FOUND rather than leak
 * a private id's existence, and a missing session is UNAUTHORIZED. Matching the
 * code therefore identifies it exactly, where matching its message would break
 * the first time the wording changed.
 */
export function isAnimationCapError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { data } = error as { data?: unknown };
  if (typeof data !== "object" || data === null) return false;
  return (data as { code?: unknown }).code === "FORBIDDEN";
}
