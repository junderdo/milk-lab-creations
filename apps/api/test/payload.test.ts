// Byte-vector tests for the wire codec: must stay bit-compatible with
// custom_animation_serialize() in github.com/junderdo/robo-cat-ears.
import { describe, expect, it } from "vitest";
import { derivedScalars, keyframeWireSize, packWireFormat } from "../src/payload.ts";

describe("packWireFormat", () => {
  it("packs a single keyframe to the firmware byte layout", () => {
    const wire = packWireFormat({
      schemaVersion: 1,
      keyframes: [
        {
          timeMs: 0x1234,
          angles: [10, 20, 30, 40],
          easeInType: 1,
          easeOutType: 3,
          easeInMs: 0x0102,
          easeOutMs: 0x0a0b,
        },
      ],
    });
    expect([...wire]).toEqual([
      1, // keyframe_count
      0x12,
      0x34, // time_ms big-endian
      10,
      20,
      30,
      40, // left_azi, left_lat, right_azi, right_lat
      1,
      3, // ease_in_type, ease_out_type
      0x01,
      0x02, // ease_in_ms
      0x0a,
      0x0b, // ease_out_ms
    ]);
  });

  it("hits the firmware max serialized size at 64 keyframes", () => {
    const keyframes = Array.from({ length: 64 }, (_, i) => ({
      timeMs: i,
      angles: [0, 0, 0, 0],
      easeInType: 0,
      easeOutType: 0,
      easeInMs: 0,
      easeOutMs: 0,
    }));
    const wire = packWireFormat({ schemaVersion: 1, keyframes });
    // CUSTOM_ANIMATION_MAX_SERIALIZED_SIZE = 1 + 64 * 12 = 769
    expect(wire.length).toBe(769);
    expect(keyframeWireSize(4)).toBe(12);
  });
});

describe("derivedScalars", () => {
  it("takes duration from the last keyframe", () => {
    const scalars = derivedScalars({
      schemaVersion: 1,
      keyframes: [
        {
          timeMs: 0,
          angles: [0, 0, 0, 0],
          easeInType: 0,
          easeOutType: 0,
          easeInMs: 0,
          easeOutMs: 0,
        },
        {
          timeMs: 2500,
          angles: [0, 0, 0, 0],
          easeInType: 0,
          easeOutType: 0,
          easeInMs: 0,
          easeOutMs: 0,
        },
      ],
    });
    expect(scalars).toEqual({ durationMs: 2500, keyframeCount: 2 });
  });
});
