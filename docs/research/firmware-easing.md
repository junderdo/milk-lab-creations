# Firmware easing semantics (robo-cat-ears custom animations)

Research ticket: pin down the exact interpolation math the robo-cat-ears firmware
applies to custom-animation keyframes, so a web interpolator can mirror it exactly.

## Sources

Local checkout `/home/jeffu/personal/projects/robo-cat-ears`
(remote `git@github-personal:junderdo/robo-cat-ears.git`, i.e.
https://github.com/junderdo/robo-cat-ears, at commit `7b0209fa3f17b4f57d2cbcd2a86f67a8787f680c`):

- `main/types/custom_animation_types.h` — data structures, wire format, validation
- `main/custom_animation.c` — playback loop and easing math
- `main/servo.h` — `SERVO_MAX_ANGLE = 180`

The API's payload contract (`apps/api/src/payload.ts` in this repo) mirrors the
same fields: `timeMs`, 4 angles (0–180 int), `easeInType`/`easeOutType` (0–3),
`easeInMs`/`easeOutMs` (uint16).

## Data model

Per keyframe (`animation_keyframe_t`):

| field | type | meaning |
| --- | --- | --- |
| `time_ms` | uint16 | absolute time of this keyframe, relative to animation start |
| `angles[4]` | uint8 each, 0–180 | target pose (left azi, left lat, right azi, right lat) |
| `ease_in_type` | 0–3 | curve used when **arriving at** this keyframe |
| `ease_out_type` | 0–3 | curve used when **departing** this keyframe |
| `ease_in_ms` | uint16 | duration of the arrival easing window |
| `ease_out_ms` | uint16 | duration of the departure easing window |

Validation on deserialize (`custom_animation_deserialize`): 1–64 keyframes,
angles ≤ 180, ease types ≤ 3, `time_ms` non-decreasing (equal times allowed).

## Ease types

Two curve families exist, chosen by role, not stored separately:

- **Departure** (`ease_depart`, used for the *previous* keyframe's `ease_out_type`):
  ease-**in** shaped — starts at rest, accelerates.
- **Arrival** (`ease_arrive`, used for the *next* keyframe's `ease_in_type`):
  ease-**out** shaped — decelerates, ends at rest.

With `x ∈ [0,1]` normalized progress through the window, `c4 = 2π/3`:

| type | name | depart formula (easeIn) | arrive formula (easeOut) |
| --- | --- | --- | --- |
| 0 | NONE (linear) | `x` | `x` |
| 1 | SINE | `1 − cos(xπ/2)` | `sin(xπ/2)` |
| 2 | CUBIC | `x³` | `1 − (1−x)³` |
| 3 | ELASTIC | `x≤0 → 0; x≥1 → 1; else −2^(10x−10)·sin((10x−10.75)·c4)` | `x≤0 → 0; x≥1 → 1; else 2^(−10x)·sin((10x−0.75)·c4) + 1` |

These are the standard easings.net `easeInSine/Cubic/Elastic` and
`easeOutSine/Cubic/Elastic`. Elastic may return values outside `[0,1]`
(overshoot) — that is intentional; clamping happens on the angle, not the curve.
Any out-of-range type falls back to linear (switch `default`), though
deserialization rejects types > 3 anyway.

## Segment combination rule (the important part)

Playback (`custom_animation_play`) snaps immediately to keyframe 0's pose, then
plays each consecutive pair `(from, to)` as a segment via `play_segment`:

1. `segment_ms = to.time_ms − from.time_ms`. If `segment_ms == 0`: snap
   straight to `to`'s pose.
2. `depart_ms = from.ease_out_ms`, `arrive_ms = to.ease_in_ms`.
   If `depart_ms + arrive_ms > segment_ms`, **both are scaled down
   proportionally**: `scale = segment_ms / (depart_ms + arrive_ms)`.
   Windows never overlap after this.
3. The departure window occupies `[0, depart_ms)` of the segment; the arrival
   window occupies the **tail** `[segment_ms − arrive_ms, segment_ms)`.
4. Overall progress `p ∈ [0,1]` from `from`-pose to `to`-pose, given segment
   time `t`:
   - `t < depart_ms`: `p = 0.5 · easeDepart(from.ease_out_type, t / depart_ms)`
   - `depart_ms ≤ t < segment_ms − arrive_ms` (or `arrive_ms ≤ 0`): `p = 0.5` (**hold at the halfway pose**)
   - otherwise: `p = 0.5 + 0.5 · easeArrive(to.ease_in_type, (t − arrive_start) / arrive_ms)`
5. Per channel: `angle = from + (to − from) · p`, then clamped to `[0, 180]`
   (elastic overshoot is clamped at the servo, not in the curve).
6. Ticking is every 20 ms (`ANIMATION_TICK_MS`, servo PWM frame rate); after
   the loop the firmware **lands exactly on the authored `to` pose**
   (`p = 1.0`) regardless of tick alignment. A web interpolator sampling
   continuously reproduces this by just evaluating the piecewise function, plus
   `p = 1` at `t ≥ segment_ms`.

So each transition goes: ease out of `from` to the **midpoint pose (p = 0.5)**,
optionally hold there, then ease into `to` for the second half of the distance.
The two easings always meet exactly halfway between the poses.

## Edge cases

- **First keyframe**: its pose is applied instantly at t = 0; its `ease_in_*`
  is never used (there is no arrival segment for keyframe 0).
- **Last keyframe**: its `ease_out_*` is never used (nothing departs from it).
- **Zero-length segment** (`to.time_ms == from.time_ms`): instant snap to `to`.
- **`depart_ms == 0`**: no departure window — progress jumps to 0.5 at t = 0
  (the `t < depart_ms` branch never fires), holds, then the arrival easing
  covers the second half. Symmetrically, **`arrive_ms == 0`** holds at 0.5
  until the end-of-segment snap to `p = 1`.
- **Both 0** (`ease_out_ms = ease_in_ms = 0`): the whole segment sits at the
  halfway pose, then snaps to `to` at segment end. Note this is *not* linear
  motion — linear requires nonzero windows with type 0.
- **Overlapping windows**: impossible after the proportional scale-down; the
  windows are made to exactly fill the segment with no hold.
- **Clamping**: only on the final per-channel angle, to `[0, 180]` float,
  before the servo write. `p` itself is never clamped.
- Ease windows longer than uint16 aren't possible (wire format), and windows
  longer than the segment are handled by the scale rule above.

## Reference TypeScript implementation

```ts
export type EaseType = 0 | 1 | 2 | 3; // none | sine | cubic | elastic

export interface Keyframe {
  timeMs: number;          // uint16, non-decreasing across keyframes
  angles: [number, number, number, number]; // 0..180 ints
  easeInType: EaseType;    // arriving at this keyframe
  easeOutType: EaseType;   // departing this keyframe
  easeInMs: number;        // uint16
  easeOutMs: number;       // uint16
}

const C4 = (2 * Math.PI) / 3;

/** from.easeOutType — easeIn-shaped: starts at rest, accelerates. */
function easeDepart(type: EaseType, x: number): number {
  switch (type) {
    case 1: return 1 - Math.cos((x * Math.PI) / 2);
    case 2: return x * x * x;
    case 3:
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      return -Math.pow(2, 10 * x - 10) * Math.sin((x * 10 - 10.75) * C4);
    default: return x; // 0 = linear, and firmware fallback for unknown types
  }
}

/** to.easeInType — easeOut-shaped: decelerates, ends at rest. */
function easeArrive(type: EaseType, x: number): number {
  switch (type) {
    case 1: return Math.sin((x * Math.PI) / 2);
    case 2: return 1 - Math.pow(1 - x, 3);
    case 3:
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * C4) + 1;
    default: return x;
  }
}

/** Progress 0..1 from `from`-pose to `to`-pose at segment-relative time t (ms). */
export function segmentProgress(from: Keyframe, to: Keyframe, t: number): number {
  const segmentMs = to.timeMs - from.timeMs;
  if (segmentMs <= 0 || t >= segmentMs) return 1; // zero-length segment / segment end snap

  let departMs = from.easeOutMs;
  let arriveMs = to.easeInMs;
  if (departMs + arriveMs > segmentMs) {
    const scale = segmentMs / (departMs + arriveMs);
    departMs *= scale;
    arriveMs *= scale;
  }
  const arriveStart = segmentMs - arriveMs;

  if (t < departMs) return 0.5 * easeDepart(from.easeOutType, t / departMs);
  if (t < arriveStart || arriveMs <= 0) return 0.5; // hold at halfway pose
  return 0.5 + 0.5 * easeArrive(to.easeInType, (t - arriveStart) / arriveMs);
}

/** Pose of all four servos at absolute animation time tMs. */
export function sample(keyframes: Keyframe[], tMs: number): [number, number, number, number] {
  if (keyframes.length === 0) throw new Error("no keyframes");
  const first = keyframes[0];
  if (keyframes.length === 1 || tMs <= first.timeMs) return [...first.angles];

  // Find the segment containing tMs; past the end, hold the last pose.
  for (let i = 1; i < keyframes.length; i++) {
    const from = keyframes[i - 1];
    const to = keyframes[i];
    if (tMs <= to.timeMs) {
      const p = segmentProgress(from, to, tMs - from.timeMs);
      return from.angles.map((a, ch) => {
        const angle = a + (to.angles[ch] - a) * p;
        return Math.min(180, Math.max(0, angle)); // clamp elastic overshoot
      }) as [number, number, number, number];
    }
  }
  return [...keyframes[keyframes.length - 1].angles];
}
```

Fidelity notes for exact firmware matching:

- Firmware samples the piecewise function at 20 ms ticks and then snaps to
  `p = 1` at segment end; the continuous `sample()` above is a superset — at
  the firmware's tick times it produces the same values (modulo float32 vs
  float64: firmware uses `float`/`cosf`/`powf`; differences are sub-milli-degree
  and irrelevant at servo resolution).
- Keyframe 0's pose is taken up instantly; `sample(t)` before `keyframes[0].timeMs`
  returns the first pose, matching that behavior for animations whose first
  keyframe is at t = 0 (the usual case).
