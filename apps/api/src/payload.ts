// Animation payload contract: canonical JSON mirroring the firmware keyframe
// struct (robo-cat-ears custom_animation_types.h), validated per robot
// profile; the binary wire format is derived on demand, never stored.
import { z } from "zod";
import { MAX_PAYLOAD_BYTES, MAX_TIME_MS, type RobotProfile } from "./limits.ts";

// The limits themselves live in limits.ts, which the web editor imports
// without dragging zod into the browser bundle. Re-exported so this module
// stays the one place server code asks about the payload contract.
export { MAX_PAYLOAD_BYTES, MAX_TIME_MS, ROBOT_PROFILES } from "./limits.ts";
export type { RobotProfile } from "./limits.ts";

// Likewise the wire codec, which the web app packs with in the browser.
export { keyframeWireSize, packWireFormat } from "./wire-format.ts";

const uint16 = z.number().int().min(0).max(MAX_TIME_MS);

export function payloadSchemaFor(profile: RobotProfile) {
  const keyframe = z.object({
    timeMs: uint16,
    angles: z.array(z.number().int().min(0).max(profile.maxAngle)).length(profile.channels),
    easeInType: z.number().int().min(0).max(profile.maxEaseType),
    easeOutType: z.number().int().min(0).max(profile.maxEaseType),
    easeInMs: uint16,
    easeOutMs: uint16,
  });

  return z
    .object({
      schemaVersion: z.literal(1),
      keyframes: z.array(keyframe).min(1).max(profile.maxKeyframes),
    })
    .refine(
      (p) =>
        p.keyframes.every((kf, i) => {
          const previous = p.keyframes[i - 1];
          return previous === undefined || kf.timeMs >= previous.timeMs;
        }),
      { message: "keyframe times must not move backwards" },
    )
    .refine((p) => new TextEncoder().encode(JSON.stringify(p)).length <= MAX_PAYLOAD_BYTES, {
      message: `payload exceeds ${MAX_PAYLOAD_BYTES} bytes`,
    });
}

export type AnimationPayload = z.infer<ReturnType<typeof payloadSchemaFor>>;

/** Duration is the time of the last keyframe (times are non-decreasing). */
export function derivedScalars(payload: AnimationPayload) {
  const last = payload.keyframes.at(-1);
  // The schema requires at least one keyframe; the type doesn't say so.
  if (last === undefined) throw new Error("animation has no keyframes");
  return {
    durationMs: last.timeMs,
    keyframeCount: payload.keyframes.length,
  };
}
