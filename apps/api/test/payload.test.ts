import { describe, expect, it } from "vitest";
import { derivedScalars } from "../src/payload.ts";

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
