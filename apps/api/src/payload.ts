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
      (p) => p.keyframes.every((kf, i) => i === 0 || kf.timeMs >= p.keyframes[i - 1]!.timeMs),
      { message: "keyframe times must not move backwards" },
    )
    .refine((p) => new TextEncoder().encode(JSON.stringify(p)).length <= MAX_PAYLOAD_BYTES, {
      message: `payload exceeds ${MAX_PAYLOAD_BYTES} bytes`,
    });
}

export type AnimationPayload = z.infer<ReturnType<typeof payloadSchemaFor>>;

/** Duration is the time of the last keyframe (times are non-decreasing). */
export function derivedScalars(payload: AnimationPayload) {
  const keyframes = payload.keyframes;
  return {
    durationMs: keyframes[keyframes.length - 1]!.timeMs,
    keyframeCount: keyframes.length,
  };
}

/** Bytes per keyframe: time(2) + one per channel + ease types(2) + ease durations(4). */
export function keyframeWireSize(channels: number) {
  return 8 + channels;
}

/**
 * Pack to the firmware wire format (big-endian):
 *   [keyframe_count:1]
 *   then per keyframe:
 *   [time_ms:2][angles[0..3]:1 each][ease_in_type:1][ease_out_type:1]
 *   [ease_in_ms:2][ease_out_ms:2]
 * Must stay bit-compatible with custom_animation_serialize() in
 * github.com/junderdo/robo-cat-ears.
 */
export function packWireFormat(payload: AnimationPayload): Uint8Array {
  const channels = payload.keyframes[0]!.angles.length;
  const out = new Uint8Array(1 + payload.keyframes.length * keyframeWireSize(channels));
  out[0] = payload.keyframes.length;
  let offset = 1;
  for (const kf of payload.keyframes) {
    out[offset++] = (kf.timeMs >> 8) & 0xff;
    out[offset++] = kf.timeMs & 0xff;
    for (const angle of kf.angles) out[offset++] = angle;
    out[offset++] = kf.easeInType;
    out[offset++] = kf.easeOutType;
    out[offset++] = (kf.easeInMs >> 8) & 0xff;
    out[offset++] = kf.easeInMs & 0xff;
    out[offset++] = (kf.easeOutMs >> 8) & 0xff;
    out[offset++] = kf.easeOutMs & 0xff;
  }
  return out;
}
