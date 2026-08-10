// The binary form an animation takes on the wire — the one place it is written.
//
// Split out from payload.ts, which builds the zod schemas around it, because the
// web app packs animations in the browser before sending them to a pair of ears
// and should not ship a validation library to do it. Same precedent as
// limits.ts. Nothing here imports anything.
//
// Must stay bit-compatible with custom_animation_serialize() in
// github.com/junderdo/robo-cat-ears.

/**
 * The shape packing needs, which is the structural core of `AnimationPayload`.
 * Stated here rather than imported so this module stays zod-free; payload.ts
 * proves the two agree by passing its own type to `packWireFormat`.
 */
export interface WireKeyframe {
  readonly timeMs: number;
  readonly angles: readonly number[];
  readonly easeInType: number;
  readonly easeOutType: number;
  readonly easeInMs: number;
  readonly easeOutMs: number;
}

export interface WireAnimation {
  readonly keyframes: readonly WireKeyframe[];
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
 */
export function packWireFormat(payload: WireAnimation): Uint8Array {
  const first = payload.keyframes[0];
  if (first === undefined) throw new Error("cannot pack an animation with no keyframes");

  const out = new Uint8Array(1 + payload.keyframes.length * keyframeWireSize(first.angles.length));
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
