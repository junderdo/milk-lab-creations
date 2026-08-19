/**
 * Which preset a user's avatar is.
 *
 * There is no "no avatar" state in the domain: a user who has never chosen one
 * still has a face, picked from their id. NULL is absorbed here, at the read
 * boundary, so nothing downstream — header, byline, picker — branches on it,
 * and no backfill ever has to invent a value for a row that predates the
 * column.
 *
 * An unrecognised token is treated the same as none rather than thrown on: a
 * byline must not break because a later build wrote a variant this one has
 * never heard of. That is the rule `visibilityOf` already follows.
 *
 * Deliberately free of asset imports — the art map lives in `art.ts` so this
 * stays a pure module the test suite can run without Vite.
 */

import { AVATAR_PRESETS, AVATAR_PRESET_PREFIX, type AvatarPreset } from "@milklab/api/avatar";

export { AVATAR_PRESETS };
export type { AvatarPreset };

/** A preset off the wire, or `null` for a token this build can't render. */
export function presetOf(token: string): AvatarPreset | null {
  if (!token.startsWith(AVATAR_PRESET_PREFIX)) return null;
  const key = token.slice(AVATAR_PRESET_PREFIX.length);
  return AVATAR_PRESETS.find((preset) => preset === key) ?? null;
}

/** FNV-1a, for a spread over the presets that is stable across sessions and
 *  builds — the same user is the same cat forever, without storing a row. */
function hashOf(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The preset to draw for a user, chosen from their id when none is stored. */
export function avatarOf(token: string | null | undefined, userId: string): AvatarPreset {
  const chosen = token ? presetOf(token) : null;
  return chosen ?? AVATAR_PRESETS[hashOf(userId) % AVATAR_PRESETS.length];
}
