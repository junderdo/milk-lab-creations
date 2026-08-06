// The numbers a robot's payload must stay inside — the half of the payload
// contract that is plain data.
//
// Split out from payload.ts (which builds the zod schemas around these) because
// the web editor needs the limits to keep every edit inside what the server
// accepts, and it should not have to ship a validation library to learn that a
// keyframe ceiling is 64. Nothing here imports anything.

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
