// PROTOTYPE — shared in-memory editor state for the timeline UX variants.
// A keyframe is a COLUMN: one timeMs + all 4 angles + one shared ease in/out.
import { sample, type EaseType, type Keyframe } from './interpolator';

export const CHANNELS = [
	{ key: 'L-Az', label: 'Left azimuth', color: '#3b82f6' },
	{ key: 'L-Lat', label: 'Left latitude', color: '#0ea5e9' },
	{ key: 'R-Az', label: 'Right azimuth', color: '#f43f5e' },
	{ key: 'R-Lat', label: 'Right latitude', color: '#f59e0b' },
] as const;

export const EASE_NAMES = ['None', 'Sine', 'Cubic', 'Elastic'] as const;
export const MAX_KEYFRAMES = 64;
export const MAX_TIME_MS = 65535;

function kf(
	timeMs: number,
	angles: [number, number, number, number],
	easeOutType: EaseType = 1,
	easeInType: EaseType = 1,
	easeOutMs = 150,
	easeInMs = 150,
): Keyframe {
	return { timeMs, angles, easeInType, easeOutType, easeInMs, easeOutMs };
}

const SAMPLE: Keyframe[] = [
	kf(0, [90, 90, 90, 90], 1, 0, 200, 0),
	kf(500, [40, 80, 140, 100], 1, 1, 150, 150),
	kf(1000, [90, 90, 90, 90], 2, 2, 300, 300),
	kf(1600, [130, 60, 50, 120], 0, 3, 100, 250),
	kf(2400, [130, 60, 50, 120], 1, 1, 150, 150), // hold segment (same pose)
	kf(2900, [90, 30, 90, 150], 3, 3, 200, 200),
	kf(3600, [90, 90, 90, 90], 1, 1, 250, 250),
];

export class TimelineProto {
	kfs = $state<Keyframe[]>(SAMPLE.map((k) => ({ ...k, angles: [...k.angles] })));
	sel = $state<number | null>(1);
	playheadMs = $state(0);
	playing = $state(false);

	durationMs = $derived(this.kfs.length ? this.kfs[this.kfs.length - 1]!.timeMs : 0);
	/** Rendered time window: animation length plus a bit of headroom. */
	viewMs = $derived(Math.max(this.durationMs, 500) * 1.06);
	pose = $derived(sample(this.kfs, this.playheadMs));

	#raf = 0;

	selectedKf = $derived(this.sel === null ? null : (this.kfs[this.sel] ?? null));

	setPlayhead(ms: number) {
		this.playheadMs = Math.round(Math.min(Math.max(ms, 0), this.viewMs));
	}

	/** Insert a keyframe at the playhead, pre-filled with the sampled pose. */
	addAtPlayhead(): number | null {
		if (this.kfs.length >= MAX_KEYFRAMES) return null;
		const t = Math.round(this.playheadMs);
		const pose = sample(this.kfs, t).map(Math.round) as [number, number, number, number];
		const next: Keyframe = kf(Math.min(t, MAX_TIME_MS), pose);
		let i = this.kfs.findIndex((k) => k.timeMs > t);
		if (i === -1) i = this.kfs.length;
		this.kfs.splice(i, 0, next);
		this.sel = i;
		return i;
	}

	remove(i: number) {
		if (this.kfs.length <= 1) return; // payload requires >= 1 keyframe
		this.kfs.splice(i, 1);
		this.sel = this.sel === null ? null : Math.min(this.sel, this.kfs.length - 1);
	}

	/** Retime keyframe i, clamped between its neighbors (order never changes). */
	setTime(i: number, ms: number) {
		const lo = i > 0 ? this.kfs[i - 1]!.timeMs : 0;
		const hi = i < this.kfs.length - 1 ? this.kfs[i + 1]!.timeMs : MAX_TIME_MS;
		this.kfs[i]!.timeMs = Math.round(Math.min(Math.max(ms, lo), hi));
	}

	setAngle(i: number, ch: number, v: number) {
		this.kfs[i]!.angles[ch] = Math.round(Math.min(Math.max(v, 0), 180));
	}

	setEase(i: number, patch: Partial<Pick<Keyframe, 'easeInType' | 'easeOutType' | 'easeInMs' | 'easeOutMs'>>) {
		Object.assign(this.kfs[i]!, patch);
	}

	play() {
		if (this.playing) return;
		this.playing = true;
		let last = performance.now();
		const step = (now: number) => {
			if (!this.playing) return;
			this.playheadMs += now - last;
			last = now;
			if (this.playheadMs > this.durationMs) this.playheadMs = 0; // loop
			this.#raf = requestAnimationFrame(step);
		};
		this.#raf = requestAnimationFrame(step);
	}

	pause() {
		this.playing = false;
		cancelAnimationFrame(this.#raf);
	}

	toggle() {
		this.playing ? this.pause() : this.play();
	}
}

/** Shared pointer-drag helper: calls fn with each pointermove until release. */
export function drag(e: PointerEvent, fn: (ev: PointerEvent) => void) {
	const el = e.currentTarget as Element;
	el.setPointerCapture(e.pointerId);
	fn(e);
	const move = (ev: PointerEvent) => fn(ev);
	const up = () => {
		el.removeEventListener('pointermove', move as EventListener);
		el.removeEventListener('pointerup', up);
		el.removeEventListener('pointercancel', up);
	};
	el.addEventListener('pointermove', move as EventListener);
	el.addEventListener('pointerup', up);
	el.addEventListener('pointercancel', up);
}

export function fmtMs(ms: number) {
	return (ms / 1000).toFixed(2) + 's';
}
