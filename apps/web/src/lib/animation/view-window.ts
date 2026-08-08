/**
 * The span of time the editor's timeline canvas draws, in milliseconds.
 *
 * There is no zoom: the window is the whole animation plus a little headroom,
 * so it normally follows the duration. That is fine for drawing and fatal for
 * dragging — the last column's grip *writes* the duration the window is derived
 * from, so a window recomputed mid-gesture rescales the canvas under the cursor
 * and feeds its own output back in. The map from cursor to time becomes
 * `t → fraction × HEADROOM × t`, which sits still only at `fraction = 1/HEADROOM`
 * and otherwise collapses to the floor or runs away to the ceiling — with the
 * pointer completely stationary.
 *
 * So a gesture picks its window once and keeps it, and `beginGripDrag` is the
 * only way to get one. Freezing lives in here rather than in the component
 * because "the window held still for the whole gesture" is the invariant the
 * bug broke, and it is worth something that a test can hold on to.
 */

/** Shortest window drawn, so a near-empty animation isn't a single column. */
export const MIN_VIEW_MS = 500;

/** Headroom past the end, so the last column isn't welded to the right edge. */
const RESTING_HEADROOM = 1.06;

/**
 * Room to pull the last column into. `RESTING_HEADROOM` alone would cap a drag
 * at 6% longer, which is not a way to lengthen an animation.
 */
const DRAG_HEADROOM = 2;

/** The window when nothing is being dragged: the animation, plus a margin. */
export function restingViewMs(totalMs: number): number {
  return Math.max(totalMs, MIN_VIEW_MS) * RESTING_HEADROOM;
}

/**
 * One grip drag, holding the window it started in.
 *
 * `timeAt` takes no document and reads no state, which is the point: there is
 * nothing for the duration being edited to feed back through.
 */
export interface GripDrag {
  /** Fixed for the gesture's lifetime. The canvas draws this while it lasts. */
  readonly viewMs: number;
  /** Time under the cursor, `fraction` being how far across the canvas it is. */
  timeAt(fraction: number): number;
}

/**
 * Start a grip drag on column `index` of `count`.
 *
 * Only the last column can lengthen the animation, so only it gets the extra
 * room; every other column is clamped by its successor and would just get a
 * canvas that zooms out for no reason.
 */
export function beginGripDrag(
  totalMs: number,
  index: number,
  count: number,
  maxTimeMs: number,
): GripDrag {
  const resting = restingViewMs(totalMs);
  const viewMs =
    index < count - 1 ? resting : Math.min(Math.max(resting, totalMs * DRAG_HEADROOM), maxTimeMs);
  return { viewMs, timeAt: (fraction) => fraction * viewMs };
}
