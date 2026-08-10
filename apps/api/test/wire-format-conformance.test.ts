// Golden-byte conformance against docs/spec/wire-format-fixture.json, the
// canonical fixture the firmware's custom_animation_serialize is also tested
// against (github.com/junderdo/robo-cat-ears, test/wire_format_conformance.c).
// If this fails, packWireFormat has changed shape and the firmware no longer
// agrees with it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { packWireFormat } from "../src/wire-format.ts";

const fixtureUrl = new URL("../../../docs/spec/wire-format-fixture.json", import.meta.url);

const fixtureSchema = z.object({
  channels: z.number(),
  keyframeWireSize: z.number(),
  maxKeyframes: z.number(),
  cases: z
    .array(
      z.object({
        name: z.string(),
        payload: z.object({
          keyframes: z
            .array(
              z.object({
                timeMs: z.number(),
                angles: z.array(z.number()),
                easeInType: z.number(),
                easeOutType: z.number(),
                easeInMs: z.number(),
                easeOutMs: z.number(),
              }),
            )
            .nonempty(),
        }),
        hex: z.array(z.string()).nonempty(),
      }),
    )
    .nonempty(),
});

const fixture = fixtureSchema.parse(
  JSON.parse(readFileSync(fileURLToPath(fixtureUrl), "utf8")) as unknown,
);

function toHex(bytes: Uint8Array) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("wire format conformance fixture", () => {
  it.each(fixture.cases)("packs $name to the fixture bytes", (testCase) => {
    expect(toHex(packWireFormat(testCase.payload))).toBe(testCase.hex.join(""));
  });

  // Guards the fixture itself: regenerating it with the edges missing would leave
  // both repos green while testing nothing interesting.
  it("covers the edges the firmware cares about", () => {
    const keyframeCounts = fixture.cases.map((c) => c.payload.keyframes.length);
    const keyframes = fixture.cases.flatMap((c) => c.payload.keyframes);
    const maxCase = fixture.cases.find((c) => c.payload.keyframes.length === fixture.maxKeyframes);
    const uint16Max = 0xffff;

    expect(keyframeCounts).toContain(1);
    expect(keyframeCounts).toContain(fixture.maxKeyframes);
    expect(maxCase?.hex.join("").length).toBe(
      2 * (1 + fixture.maxKeyframes * fixture.keyframeWireSize),
    );
    expect(keyframes.flatMap((kf) => kf.angles)).toEqual(expect.arrayContaining([0, 180]));
    expect(new Set(keyframes.map((kf) => kf.easeInType))).toEqual(new Set([0, 1, 2, 3]));
    expect(new Set(keyframes.map((kf) => kf.easeOutType))).toEqual(new Set([0, 1, 2, 3]));
    expect(keyframes.some((kf) => kf.easeInMs === uint16Max && kf.easeOutMs === uint16Max)).toBe(
      true,
    );
    expect(
      fixture.cases.some((c) =>
        c.payload.keyframes.some(
          (kf, i) => i > 0 && kf.timeMs === c.payload.keyframes[i - 1]?.timeMs,
        ),
      ),
    ).toBe(true);
  });
});
