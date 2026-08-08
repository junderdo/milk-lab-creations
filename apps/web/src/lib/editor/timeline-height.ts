/**
 * How the editor's vertical space is split between the 3D preview and the
 * timeline graph, and how that split survives a reload.
 *
 * Only the graph's height is stored. The preview takes whatever is left, so the
 * two always add up to the shell by construction and there is no second number
 * to keep in step.
 *
 * Device-local like the theme: it belongs to the screen being looked at, not to
 * the account, which makes `localStorage` the whole persistence layer. Every
 * call is wrapped — a private window costs the preference, never a render.
 */

/** Roughly the `lg:h-[34dvh]` the graph used to take on a laptop. */
export const DEFAULT_TIMELINE_HEIGHT = 320;

/** Below this the curves and their column grips stop being aimable. */
export const MIN_TIMELINE_HEIGHT = 160;

/** What the preview above is never squeezed past, however far the drag goes. */
export const MIN_PREVIEW_HEIGHT = 140;

export const TIMELINE_HEIGHT_STORAGE_KEY = "milklab:editor-timeline-height";

/** The slice of `Storage` this preference needs — the seam tests substitute. */
export interface TimelineHeightStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * `height` clamped into what `budget` leaves, where `budget` is the preview and
 * the graph measured together.
 *
 * The floor wins a fight with the ceiling: in a window too short to satisfy
 * both minimums, an unusable graph is worse than an unusable preview, because
 * the graph is the thing being dragged.
 */
export function clampTimelineHeight(height: number, budget: number): number {
  const ceiling = Math.max(MIN_TIMELINE_HEIGHT, budget - MIN_PREVIEW_HEIGHT);
  return Math.round(Math.min(Math.max(height, MIN_TIMELINE_HEIGHT), ceiling));
}

/**
 * A height out of a stored string.
 *
 * A boundary parse rather than a cast: what comes back is whatever an older
 * build — or a devtools console — left behind. Not clamped against a budget
 * here; the caller does that once it knows how much room it actually has.
 */
export function timelineHeightFrom(raw: string | null): number {
  if (raw === null) return DEFAULT_TIMELINE_HEIGHT;
  const parsed = Number(raw.trim());
  if (raw.trim() === "" || !Number.isFinite(parsed)) return DEFAULT_TIMELINE_HEIGHT;
  return Math.max(MIN_TIMELINE_HEIGHT, Math.round(parsed));
}

export function readTimelineHeight(storage: TimelineHeightStorage): number {
  try {
    return timelineHeightFrom(storage.getItem(TIMELINE_HEIGHT_STORAGE_KEY));
  } catch {
    return DEFAULT_TIMELINE_HEIGHT;
  }
}

export function writeTimelineHeight(storage: TimelineHeightStorage, height: number): void {
  try {
    storage.setItem(TIMELINE_HEIGHT_STORAGE_KEY, String(Math.round(height)));
  } catch {
    // a blocked origin costs the preference for next visit, not this one
  }
}

/** `localStorage`, or a stand-in when the browser refuses to hand it over. */
export function localTimelineHeightStorage(): TimelineHeightStorage {
  try {
    // absent during SSR, and an access that throws outright on a blocked origin
    if (globalThis.localStorage !== undefined) return globalThis.localStorage;
  } catch {
    // fall through to the stand-in
  }
  return { getItem: () => null, setItem: () => {} };
}
