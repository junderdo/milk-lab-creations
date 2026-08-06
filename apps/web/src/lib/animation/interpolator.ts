/**
 * Firmware-faithful interpolator for robot keyframe animations.
 *
 * This mirrors `main/custom_animation.c` in the robo-cat-ears firmware exactly;
 * the derivation, per-type formulas, and edge cases are written up in
 * `docs/research/firmware-easing.md`. Keep the two in step — what this module
 * computes is what the physical robot does.
 *
 * Pure and DOM-free on purpose: the 3D viewer poses the model from it and the
 * graph editor draws its curves from it, so the curves and the motion can never
 * disagree.
 */

export type EaseType = 0 | 1 | 2 | 3; // none | sine | cubic | elastic

/** One authored pose plus the easing used to arrive at and depart from it. */
export interface Keyframe {
  timeMs: number; // uint16, non-decreasing across keyframes
  angles: number[]; // one per channel, 0..180 ints
  easeInType: EaseType; // curve used when arriving AT this keyframe
  easeOutType: EaseType; // curve used when departing FROM this keyframe
  easeInMs: number; // uint16, length of the arrival window
  easeOutMs: number; // uint16, length of the departure window
}

const C4 = (2 * Math.PI) / 3;

/** `from.easeOutType` — easeIn-shaped: starts at rest, accelerates. */
function easeDepart(type: EaseType, x: number): number {
  switch (type) {
    case 1:
      return 1 - Math.cos((x * Math.PI) / 2);
    case 2:
      return x * x * x;
    case 3:
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      return -Math.pow(2, 10 * x - 10) * Math.sin((x * 10 - 10.75) * C4);
    default:
      return x; // 0 = linear, and the firmware's fallback for unknown types
  }
}

/** `to.easeInType` — easeOut-shaped: decelerates, ends at rest. */
function easeArrive(type: EaseType, x: number): number {
  switch (type) {
    case 1:
      return Math.sin((x * Math.PI) / 2);
    case 2:
      return 1 - Math.pow(1 - x, 3);
    case 3:
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * C4) + 1;
    default:
      return x;
  }
}

/**
 * Progress 0..1 from `from`'s pose to `to`'s pose, `t` ms into the segment.
 *
 * The shape is: ease out of `from` until the poses are exactly halfway, hold
 * there for as long as the windows leave room, then ease into `to` across the
 * remaining half. The two curves always meet at 0.5 — that midpoint hold is the
 * characteristic the firmware has and a naive lerp doesn't.
 *
 * Elastic can return values outside 0..1; that overshoot is deliberate and is
 * clamped on the angle in `sample`, never here.
 */
export function segmentProgress(from: Keyframe, to: Keyframe, t: number): number {
  const segmentMs = to.timeMs - from.timeMs;
  if (segmentMs <= 0 || t >= segmentMs) return 1; // zero-length segment, or the end-of-segment snap

  let departMs = from.easeOutMs;
  let arriveMs = to.easeInMs;
  if (departMs + arriveMs > segmentMs) {
    // windows that ask for more than the segment shrink together, keeping their
    // ratio, so they exactly fill it and never overlap
    const scale = segmentMs / (departMs + arriveMs);
    departMs *= scale;
    arriveMs *= scale;
  }
  const arriveStart = segmentMs - arriveMs;

  if (t < departMs) return 0.5 * easeDepart(from.easeOutType, t / departMs);
  if (t < arriveStart || arriveMs <= 0) return 0.5; // hold at the halfway pose
  return 0.5 + 0.5 * easeArrive(to.easeInType, (t - arriveStart) / arriveMs);
}

/**
 * Pose of every channel at absolute animation time `tMs`.
 *
 * Before the first keyframe the first pose is held (the firmware takes it up
 * instantly at t = 0); past the last, the last pose is held.
 */
export function sample(keyframes: Keyframe[], tMs: number): number[] {
  const first = keyframes[0];
  if (first === undefined) throw new Error("cannot sample an animation with no keyframes");
  if (tMs <= first.timeMs) return [...first.angles];

  for (let i = 1; i < keyframes.length; i++) {
    const from = keyframes[i - 1];
    const to = keyframes[i];
    if (from === undefined || to === undefined) continue;
    if (tMs <= to.timeMs) {
      const p = segmentProgress(from, to, tMs - from.timeMs);
      return from.angles.map((a, ch) => {
        const target = to.angles[ch] ?? a;
        // clamp AFTER interpolating — elastic overshoots by design, and the
        // servo is what limits it, not the curve
        return Math.min(180, Math.max(0, a + (target - a) * p));
      });
    }
  }

  const last = keyframes[keyframes.length - 1];
  return last === undefined ? [...first.angles] : [...last.angles];
}

/** Total length of the animation — the last keyframe's time. */
export function durationMs(keyframes: Keyframe[]): number {
  return keyframes[keyframes.length - 1]?.timeMs ?? 0;
}
