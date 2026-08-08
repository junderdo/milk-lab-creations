import { describe, expect, it } from "vitest";
import { hitTest, type HitAreas, type HitCandidates } from "./hit-test";

const areas: HitAreas = { radiusPx: 22, gripBandBottomPx: 30 };

const candidates: HitCandidates = {
  grips: [
    { index: 0, x: 100, y: 8 },
    { index: 1, x: 300, y: 8 },
  ],
  dots: [
    { index: 0, channel: 0, x: 100, y: 200 },
    { index: 0, channel: 1, x: 100, y: 220 },
    { index: 1, channel: 0, x: 300, y: 120 },
  ],
};

const empty: HitCandidates = { grips: [], dots: [] };

describe("hitTest", () => {
  it("scrubs when nothing is near enough", () => {
    expect(hitTest({ x: 500, y: 300 }, candidates, areas)).toEqual({ kind: "scrub" });
    expect(hitTest({ x: 100, y: 200 }, empty, areas)).toEqual({ kind: "scrub" });
  });

  it("takes a dot pressed within the hit radius, not only dead on it", () => {
    expect(hitTest({ x: 112, y: 208 }, candidates, areas)).toEqual({
      kind: "dot",
      index: 0,
      channel: 0,
    });
  });

  // the whole point of resolving by distance rather than by what is on top:
  // stacked dots are 20px apart and both hit areas cover the press
  it("gives stacked dots to the nearest centre", () => {
    expect(hitTest({ x: 100, y: 206 }, candidates, areas)).toMatchObject({ channel: 0 });
    expect(hitTest({ x: 100, y: 214 }, candidates, areas)).toMatchObject({ channel: 1 });
  });

  it("only counts channels it was given, so hiding one hands its dots to the neighbour", () => {
    const visible: HitCandidates = {
      grips: candidates.grips,
      dots: candidates.dots.filter((dot) => dot.channel !== 0),
    };
    expect(hitTest({ x: 100, y: 206 }, visible, areas)).toMatchObject({ channel: 1 });
  });

  it("takes a grip pressed anywhere in its strip, down to the band's bottom", () => {
    expect(hitTest({ x: 108, y: 2 }, candidates, areas)).toEqual({ kind: "grip", index: 0 });
    expect(hitTest({ x: 108, y: 29 }, candidates, areas)).toEqual({ kind: "grip", index: 0 });
  });

  it("stops owning the strip below the band, so the canvas scrubs there", () => {
    expect(hitTest({ x: 108, y: 31 }, candidates, areas)).toEqual({ kind: "scrub" });
  });

  it("resolves ambiguous columns by which grip centre is nearer", () => {
    expect(hitTest({ x: 118, y: 10 }, candidates, areas)).toEqual({ kind: "grip", index: 0 });
    expect(hitTest({ x: 282, y: 10 }, candidates, areas)).toEqual({ kind: "grip", index: 1 });
  });

  it("gives a dot the press when a grip is no nearer", () => {
    const overlapping: HitCandidates = {
      grips: [{ index: 0, x: 100, y: 8 }],
      dots: [{ index: 0, channel: 2, x: 100, y: 20 }],
    };
    expect(hitTest({ x: 100, y: 20 }, overlapping, areas)).toEqual({
      kind: "dot",
      index: 0,
      channel: 2,
    });
    // dead centre between the two, which is the tie the rule exists for
    expect(hitTest({ x: 100, y: 14 }, overlapping, areas)).toMatchObject({ kind: "dot" });
  });
});
