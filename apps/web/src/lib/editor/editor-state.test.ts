/**
 * The editor as scenario sequences: open a record, do things, assert what the
 * editor now is. No DOM, no network, no clock — the reason the state lives in
 * its own module is that the interesting behaviour can be exercised like this.
 */

import { describe, expect, it } from "vitest";
import { AnimationEditor, type LoadedAnimation } from "./editor-state";
import { keyframesOf, limitsFor } from "./document";

const limits = limitsFor("robo-cat-ears");
if (limits === undefined) throw new Error("robo-cat-ears must have a validation profile");

const LOADED_AT = new Date("2026-08-05T12:00:00.000Z");

const ease = { easeInType: 1, easeOutType: 1, easeInMs: 150, easeOutMs: 150 } as const;

function record(overrides: Partial<LoadedAnimation> = {}): LoadedAnimation {
  return {
    id: "anim-1",
    name: "Ear wiggle",
    description: "twitchy",
    payload: {
      schemaVersion: 1,
      keyframes: [
        { timeMs: 0, angles: [90, 90, 90, 90], ...ease },
        { timeMs: 500, angles: [40, 80, 140, 100], ...ease },
      ],
    },
    updatedAt: LOADED_AT,
    ...overrides,
  };
}

const opened = AnimationEditor.open(record(), limits);

describe("opening", () => {
  it("starts clean, with nothing to save", () => {
    expect(opened.dirty).toBe(false);
    expect(opened.canSave).toBe(false);
    expect(opened.status).toEqual({ kind: "idle" });
  });

  it("carries the robot's keyframe budget", () => {
    expect(opened.keyframeCount).toBe(2);
    expect(opened.atKeyframeCap).toBe(false);
    expect(opened.nearKeyframeCap).toBe(false);
  });
});

describe("dirty tracking", () => {
  it("turns dirty on an edit and clean again when the edit is undone by hand", () => {
    const edited = opened.setAngle(1, 0, 41);
    expect(edited.dirty).toBe(true);
    expect(edited.canSave).toBe(true);
    // dirty is a comparison, not a flag: editing back to the loaded value is clean
    expect(edited.setAngle(1, 0, 40).dirty).toBe(false);
  });

  it("counts name and description as part of the document", () => {
    expect(opened.setName("Other").dirty).toBe(true);
    expect(opened.setDescription("").dirty).toBe(true);
  });

  it("blocks Save on an empty name without calling the document invalid", () => {
    const nameless = opened.setName("   ");
    expect(nameless.dirty).toBe(true);
    expect(nameless.canSave).toBe(false);
    expect(nameless.nameIsEmpty).toBe(true);
  });
});

describe("keyframe budget", () => {
  const full = (count: number) =>
    AnimationEditor.open(
      record({
        payload: {
          schemaVersion: 1,
          keyframes: Array.from({ length: count }, (_unused, i) => ({
            timeMs: i * 10,
            angles: [90, 90, 90, 90],
            easeInType: 1,
            easeOutType: 1,
            easeInMs: 0,
            easeOutMs: 0,
          })),
        },
      }),
      limits,
    );

  it("warns from 87% of the robot's ceiling", () => {
    expect(full(55).nearKeyframeCap).toBe(false);
    expect(full(56).nearKeyframeCap).toBe(true);
  });

  it("refuses to add past the ceiling", () => {
    const capped = full(64);
    expect(capped.atKeyframeCap).toBe(true);
    expect(capped.addKeyframeAt(5).dirty).toBe(false);
  });
});

describe("save", () => {
  it("sends the document and the guard the editor loaded on", () => {
    const saving = opened.setName("Renamed").saveStarted();
    expect(saving.saving).toBe(true);
    expect(saving.pendingRequest).toEqual({
      document: saving.document,
      expectedUpdatedAt: LOADED_AT,
    });
  });

  it("refuses to start when there is nothing to save", () => {
    expect(opened.saveStarted()).toBe(opened);
    expect(opened.setName(" ").saveStarted().saving).toBe(false);
  });

  it("does not start a second save over one in flight", () => {
    const saving = opened.setName("Renamed").saveStarted();
    expect(saving.setName("Renamed again").saveStarted().pendingRequest).toEqual(
      saving.pendingRequest,
    );
  });

  it("takes the server's record as the new clean snapshot", () => {
    const saved = opened
      .setName("  Renamed  ")
      .saveStarted()
      .saveSucceeded(record({ name: "Renamed", updatedAt: new Date("2026-08-05T13:00:00Z") }));

    expect(saved.status).toEqual({ kind: "idle" });
    // the server trimmed the name on the way in; adopting what it stored is what
    // keeps the editor from reading as dirty the instant a save succeeds
    expect(saved.document.name).toBe("Renamed");
    expect(saved.dirty).toBe(false);
    expect(saved.pendingRequest).toBeNull();
  });

  it("keeps edits made while the save was in flight", () => {
    const saving = opened.setName("Renamed").saveStarted();
    const editedMidFlight = saving.setAngle(1, 0, 41);
    const saved = editedMidFlight.saveSucceeded(record({ name: "Renamed" }));

    expect(keyframesOf(saved.document)[1]?.angles[0]).toBe(41);
    expect(saved.dirty).toBe(true); // the in-flight edit was never sent
  });

  it("reports a failed save and lets it be retried", () => {
    const failed = opened.setName("Renamed").saveStarted().saveFailed("Network unavailable");
    expect(failed.status).toEqual({ kind: "failed", message: "Network unavailable" });
    expect(failed.errorMessage).toBe("Network unavailable");
    expect(failed.saveStarted().saving).toBe(true);
  });

  it("clears a failure without touching the document", () => {
    const failed = opened.setName("Renamed").saveStarted().saveFailed("Network unavailable");
    const dismissed = failed.errorDismissed();
    expect(dismissed.status).toEqual({ kind: "idle" });
    expect(dismissed.document).toEqual(failed.document);
  });
});

describe("drafts", () => {
  it("exposes the server version a draft would be written on top of", () => {
    expect(opened.baseUpdatedAt).toEqual(LOADED_AT);

    const savedAt = new Date("2026-08-05T13:00:00.000Z");
    const saved = opened.setName("Renamed").saveStarted().saveSucceeded(record({ updatedAt: savedAt }));
    expect(saved.baseUpdatedAt).toEqual(savedAt);
  });

  it("restores a draft as the working document, dirty against the server copy", () => {
    const restored = opened.draftRestored({ ...opened.document, name: "From a closed tab" });

    expect(restored.document.name).toBe("From a closed tab");
    expect(restored.dirty).toBe(true);
    expect(restored.canSave).toBe(true);
    // restoring happens before editing begins, so it is not a step to undo past
    expect(restored.canUndo).toBe(false);
    expect(restored.saveStarted().pendingRequest?.expectedUpdatedAt).toEqual(LOADED_AT);
  });

  it("leaves the guard alone for a draft that turns out to match the server", () => {
    expect(opened.draftRestored({ ...opened.document }).dirty).toBe(false);
  });
});

describe("undo", () => {
  it("has nothing to undo on a freshly opened animation", () => {
    expect(opened.canUndo).toBe(false);
    expect(opened.canRedo).toBe(false);
    expect(opened.undone()).toBe(opened);
    expect(opened.redone()).toBe(opened);
  });

  it("treats one drag as one step, whatever it moved through", () => {
    const dragged = opened
      .setAngle(1, 0, 60)
      .setAngle(1, 0, 75)
      .setAngle(1, 0, 41)
      .editCommitted();

    const undone = dragged.undone();
    expect(keyframesOf(undone.document)[1]?.angles[0]).toBe(40);
    expect(undone.dirty).toBe(false);
    expect(undone.canUndo).toBe(false);
    expect(undone.redone().document).toEqual(dragged.document);
  });

  it("keeps two separate drags as two steps", () => {
    const twice = opened
      .setAngle(1, 0, 41)
      .editCommitted()
      .setAngle(1, 0, 42)
      .editCommitted();

    expect(keyframesOf(twice.undone().document)[1]?.angles[0]).toBe(41);
  });

  it("coalesces a typing burst and breaks on the pause", () => {
    let clock = 0;
    const editor = AnimationEditor.open(record(), limits, () => clock);

    let typed = editor.setName("Ear wiggl");
    clock = 200;
    typed = typed.setName("Ear wiggle!");
    expect(typed.undone().document.name).toBe("Ear wiggle");

    clock = 5000;
    const later = typed.setName("Ear wiggle!!");
    expect(later.undone().document.name).toBe("Ear wiggle!");
  });

  it("steps ease edits individually, so two eases can be compared with undo", () => {
    const eased = opened.setEase(0, { easeOutType: 3 }).setEase(0, { easeOutType: 2 });
    expect(keyframesOf(eased.undone().document)[0]?.easeOutType).toBe(3);
    expect(keyframesOf(eased.undone().undone().document)[0]?.easeOutType).toBe(1);
  });

  it("steps adding and removing keyframes individually", () => {
    const built = opened.addKeyframeAt(250).removeKeyframe(0);
    expect(built.keyframeCount).toBe(2);
    expect(built.undone().keyframeCount).toBe(3);
    expect(built.undone().undone().keyframeCount).toBe(2);
    expect(built.undone().undone().dirty).toBe(false);
  });

  it("says where to look, without ever making the view a step", () => {
    const dragged = opened.setAngle(1, 2, 30).editCommitted();
    expect(dragged.reveal).toBeNull(); // editing is its own reveal — the finger is already there

    const undone = dragged.undone();
    expect(undone.reveal).toEqual({ kind: "keyframe", index: 1, timeMs: 500 });
    expect(undone.redone().reveal).toEqual({ kind: "keyframe", index: 1, timeMs: 500 });
    // and the next edit stops pointing at a change that is no longer the latest
    expect(undone.setName("Other").reveal).toBeNull();
  });

  it("clears redo once a new edit branches off an undo", () => {
    const branched = opened.setAngle(1, 0, 41).editCommitted().undone().setAngle(1, 1, 70);
    expect(branched.canRedo).toBe(false);
  });

  it("drops a drag that ended where it started", () => {
    const returned = opened.setAngle(1, 0, 60).setAngle(1, 0, 40).editCommitted();
    expect(returned.dirty).toBe(false);
    expect(returned.canUndo).toBe(false);
  });
});

describe("undo across a save", () => {
  const savedAt = new Date("2026-08-05T13:00:00.000Z");
  const saved = opened
    .setAngle(1, 0, 41)
    .editCommitted()
    .saveStarted()
    .saveSucceeded(
      record({
        payload: {
          schemaVersion: 1,
          keyframes: [
            { timeMs: 0, angles: [90, 90, 90, 90], ...ease },
            { timeMs: 500, angles: [41, 80, 140, 100], ...ease },
          ],
        },
        updatedAt: savedAt,
      }),
    );

  it("keeps the stack across a save — saving is not a barrier", () => {
    expect(saved.dirty).toBe(false);
    expect(saved.canUndo).toBe(true);
  });

  it("goes dirty again when undone past the save point, and clean when redone back", () => {
    const undone = saved.undone();
    expect(keyframesOf(undone.document)[1]?.angles[0]).toBe(40);
    expect(undone.dirty).toBe(true);
    expect(undone.redone().dirty).toBe(false);
  });

  it("guards a save made after undoing past the save point with the newest updatedAt", () => {
    expect(saved.undone().saveStarted().pendingRequest?.expectedUpdatedAt).toEqual(savedAt);
  });
});

describe("conflict", () => {
  const newer = record({
    name: "Changed in the other tab",
    description: null,
    updatedAt: new Date("2026-08-05T14:00:00.000Z"),
  });
  const conflicted = opened.setName("Renamed").saveStarted().saveConflicted(newer);

  it("holds the server's record so both choices can be offered without a refetch", () => {
    expect(conflicted.conflict).toBe(newer);
    expect(conflicted.saving).toBe(false);
  });

  it("overwrite resends exactly what was rejected, unguarded", () => {
    const overwriting = conflicted.overwriteRequested();
    expect(overwriting.saving).toBe(true);
    expect(overwriting.pendingRequest).toEqual({
      document: conflicted.document,
      expectedUpdatedAt: null,
    });
  });

  it("overwrite lands on the server's newest updatedAt, so the next save is guarded again", () => {
    const saved = conflicted
      .overwriteRequested()
      .saveSucceeded(record({ name: "Renamed", updatedAt: new Date("2026-08-05T15:00:00Z") }));
    expect(saved.dirty).toBe(false);
    expect(saved.setName("Again").saveStarted().pendingRequest?.expectedUpdatedAt).toEqual(
      new Date("2026-08-05T15:00:00Z"),
    );
  });

  it("discarding mine adopts the newest record wholesale and comes back clean", () => {
    const discarded = conflicted.serverAdopted();
    expect(discarded.document.name).toBe("Changed in the other tab");
    expect(discarded.document.description).toBe("");
    expect(discarded.dirty).toBe(false);
    expect(discarded.status).toEqual({ kind: "idle" });
    expect(discarded.setName("Third go").saveStarted().pendingRequest?.expectedUpdatedAt).toEqual(
      newer.updatedAt,
    );
  });

  it("holds undo still until the conflict is answered", () => {
    // the dialog covers the canvas but not the keyboard: undoing behind it would
    // move the document out from under an Overwrite that still resends what the
    // server rejected
    expect(conflicted.canUndo).toBe(false);
    expect(conflicted.undone()).toBe(conflicted);
    expect(conflicted.redone()).toBe(conflicted);
  });

  it("gives undo back once the conflict is resolved", () => {
    expect(conflicted.serverAdopted().canUndo).toBe(true);
  });

  it("makes discarding mine undoable — the stack is what stops that being a loss", () => {
    const discarded = conflicted.serverAdopted();
    expect(discarded.canUndo).toBe(true);
    expect(discarded.undone().document.name).toBe("Renamed");
    expect(discarded.undone().dirty).toBe(true);
  });

  it("ignores save transitions that do not belong to the state it is in", () => {
    expect(opened.saveSucceeded(record())).toBe(opened);
    expect(opened.saveConflicted(newer)).toBe(opened);
    expect(opened.overwriteRequested()).toBe(opened);
    expect(opened.serverAdopted()).toBe(opened);
  });
});
