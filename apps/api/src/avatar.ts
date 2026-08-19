// The avatar's closed set, dependency-free so the web app can share it without
// pulling the router in — the same split limits.ts already makes.
//
// The stored value is a prefixed token (`preset:cat-01`), never a bare key: the
// prefix is the discriminant, so adding an uploaded variant later is a new
// prefix and no migration. DSQL has neither `SET NOT NULL` nor
// `ALTER COLUMN TYPE`, so `users.avatar` is nullable TEXT forever and the
// shape has to be right the first time.

/** Eight robo-cat-ears colourways. New art is a new key and new art file. */
export const AVATAR_PRESETS = [
  "cat-01",
  "cat-02",
  "cat-03",
  "cat-04",
  "cat-05",
  "cat-06",
  "cat-07",
  "cat-08",
] as const;

export type AvatarPreset = (typeof AVATAR_PRESETS)[number];

export const AVATAR_PRESET_PREFIX = "preset:";

/** The stored token for a preset. The server is the only caller — the client
 *  sends a bare key, so it can never author the variant. */
export function presetToken(preset: AvatarPreset): string {
  return `${AVATAR_PRESET_PREFIX}${preset}`;
}
