import { describe, expect, it } from "vitest";
import { channelPaths, type SparklineBox } from "./sparkline";
import type { Keyframe } from "./interpolator";

/** A keyframe with everything defaulted; override only what the case is about. */
function kf(overrides: Partial<Keyframe> = {}): Keyframe {
  return {
    timeMs: 0,
    angles: [90, 90, 90, 90],
    easeInType: 0,
    easeOutType: 0,
    easeInMs: 0,
    easeOutMs: 0,
    ...overrides,
  };
}

/** A box whose numbers make the mapping easy to read: 0° → y 100, 180° → y 0. */
const box: SparklineBox = { width: 100, height: 100 };

/** Every "x,y" pair in a path command string, as numbers. */
function points(path: string): Array<[number, number]> {
  return path
    .slice(1) // drop the leading M
    .split("L")
    .map((pair) => {
      const [x, y] = pair.trim().split(" ").map(Number);
      // Number() yields NaN, not undefined, for junk — check both
      if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error(`unparsable point: ${pair}`);
      }
      return [x, y];
    });
}

describe("channelPaths", () => {
  it("returns one path per channel", () => {
    const paths = channelPaths([kf({ timeMs: 0 }), kf({ timeMs: 1000 })], box);
    expect(paths).toHaveLength(4);
  });

  it("returns nothing for an animation with no keyframes", () => {
    expect(channelPaths([], box)).toEqual([]);
  });

  it("maps 0° to the bottom edge and 180° to the top edge", () => {
    const [floor, ceiling] = channelPaths(
      [kf({ timeMs: 0, angles: [0, 180] }), kf({ timeMs: 1000, angles: [0, 180] })],
      box,
    );
    if (floor === undefined || ceiling === undefined) throw new Error("expected two channels");
    expect(points(floor).every(([, y]) => y === 100)).toBe(true);
    expect(points(ceiling).every(([, y]) => y === 0)).toBe(true);
  });

  it("spans the full width, first sample to last", () => {
    const [path] = channelPaths([kf({ timeMs: 0 }), kf({ timeMs: 1000 })], box);
    if (path === undefined) throw new Error("expected a path");
    const xs = points(path).map(([x]) => x);
    expect(xs[0]).toBe(0);
    expect(xs[xs.length - 1]).toBe(100);
  });

  it("draws a flat line across the box for a zero-length animation", () => {
    // one keyframe (or several at the same time) has no duration to spread over,
    // but the card still wants a curve rather than an empty box
    const [path] = channelPaths([kf({ angles: [45] })], box);
    expect(path).toBe("M0 75L100 75");
  });

  it("follows the interpolator's midpoint hold rather than a straight lerp", () => {
    // 0° → 180° with 200 ms windows at both ends: the interpolator holds at
    // exactly halfway (90° → y 50) through the middle of the segment
    const paths = channelPaths(
      [
        kf({ timeMs: 0, angles: [0], easeOutMs: 200 }),
        kf({ timeMs: 1000, angles: [180], easeInMs: 200 }),
      ],
      box,
    );
    const [path] = paths;
    if (path === undefined) throw new Error("expected a path");
    const midpoint = points(path).filter(([x]) => x >= 30 && x <= 70);
    expect(midpoint.length).toBeGreaterThan(0);
    expect(midpoint.every(([, y]) => y === 50)).toBe(true);
  });

  it("samples every keyframe time so short holds are not skipped", () => {
    // a 20 ms blip inside a 5 s animation falls between evenly spaced samples;
    // including keyframe times keeps it in the curve
    const paths = channelPaths(
      [
        kf({ timeMs: 0, angles: [0] }),
        kf({ timeMs: 2500, angles: [180] }),
        kf({ timeMs: 2520, angles: [0] }),
        kf({ timeMs: 5000, angles: [0] }),
      ],
      box,
      { samples: 8 },
    );
    const [path] = paths;
    if (path === undefined) throw new Error("expected a path");
    expect(points(path).some(([, y]) => y === 0)).toBe(true);
  });

  it("rounds coordinates so the markup stays small", () => {
    const [path] = channelPaths([kf({ timeMs: 0 }), kf({ timeMs: 3000 })], box, { samples: 7 });
    if (path === undefined) throw new Error("expected a path");
    for (const coordinate of path.match(/[\d.]+/g) ?? []) {
      expect(coordinate).toMatch(/^\d+(\.\d{1,2})?$/);
    }
  });

  it("respects the requested sample count", () => {
    const [path] = channelPaths([kf({ timeMs: 0 }), kf({ timeMs: 1000 })], box, { samples: 5 });
    if (path === undefined) throw new Error("expected a path");
    expect(points(path)).toHaveLength(5);
  });

  it("draws a wider window than the animation when asked, holding the last pose", () => {
    // the graph editor leaves headroom past the last column; the tail out there
    // is the final pose held, which is what the robot does
    const [path] = channelPaths(
      [kf({ timeMs: 0, angles: [0] }), kf({ timeMs: 1000, angles: [180] })],
      box,
      { samples: 3, overMs: 2000 },
    );
    if (path === undefined) throw new Error("expected a path");
    expect(points(path)).toEqual([
      [0, 100], // t=0, 0°
      [50, 0], // t=1000, the last keyframe, halfway across the wider window
      [100, 0], // t=2000, still 180° — held, not extrapolated
    ]);
  });

  it("draws only the channels the interpolator poses", () => {
    // payloads are validated per robot profile, so ragged angle arrays shouldn't
    // happen — and if one did, inventing a 0° curve for the extra channel would
    // be a line the robot never moves along
    const paths = channelPaths(
      [kf({ timeMs: 0, angles: [90] }), kf({ timeMs: 1000, angles: [90, 30] })],
      box,
    );
    expect(paths).toHaveLength(1);
  });
});
