/**
 * An editor session: the document being edited, the last-saved snapshot it is
 * compared against, and the save/conflict state machine.
 *
 * Immutable on purpose. Every method returns a new `AnimationEditor` rather
 * than mutating this one, which buys three things at once: Svelte reactivity
 * comes from reassigning one `$state` variable (class instances are not deep
 * proxies, so nothing is left half-updated mid-drag), dirty tracking is a
 * comparison of two plain documents, and the whole thing runs in a plain node
 * test — no DOM, no component harness. Undo and drafts extend this module; the
 * shape they need is the one that is already here, a document value per step.
 *
 * The save machine is deliberately transport-free. `saveStarted()` produces the
 * request to send and the route performs it; the outcome comes back in as
 * `saveSucceeded` / `saveConflicted` / `saveFailed`. That is what makes the
 * conflict branches — the part that is genuinely hard to reach by hand —
 * testable as sequences.
 */

import type { Keyframe } from "../animation/interpolator";
import {
  addKeyframeAt,
  documentFromRecord,
  documentsEqual,
  keyframesOf,
  removeKeyframe,
  revealOf,
  setAngle,
  setDescription,
  setEase,
  setName,
  setTime,
  type EasePatch,
  type EditorDocument,
  type Reveal,
  type RobotLimits,
  type SaveRequest,
} from "./document";
import { DocumentHistory, type EditIntent } from "./history";

/** The animation record the editor opens on, and gets back from a save. */
export interface LoadedAnimation {
  id: string;
  name: string;
  description: string | null;
  payload: unknown;
  updatedAt: Date;
}

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving"; request: SaveRequest }
  /** `request` is what the server rejected — Overwrite resends exactly it. */
  | { kind: "conflict"; server: LoadedAnimation; request: SaveRequest }
  | { kind: "failed"; message: string };

/** The document as last known to be on the server, and when that was. */
interface SavedSnapshot {
  document: EditorDocument;
  updatedAt: Date;
}

/** Amber from here up — enough warning to finish a thought before the cap. */
const NEAR_CAP_FRACTION = 0.87;

export class AnimationEditor {
  readonly animationId: string;
  readonly limits: RobotLimits;
  readonly document: EditorDocument;
  readonly status: SaveStatus;
  /** Where the last undo or redo landed; `null` after an ordinary edit. */
  readonly reveal: Reveal;
  private readonly saved: SavedSnapshot;
  private readonly history: DocumentHistory;
  private readonly now: () => number;

  private constructor(
    animationId: string,
    limits: RobotLimits,
    document: EditorDocument,
    saved: SavedSnapshot,
    status: SaveStatus,
    history: DocumentHistory,
    reveal: Reveal,
    now: () => number,
  ) {
    this.animationId = animationId;
    this.limits = limits;
    this.document = document;
    this.saved = saved;
    this.status = status;
    this.history = history;
    this.reveal = reveal;
    this.now = now;
  }

  /**
   * Open an animation for editing.
   *
   * `now` is injected because undo's typing coalescence is defined in terms of
   * a pause, and a rule about elapsed time that cannot be tested at arbitrary
   * speeds is a rule nobody can check.
   */
  static open(
    record: LoadedAnimation,
    limits: RobotLimits,
    now: () => number = Date.now,
  ): AnimationEditor {
    const document = documentFromRecord(record);
    return new AnimationEditor(
      record.id,
      limits,
      document,
      { document, updatedAt: record.updatedAt },
      { kind: "idle" },
      DocumentHistory.empty(),
      null,
      now,
    );
  }

  private with(
    document: EditorDocument,
    saved: SavedSnapshot,
    status: SaveStatus,
    history: DocumentHistory = this.history,
    reveal: Reveal = null,
  ) {
    return new AnimationEditor(
      this.animationId,
      this.limits,
      document,
      saved,
      status,
      history,
      reveal,
      this.now,
    );
  }

  /** An edit leaves the save machine alone — saving while typing is allowed. */
  private edited(document: EditorDocument, intent: EditIntent): AnimationEditor {
    if (document === this.document) return this;
    return this.with(
      document,
      this.saved,
      this.status,
      this.history.record(this.document, document, intent, this.now()),
    );
  }

  get keyframes(): Keyframe[] {
    return keyframesOf(this.document);
  }

  get keyframeCount(): number {
    return this.keyframes.length;
  }

  get atKeyframeCap(): boolean {
    return this.keyframeCount >= this.limits.maxKeyframes;
  }

  get nearKeyframeCap(): boolean {
    return this.keyframeCount >= this.limits.maxKeyframes * NEAR_CAP_FRACTION;
  }

  /** Dirty is a comparison, never a flag — editing back to the saved value is clean. */
  get dirty(): boolean {
    return !documentsEqual(this.document, this.saved.document);
  }

  get nameIsEmpty(): boolean {
    return this.document.name.trim() === "";
  }

  get canSave(): boolean {
    return this.dirty && !this.nameIsEmpty && !this.saving;
  }

  get saving(): boolean {
    return this.status.kind === "saving";
  }

  /** What the route should send, or `null` when nothing is in flight. */
  get pendingRequest(): SaveRequest | null {
    return this.status.kind === "saving" ? this.status.request : null;
  }

  get conflict(): LoadedAnimation | null {
    return this.status.kind === "conflict" ? this.status.server : null;
  }

  get errorMessage(): string | null {
    return this.status.kind === "failed" ? this.status.message : null;
  }

  setName(name: string): AnimationEditor {
    return this.edited(setName(this.document, name), { kind: "typing", field: "name" });
  }

  setDescription(description: string): AnimationEditor {
    return this.edited(setDescription(this.document, description), {
      kind: "typing",
      field: "description",
    });
  }

  setAngle(index: number, channel: number, angle: number): AnimationEditor {
    return this.edited(setAngle(this.document, this.limits, index, channel, angle), {
      kind: "gesture",
      id: `angle:${index}:${channel}`,
    });
  }

  setTime(index: number, timeMs: number): AnimationEditor {
    return this.edited(setTime(this.document, this.limits, index, timeMs), {
      kind: "gesture",
      id: `time:${index}`,
    });
  }

  /** Each ease change is its own step: A/B-ing two eases is done with Ctrl+Z. */
  setEase(index: number, patch: EasePatch): AnimationEditor {
    return this.edited(setEase(this.document, this.limits, index, patch), { kind: "immediate" });
  }

  addKeyframeAt(timeMs: number): AnimationEditor {
    return this.edited(addKeyframeAt(this.document, this.limits, timeMs), { kind: "immediate" });
  }

  removeKeyframe(index: number): AnimationEditor {
    return this.edited(removeKeyframe(this.document, index), { kind: "immediate" });
  }

  /**
   * Close the step in progress — a pointer released, or a text field blurred.
   *
   * Without it, the drag that follows this one would join it: the stack cannot
   * see a pointerup, so the view has to say when a gesture is over.
   */
  editCommitted(): AnimationEditor {
    const history = this.history.committed(this.document);
    return history === this.history
      ? this
      : this.with(this.document, this.saved, this.status, history, this.reveal);
  }

  /**
   * A conflict freezes the history.
   *
   * Overwrite resends the document the server rejected, so a document moved by
   * undo behind the dialog would not be the one that gets saved. Both choices
   * hand undo straight back.
   */
  private get historyFrozen(): boolean {
    return this.status.kind === "conflict";
  }

  get canUndo(): boolean {
    return !this.historyFrozen && this.history.committed(this.document).canUndo;
  }

  get canRedo(): boolean {
    return !this.historyFrozen && this.history.canRedo;
  }

  /**
   * Undo is deliberately blind to the save machine: the stack survives a save,
   * so undoing past a save point simply makes the document dirty again — which
   * needs no code here, because dirty is a comparison against the snapshot.
   */
  undone(): AnimationEditor {
    if (this.historyFrozen) return this;
    const committed = this.editCommitted();
    const move = committed.history.undo(committed.document);
    if (move === null) return this;
    return committed.with(
      move.document,
      this.saved,
      this.status,
      move.history,
      revealOf(committed.document, move.document),
    );
  }

  redone(): AnimationEditor {
    if (this.historyFrozen) return this;
    const move = this.history.redo(this.document);
    if (move === null) return this;
    return this.with(
      move.document,
      this.saved,
      this.status,
      move.history,
      revealOf(this.document, move.document),
    );
  }

  /**
   * Begin a guarded save of the document as it stands.
   *
   * The request captures the document by value, so edits made while the save is
   * in flight belong to the next save rather than retroactively joining this
   * one. A conflict is resolved through its own two choices, so a save cannot
   * be started out from under one.
   */
  saveStarted(): AnimationEditor {
    if (!this.canSave || this.status.kind === "conflict") return this;
    return this.with(this.document, this.saved, {
      kind: "saving",
      request: { document: this.document, expectedUpdatedAt: this.saved.updatedAt },
    });
  }

  /**
   * The server accepted the write and returned the row it stored.
   *
   * The snapshot becomes that row rather than the document that was sent: the
   * server trims name and description, and adopting its version is what stops a
   * successful save from leaving the editor immediately dirty again.
   */
  saveSucceeded(record: LoadedAnimation): AnimationEditor {
    if (this.status.kind !== "saving") return this;
    const document = documentFromRecord(record);
    const wasOnlyChange = documentsEqual(this.document, this.status.request.document);
    return this.with(
      // an edit landed while the save was in flight: it stays, and stays dirty
      wasOnlyChange ? document : this.document,
      { document, updatedAt: record.updatedAt },
      { kind: "idle" },
    );
  }

  /** The guard did not match: someone else wrote first. */
  saveConflicted(server: LoadedAnimation): AnimationEditor {
    if (this.status.kind !== "saving") return this;
    return this.with(this.document, this.saved, {
      kind: "conflict",
      server,
      request: this.status.request,
    });
  }

  saveFailed(message: string): AnimationEditor {
    if (this.status.kind !== "saving") return this;
    return this.with(this.document, this.saved, { kind: "failed", message });
  }

  errorDismissed(): AnimationEditor {
    if (this.status.kind !== "failed") return this;
    return this.with(this.document, this.saved, { kind: "idle" });
  }

  /** Conflict choice: my version wins. Resend it with no guard. */
  overwriteRequested(): AnimationEditor {
    if (this.status.kind !== "conflict") return this;
    return this.with(this.document, this.saved, {
      kind: "saving",
      request: { document: this.status.request.document, expectedUpdatedAt: null },
    });
  }

  /**
   * Conflict choice: discard mine, load newest.
   *
   * The record travelled on the error, so there is nothing to refetch. Losing
   * the work is recoverable: adopting the server's copy is a step of its own,
   * so the discarded document is one Ctrl+Z away.
   */
  serverAdopted(): AnimationEditor {
    if (this.status.kind !== "conflict") return this;
    const server = this.status.server;
    const document = documentFromRecord(server);
    const committed = this.editCommitted();
    return committed.with(
      document,
      { document, updatedAt: server.updatedAt },
      { kind: "idle" },
      committed.history.record(committed.document, document, { kind: "immediate" }, this.now()),
    );
  }
}
