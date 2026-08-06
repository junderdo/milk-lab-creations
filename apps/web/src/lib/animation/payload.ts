/**
 * Boundary parse for animation payloads arriving from the API.
 *
 * The server validates payloads per robot profile on write, so what comes back
 * is structurally sound — but it arrives typed as opaque JSON, and casting it
 * would move any future mismatch to a runtime crash inside the render loop.
 * This narrows it once, at the edge, and drops anything malformed rather than
 * poisoning the interpolator with NaN.
 */

import type { EaseType, Keyframe } from "./interpolator";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function easeType(value: unknown): EaseType {
  return value === 1 || value === 2 || value === 3 ? value : 0;
}

function keyframe(value: unknown): Keyframe | null {
  if (!isRecord(value)) return null;
  const { timeMs, angles } = value;
  if (typeof timeMs !== "number" || !Array.isArray(angles)) return null;
  if (!angles.every((a): a is number => typeof a === "number")) return null;

  return {
    timeMs,
    angles,
    easeInType: easeType(value.easeInType),
    easeOutType: easeType(value.easeOutType),
    easeInMs: typeof value.easeInMs === "number" ? value.easeInMs : 0,
    easeOutMs: typeof value.easeOutMs === "number" ? value.easeOutMs : 0,
  };
}

/** Keyframes from an API payload; empty if the payload isn't usable. */
export function keyframesFromPayload(payload: unknown): Keyframe[] {
  if (!isRecord(payload) || !Array.isArray(payload.keyframes)) return [];
  const parsed: Keyframe[] = [];
  for (const raw of payload.keyframes) {
    const frame = keyframe(raw);
    if (frame !== null) parsed.push(frame);
  }
  return parsed;
}
