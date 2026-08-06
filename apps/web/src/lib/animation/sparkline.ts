/**
 * Curve geometry for animation sparklines — payload in, SVG path data out.
 *
 * Cards never mount a 3D viewer (WebGL contexts are a scarce per-page resource
 * and a list is exactly where you'd run out), so a card shows its motion as the
 * same curves the graph editor draws. Those curves come from `sample` in
 * `interpolator.ts` — the function that poses the model — so a sparkline can
 * never disagree with what the robot does.
 *
 * Pure and DOM-free, like the interpolator: the component around it only picks
 * colours and a viewBox.
 */

import { durationMs, sample, type Keyframe } from "./interpolator";

/** The coordinate space the paths are drawn in — an SVG viewBox, in effect. */
export interface SparklineBox {
  width: number;
  height: number;
}

export interface SparklineOptions {
  /** Evenly spaced samples across the duration; keyframe times are added on top. */
  samples?: number;
}

/** Enough to keep elastic overshoot legible at card size without bloating markup. */
const DEFAULT_SAMPLES = 48;

const MAX_ANGLE = 180;

/** Two decimals is below a device pixel at any card size we render. */
function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Times to evaluate the animation at: an even sweep plus every keyframe time.
 *
 * The even sweep alone can step straight over a short hold — a 20 ms blip in a
 * 5 s animation lands between samples — and those blips are exactly the
 * character a sparkline is meant to show.
 */
function sampleTimes(keyframes: Keyframe[], total: number, samples: number): number[] {
  const times = new Set<number>();
  const steps = Math.max(2, Math.floor(samples));
  for (let i = 0; i < steps; i++) {
    times.add((total * i) / (steps - 1));
  }
  for (const frame of keyframes) {
    if (frame.timeMs >= 0 && frame.timeMs <= total) times.add(frame.timeMs);
  }
  return [...times].sort((a, b) => a - b);
}

/** A pose and the x it sits at — the curves are these, read channel by channel. */
interface Plot {
  x: number;
  pose: number[];
}

function plots(keyframes: Keyframe[], box: SparklineBox, samples: number): Plot[] {
  const total = durationMs(keyframes);
  if (total <= 0) {
    // no duration to spread over: hold the one pose across the whole width, so a
    // single-keyframe animation still reads as a card rather than an empty box
    const pose = sample(keyframes, 0);
    return [
      { x: 0, pose },
      { x: roundCoord(box.width), pose },
    ];
  }
  return sampleTimes(keyframes, total, samples).map((t) => ({
    x: roundCoord((t / total) * box.width),
    pose: sample(keyframes, t),
  }));
}

/**
 * One SVG path `d` string per channel, over `box`.
 *
 * Angles map bottom-to-top (0° at `height`, 180° at 0) so the curves read the
 * way the editor's 0–180 axis does. The channel count is whatever the
 * interpolator poses — nothing here invents an angle it didn't return.
 */
export function channelPaths(
  keyframes: Keyframe[],
  box: SparklineBox,
  options: SparklineOptions = {},
): string[] {
  if (keyframes.length === 0) return []; // nothing to sample — `sample` would throw

  const points = plots(keyframes, box, options.samples ?? DEFAULT_SAMPLES);
  const channels = points.reduce((widest, { pose }) => Math.max(widest, pose.length), 0);

  return Array.from({ length: channels }, (_unused, channel) => {
    let d = "";
    for (const { x, pose } of points) {
      const angle = pose[channel];
      if (angle === undefined) continue; // a pose that doesn't drive this channel leaves a gap
      const y = roundCoord(box.height - (angle / MAX_ANGLE) * box.height);
      d += `${d === "" ? "M" : "L"}${x} ${y}`;
    }
    return d;
  });
}
