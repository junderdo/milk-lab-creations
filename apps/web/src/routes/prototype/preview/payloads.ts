// PROTOTYPE — sample payloads exercising every ease type and the firmware's
// segment edge cases. Channel order: [L azimuth, L latitude, R azimuth, R latitude].
// 90 everywhere = as-modeled neutral. L out = 40 / R out = 140; L up < 90 < R up.
import type { AnimationPayload } from './interpolator';

export const PAYLOADS: Record<string, { label: string; payload: AnimationPayload }> = {
	showcase: {
		label: 'Showcase — every ease type',
		payload: {
			schemaVersion: 1,
			keyframes: [
				{ timeMs: 0, angles: [90, 90, 90, 90], easeInType: 0, easeOutType: 1, easeInMs: 0, easeOutMs: 400 },
				{ timeMs: 1000, angles: [90, 50, 90, 130], easeInType: 1, easeOutType: 2, easeInMs: 400, easeOutMs: 400 },
				{ timeMs: 2400, angles: [40, 50, 140, 130], easeInType: 2, easeOutType: 0, easeInMs: 600, easeOutMs: 200 },
				{ timeMs: 3800, angles: [90, 90, 90, 90], easeInType: 3, easeOutType: 0, easeInMs: 1000, easeOutMs: 0 },
				{ timeMs: 5000, angles: [65, 70, 120, 95], easeInType: 1, easeOutType: 1, easeInMs: 500, easeOutMs: 300 },
				{ timeMs: 6000, angles: [90, 90, 90, 90], easeInType: 1, easeOutType: 0, easeInMs: 600, easeOutMs: 0 }
			]
		}
	},
	edges: {
		label: 'Edge cases — snap, hold, over-length windows',
		payload: {
			schemaVersion: 1,
			keyframes: [
				// both windows 0 -> whole segment holds the halfway pose, snaps at end
				{ timeMs: 0, angles: [90, 90, 90, 90], easeInType: 0, easeOutType: 0, easeInMs: 0, easeOutMs: 0 },
				{ timeMs: 1000, angles: [40, 90, 140, 90], easeInType: 0, easeOutType: 0, easeInMs: 0, easeOutMs: 0 },
				// zero-length segment -> instant snap to a different pose
				{ timeMs: 1000, angles: [90, 50, 90, 130], easeInType: 0, easeOutType: 1, easeInMs: 0, easeOutMs: 5000 },
				// windows 5000+5000 over a 2000ms segment -> proportional scale-down
				{ timeMs: 3000, angles: [90, 130, 90, 50], easeInType: 1, easeOutType: 0, easeInMs: 5000, easeOutMs: 0 },
				{ timeMs: 5000, angles: [90, 90, 90, 90], easeInType: 2, easeOutType: 0, easeInMs: 800, easeOutMs: 0 }
			]
		}
	},
	elastic: {
		label: 'Elastic stress — overshoot clamping near limits',
		payload: {
			schemaVersion: 1,
			keyframes: [
				{ timeMs: 0, angles: [90, 90, 90, 90], easeInType: 0, easeOutType: 3, easeInMs: 0, easeOutMs: 600 },
				{ timeMs: 1200, angles: [5, 10, 175, 170], easeInType: 3, easeOutType: 3, easeInMs: 600, easeOutMs: 600 },
				{ timeMs: 2600, angles: [175, 170, 5, 10], easeInType: 3, easeOutType: 3, easeInMs: 800, easeOutMs: 400 },
				{ timeMs: 4000, angles: [90, 90, 90, 90], easeInType: 3, easeOutType: 0, easeInMs: 900, easeOutMs: 0 }
			]
		}
	}
};
