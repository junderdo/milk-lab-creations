// Every number an animation must stay inside — the half of the contract that is
// plain data, with no schema wrapped around it.
//
// Split out from payload.ts and router.ts (which build the zod schemas around
// these) because the web editor needs the same numbers to keep every edit
// inside what the server accepts, and it should not have to ship a validation
// library to learn that a keyframe ceiling is 64. An editor that clamps to a
// hand-copied limit is an editor that drifts. Nothing here imports anything.

export interface RobotProfile {
  channels: number;
  maxKeyframes: number;
  maxAngle: number;
  maxEaseType: number;
}

/** Validation profiles keyed by robots.slug. New robots arrive by migration. */
export const ROBOT_PROFILES: Record<string, RobotProfile> = {
  "robo-cat-ears": { channels: 4, maxKeyframes: 64, maxAngle: 180, maxEaseType: 3 },
};

/** Defense-in-depth ceiling on the serialized payload, far above real use. */
export const MAX_PAYLOAD_BYTES = 32 * 1024;

/** Keyframe and easing times are uint16 in the firmware struct. */
export const MAX_TIME_MS = 65535;

/**
 * Per-user animation cap, counting originals and remixes alike — a remix is a
 * row owned by whoever forked it. Here rather than in router.ts so the web app
 * can warn before the work instead of after the save.
 */
export const MAX_ANIMATIONS_PER_USER = 30;

/**
 * A device serial is 12 lowercase hex characters — the first six bytes of the
 * derivation in `docs/adr/0002-how-a-pair-of-ears-is-identified.md`. Uppercase
 * is rejected at the boundary rather than normalized; a client that receives a
 * hex string normalizes before the schema sees it.
 */
export const SERIAL_HEX_CHARS = 12;

/** Animation name: trimmed, 1–100 characters. */
export const NAME_MAX = 100;

/** Animation description: trimmed, at most 1000 characters. */
export const DESCRIPTION_MAX = 1000;
