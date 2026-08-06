import { describe, expect, it } from "vitest";
import { durationMs, sample, segmentProgress, type Keyframe } from "./interpolator";

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

/** Two keyframes 1000 ms apart moving channel 0 from 0° to 180°. */
function pair(from: Partial<Keyframe>, to: Partial<Keyframe>): [Keyframe, Keyframe] {
  return [
    kf({ timeMs: 0, angles: [0, 90, 90, 90], ...from }),
    kf({ timeMs: 1000, angles: [180, 90, 90, 90], ...to }),
  ];
}

describe("segmentProgress", () => {
  it("reaches exactly the midpoint at the end of the departure window", () => {
    const [from, to] = pair({ easeOutMs: 400 }, { easeInMs: 400 });
    // the departure window shapes progress 0 → 0.5; at its far edge we are at 0.5
    expect(segmentProgress(from, to, 400)).toBeCloseTo(0.5, 10);
  });

  it("holds at 0.5 between the two windows", () => {
    const [from, to] = pair({ easeOutMs: 200 }, { easeInMs: 200 });
    for (const t of [200, 400, 600, 799]) {
      expect(segmentProgress(from, to, t)).toBe(0.5);
    }
  });

  it("scales over-length windows down proportionally", () => {
    // 800 + 800 = 1600 asked for in a 1000 ms segment → scale 0.625, so the
    // departure window becomes 500 ms and the two windows exactly fill it.
    const [from, to] = pair({ easeOutMs: 800 }, { easeInMs: 800 });
    expect(segmentProgress(from, to, 500)).toBeCloseTo(0.5, 10);
    expect(segmentProgress(from, to, 250)).toBeCloseTo(0.25, 10); // linear, half-way through depart
    expect(segmentProgress(from, to, 750)).toBeCloseTo(0.75, 10);
  });

  it("holds at 0.5 for the whole segment when both windows are zero", () => {
    const [from, to] = pair({ easeOutMs: 0 }, { easeInMs: 0 });
    expect(segmentProgress(from, to, 0)).toBe(0.5);
    expect(segmentProgress(from, to, 999)).toBe(0.5);
    expect(segmentProgress(from, to, 1000)).toBe(1); // end-of-segment snap
  });

  it("snaps straight to the destination across a zero-length segment", () => {
    const [from, to] = pair({ timeMs: 500 }, { timeMs: 500, easeInMs: 300 });
    expect(segmentProgress(from, to, 0)).toBe(1);
  });

  it("lands exactly on 1 at segment end regardless of easing", () => {
    for (const type of [0, 1, 2, 3] as const) {
      const [from, to] = pair(
        { easeOutMs: 300, easeOutType: type },
        { easeInMs: 300, easeInType: type },
      );
      expect(segmentProgress(from, to, 1000)).toBe(1);
    }
  });

  it("shapes the departure window with the FROM keyframe's easeOutType", () => {
    // cubic depart: p = 0.5 * x³, so at x = 0.5 through the window p = 0.5 * 0.125
    const [from, to] = pair({ easeOutMs: 400, easeOutType: 2 }, { easeInMs: 400 });
    expect(segmentProgress(from, to, 200)).toBeCloseTo(0.5 * 0.125, 10);
  });

  it("shapes the arrival window with the TO keyframe's easeInType", () => {
    // cubic arrive: p = 0.5 + 0.5 * (1 − (1−x)³); at x = 0.5 that is 0.5 + 0.5*0.875
    const [from, to] = pair({ easeOutMs: 400 }, { easeInMs: 400, easeInType: 2 });
    expect(segmentProgress(from, to, 800)).toBeCloseTo(0.5 + 0.5 * 0.875, 10);
  });

  it("lets elastic overshoot the 0..1 range — the curve is never clamped", () => {
    const [from, to] = pair({ easeOutMs: 500, easeOutType: 3 }, { easeInMs: 500, easeInType: 3 });
    const samples = Array.from({ length: 500 }, (_, t) => segmentProgress(from, to, t));
    expect(Math.min(...samples)).toBeLessThan(0); // elastic winds up below the start
  });
});

describe("sample", () => {
  it("clamps elastic overshoot on the angle, after interpolation", () => {
    // channel 0 travels 0 → 180; elastic depart dips below 0, which would take
    // the angle negative if the clamp were missing
    const [from, to] = pair({ easeOutMs: 500, easeOutType: 3 }, { easeInMs: 500, easeInType: 3 });
    for (let t = 0; t <= 1000; t += 5) {
      const [ch0] = sample([from, to], t);
      expect(ch0).toBeGreaterThanOrEqual(0);
      expect(ch0).toBeLessThanOrEqual(180);
    }
    // and the overshoot really is being clamped, not merely absent
    const dipped = Array.from({ length: 200 }, (_, t) => sample([from, to], t)[0]);
    expect(Math.min(...dipped)).toBe(0);
  });

  it("returns the exact final pose at and past the last keyframe", () => {
    const [from, to] = pair({ easeOutMs: 300 }, { easeInMs: 300, angles: [12, 34, 56, 78] });
    expect(sample([from, to], 1000)).toEqual([12, 34, 56, 78]);
    expect(sample([from, to], 5000)).toEqual([12, 34, 56, 78]);
  });

  it("applies the first keyframe's pose instantly, at and before its time", () => {
    const first = kf({ timeMs: 200, angles: [10, 20, 30, 40] });
    const second = kf({ timeMs: 1200, angles: [180, 180, 180, 180] });
    expect(sample([first, second], 0)).toEqual([10, 20, 30, 40]);
    expect(sample([first, second], 200)).toEqual([10, 20, 30, 40]);
  });

  it("interpolates every channel independently", () => {
    const from = kf({ timeMs: 0, angles: [0, 180, 90, 45], easeOutMs: 500 });
    const to = kf({ timeMs: 1000, angles: [180, 0, 90, 135], easeInMs: 500 });
    // halfway through the departure window's far edge → p = 0.5 on every channel
    expect(sample([from, to], 500)).toEqual([90, 90, 90, 90]);
  });

  it("holds the single pose of a one-keyframe animation", () => {
    const only = kf({ timeMs: 0, angles: [1, 2, 3, 4] });
    expect(sample([only], 0)).toEqual([1, 2, 3, 4]);
    expect(sample([only], 9999)).toEqual([1, 2, 3, 4]);
  });

  it("walks multi-segment animations to the right segment", () => {
    const frames = [
      kf({ timeMs: 0, angles: [0, 0, 0, 0] }),
      kf({ timeMs: 1000, angles: [100, 0, 0, 0] }),
      kf({ timeMs: 2000, angles: [180, 0, 0, 0] }),
    ];
    expect(sample(frames, 1000)).toEqual([100, 0, 0, 0]); // exactly on the middle keyframe
    expect(sample(frames, 1500)[0]).toBeCloseTo(140, 10); // midpoint hold of segment 2
  });

  it("throws on an empty keyframe list rather than returning a bogus pose", () => {
    expect(() => sample([], 0)).toThrow();
  });
});

describe("durationMs", () => {
  it("is the last keyframe's time", () => {
    expect(durationMs([kf({ timeMs: 0 }), kf({ timeMs: 1750 })])).toBe(1750);
  });

  it("is zero for an empty animation", () => {
    expect(durationMs([])).toBe(0);
  });
});
