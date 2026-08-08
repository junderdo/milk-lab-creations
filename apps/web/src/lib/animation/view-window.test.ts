import { describe, expect, it } from "vitest";
import { durationMs } from "./interpolator";
import { beginGripDrag, MIN_VIEW_MS, restingViewMs } from "./view-window";
import {
  keyframesOf,
  limitsFor,
  newDocument,
  setTime,
  type EditorDocument,
  type RobotLimits,
} from "../editor/document";

function robotLimits(): RobotLimits {
  const found = limitsFor("robo-cat-ears");
  if (found === undefined) throw new Error("robo-cat-ears must have a validation profile");
  return found;
}

const limits = robotLimits();

describe("restingViewMs", () => {
  it("leaves headroom past the end", () => {
    expect(restingViewMs(1000)).toBeGreaterThan(1000);
  });

  it("does not collapse on a near-empty animation", () => {
    expect(restingViewMs(0)).toBeGreaterThanOrEqual(MIN_VIEW_MS);
  });
});

describe("beginGripDrag", () => {
  it("gives the last column room to lengthen the animation", () => {
    expect(beginGripDrag(1000, 2, 3, limits.maxTimeMs).viewMs).toBeGreaterThanOrEqual(2000);
  });

  it("leaves an inner column the resting window — it cannot pass its successor anyway", () => {
    expect(beginGripDrag(1000, 1, 3, limits.maxTimeMs).viewMs).toBe(restingViewMs(1000));
  });

  it("never offers room past what a keyframe time can hold", () => {
    expect(beginGripDrag(limits.maxTimeMs, 1, 2, limits.maxTimeMs).viewMs).toBe(limits.maxTimeMs);
  });
});

/**
 * Regression: a stationary cursor must not move the animation's end.
 *
 * This is the bug, replayed. `AnimationTimeline` calls `ontime(index,
 * timeAt(x))` on every pointermove; when the window behind `timeAt` was
 * recomputed from the duration each time, a *still* cursor at 70% walked the
 * end 1000 → 742 → 551 → 409 → 371, and at 98% ran away 1000 → … → 1356.
 *
 * The loop below re-derives the gesture from the live document on every move,
 * which is exactly what the component used to do — so it goes red against any
 * `GripDrag` that lets the duration back into its own mapping.
 */
describe("dragging the last column with a stationary cursor", () => {
  function endTimesOverMoves(fraction: number, moves: number): number[] {
    let document: EditorDocument = newDocument(limits);
    const index = keyframesOf(document).length - 1;
    const gesture = beginGripDrag(
      durationMs(keyframesOf(document)),
      index,
      keyframesOf(document).length,
      limits.maxTimeMs,
    );

    const seen: number[] = [];
    for (let n = 0; n < moves; n++) {
      document = setTime(document, limits, index, gesture.timeAt(fraction));
      seen.push(durationMs(keyframesOf(document)));
      // Re-deriving here would be the bug: if `timeAt` consulted the document
      // it has just changed, these would diverge instead of repeating.
      expect(gesture.timeAt(fraction)).toBe(seen[0]);
    }
    return seen;
  }

  it.each([0.3, 0.7, 0.943, 0.98, 1])("settles at cursor fraction %o", (fraction) => {
    expect(new Set(endTimesOverMoves(fraction, 8)).size).toBe(1);
  });

  it("can lengthen the animation in a single gesture", () => {
    const start = durationMs(keyframesOf(newDocument(limits)));
    expect(endTimesOverMoves(1, 1)[0]).toBeGreaterThan(start);
  });
});
