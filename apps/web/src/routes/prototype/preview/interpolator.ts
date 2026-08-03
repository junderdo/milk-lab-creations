// PROTOTYPE — firmware-faithful interpolator, transcribed from
// docs/research/firmware-easing.md (branch research/firmware-easing).
// Mirrors robo-cat-ears main/custom_animation.c exactly.

export type EaseType = 0 | 1 | 2 | 3; // none | sine | cubic | elastic

export interface Keyframe {
	timeMs: number; // uint16, non-decreasing across keyframes
	angles: [number, number, number, number]; // 0..180 ints
	easeInType: EaseType; // arriving at this keyframe
	easeOutType: EaseType; // departing this keyframe
	easeInMs: number; // uint16
	easeOutMs: number; // uint16
}

export interface AnimationPayload {
	schemaVersion: 1;
	keyframes: Keyframe[];
}

const C4 = (2 * Math.PI) / 3;

/** from.easeOutType — easeIn-shaped: starts at rest, accelerates. */
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
			return x; // 0 = linear, and firmware fallback for unknown types
	}
}

/** to.easeInType — easeOut-shaped: decelerates, ends at rest. */
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
	if (keyframes.length === 0) throw new Error('no keyframes');
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

export function durationMs(payload: AnimationPayload): number {
	return payload.keyframes[payload.keyframes.length - 1].timeMs;
}
