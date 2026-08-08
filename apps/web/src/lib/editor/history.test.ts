/**
 * The undo stack on its own, driven by documents and intents rather than by an
 * editor. Everything here is about *when* a step exists — the coalescing rules
 * are the whole difficulty of undo, and this is where they are pinned down.
 */

import { describe, expect, it } from "vitest";
import type { EditorDocument } from "./document";
import { DocumentHistory, HISTORY_DEPTH, TYPING_PAUSE_MS } from "./history";

const doc = (name: string, description = ""): EditorDocument => ({
  name,
  description,
  payload: { schemaVersion: 1, keyframes: [] },
});

const GESTURE = { kind: "gesture", id: "angle:1:0" } as const;
const TYPING = { kind: "typing", field: "name" } as const;
const IMMEDIATE = { kind: "immediate" } as const;

describe("step granularity", () => {
  it("makes one step of a whole gesture, however many frames it moved through", () => {
    const frames = ["a", "b", "c", "d"];
    let history = DocumentHistory.empty();
    frames.slice(1).forEach((frame, at) => {
      history = history.record(doc(frames[at] ?? ""), doc(frame), GESTURE, 0);
    });
    history = history.committed(doc("d"));

    const undone = history.undo(doc("d"));
    expect(undone?.document).toEqual(doc("a")); // where the pointer went down, not the frame before last
    expect(undone?.history.canUndo).toBe(false);
  });

  it("starts a new step once the gesture is committed", () => {
    const history = DocumentHistory.empty()
      .record(doc("a"), doc("b"), GESTURE, 0)
      .committed(doc("b"))
      .record(doc("b"), doc("c"), GESTURE, 0)
      .committed(doc("c"));

    const first = history.undo(doc("c"));
    expect(first?.document).toEqual(doc("b"));
    expect(first?.history.undo(doc("b"))?.document).toEqual(doc("a"));
  });

  it("drops a gesture that ended where it started", () => {
    const history = DocumentHistory.empty()
      .record(doc("a"), doc("b"), GESTURE, 0)
      .record(doc("b"), doc("a"), GESTURE, 0)
      .committed(doc("a"));

    expect(history.canUndo).toBe(false);
  });

  it("coalesces a typing burst and breaks the step after a pause", () => {
    const burst = DocumentHistory.empty()
      .record(doc(""), doc("H"), TYPING, 0)
      .record(doc("H"), doc("He"), TYPING, 120)
      .record(doc("He"), doc("Hel"), TYPING, 240);

    expect(burst.undo(doc("Hel"))?.document).toEqual(doc(""));

    const afterPause = burst.record(doc("Hel"), doc("Help"), TYPING, 240 + TYPING_PAUSE_MS + 1);
    expect(afterPause.undo(doc("Help"))?.document).toEqual(doc("Hel"));
  });

  it("breaks a typing burst on blur, however fast the next keystroke lands", () => {
    const history = DocumentHistory.empty()
      .record(doc(""), doc("H"), TYPING, 0)
      .committed(doc("H"))
      .record(doc("H"), doc("Hi"), TYPING, 1);

    expect(history.undo(doc("Hi"))?.document).toEqual(doc("H"));
  });

  it("keeps typing in different fields as separate steps", () => {
    const history = DocumentHistory.empty()
      .record(doc(""), doc("H"), TYPING, 0)
      .record(doc("H"), doc("H", "d"), { kind: "typing", field: "description" }, 1);

    expect(history.undo(doc("H", "d"))?.document).toEqual(doc("H"));
  });

  it("never coalesces immediate edits, however close together", () => {
    const history = DocumentHistory.empty()
      .record(doc("a"), doc("b"), IMMEDIATE, 0)
      .record(doc("b"), doc("c"), IMMEDIATE, 0);

    expect(history.undo(doc("c"))?.document).toEqual(doc("b"));
  });

  it("ignores an edit that changed nothing", () => {
    const unchanged = doc("a");
    expect(DocumentHistory.empty().record(unchanged, unchanged, IMMEDIATE, 0).canUndo).toBe(false);
  });
});

describe("mechanics", () => {
  const twoSteps = DocumentHistory.empty()
    .record(doc("a"), doc("b"), IMMEDIATE, 0)
    .record(doc("b"), doc("c"), IMMEDIATE, 0);

  it("redoes what it undid", () => {
    const undone = twoSteps.undo(doc("c"));
    expect(undone?.document).toEqual(doc("b"));
    expect(undone?.history.canRedo).toBe(true);
    expect(undone?.history.redo(doc("b"))?.document).toEqual(doc("c"));
  });

  it("clears redo on a new edit after an undo", () => {
    const undone = twoSteps.undo(doc("c"));
    const branched = undone?.history.record(doc("b"), doc("z"), IMMEDIATE, 0);
    expect(branched?.canRedo).toBe(false);
  });

  it("has nothing to undo or redo when empty", () => {
    const empty = DocumentHistory.empty();
    expect(empty.canUndo).toBe(false);
    expect(empty.canRedo).toBe(false);
    expect(empty.undo(doc("a"))).toBeNull();
    expect(empty.redo(doc("a"))).toBeNull();
  });

  it("drops the oldest step past the depth cap, silently", () => {
    let history = DocumentHistory.empty();
    for (let step = 0; step <= HISTORY_DEPTH; step++) {
      history = history.record(doc(`v${step}`), doc(`v${step + 1}`), IMMEDIATE, 0);
    }

    let current = doc(`v${HISTORY_DEPTH + 1}`);
    let undos = 0;
    for (let next = history.undo(current); next !== null; next = next.history.undo(current)) {
      history = next.history;
      current = next.document;
      undos++;
    }
    // v0 fell off the bottom, so the oldest reachable document is v1
    expect(undos).toBe(HISTORY_DEPTH);
    expect(current).toEqual(doc("v1"));
  });
});
