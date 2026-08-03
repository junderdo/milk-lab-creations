// PROTOTYPE — throwaway copy of the firmware-faithful interpolator from
// docs/research/firmware-easing.md (branch research/firmware-easing).
// The real implementation will live in $lib when the editor is built.

export type EaseType = 0 | 1 | 2 | 3; // none | sine | cubic | elastic

export interface Keyframe {
	timeMs: number; // uint16, non-decreasing across keyframes
	angles: [number, number, number, number]; // 0..180 ints
	easeInType: EaseType; // arriving at this keyframe
	easeOutType: EaseType; // departing this keyframe
	easeInMs: number; // uint16
	easeOutMs: number; // uint16
}

const C4 = (2 * Math.PI) / 3;

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
			return x;
	}
}

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

export function segmentProgress(from: Keyframe, to: Keyframe, t: number): number {
	const segmentMs = to.timeMs - from.timeMs;
	if (segmentMs <= 0 || t >= segmentMs) return 1;

	let departMs = from.easeOutMs;
	let arriveMs = to.easeInMs;
	if (departMs + arriveMs > segmentMs) {
		const scale = segmentMs / (departMs + arriveMs);
		departMs *= scale;
		arriveMs *= scale;
	}
	const arriveStart = segmentMs - arriveMs;

	if (t < departMs) return 0.5 * easeDepart(from.easeOutType, t / departMs);
	if (t < arriveStart || arriveMs <= 0) return 0.5;
	return 0.5 + 0.5 * easeArrive(to.easeInType, (t - arriveStart) / arriveMs);
}

/** Pose of all four servos at absolute animation time tMs. */
export function sample(keyframes: Keyframe[], tMs: number): [number, number, number, number] {
	if (keyframes.length === 0) throw new Error('no keyframes');
	const first = keyframes[0]!;
	if (keyframes.length === 1 || tMs <= first.timeMs)
		return [...first.angles] as [number, number, number, number];

	for (let i = 1; i < keyframes.length; i++) {
		const from = keyframes[i - 1]!;
		const to = keyframes[i]!;
		if (tMs <= to.timeMs) {
			const p = segmentProgress(from, to, tMs - from.timeMs);
			return from.angles.map((a, ch) => {
				const angle = a + (to.angles[ch]! - a) * p;
				return Math.min(180, Math.max(0, angle));
			}) as [number, number, number, number];
		}
	}
	return [...keyframes[keyframes.length - 1]!.angles] as [number, number, number, number];
}

/** SVG path of channel `ch` over [0, durMs], mapped to a w×h box (y: 180 top, 0 bottom). */
export function channelPath(
	keyframes: Keyframe[],
	ch: number,
	durMs: number,
	w: number,
	h: number,
	steps = 240,
): string {
	if (keyframes.length === 0 || durMs <= 0 || w <= 0) return '';
	const pts: string[] = [];
	for (let s = 0; s <= steps; s++) {
		const t = (s / steps) * durMs;
		const a = sample(keyframes, t)[ch]!;
		const x = (t / durMs) * w;
		const y = h - (a / 180) * h;
		pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
	}
	return 'M' + pts.join('L');
}
