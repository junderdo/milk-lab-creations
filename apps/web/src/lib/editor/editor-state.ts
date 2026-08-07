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
  setAngle,
  setDescription,
  setEase,
  setName,
  setTime,
  type EasePatch,
  type EditorDocument,
  type RobotLimits,
  type SaveRequest,
} from "./document";

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
  private readonly saved: SavedSnapshot;

  private constructor(
    animationId: string,
    limits: RobotLimits,
    document: EditorDocument,
    saved: SavedSnapshot,
    status: SaveStatus,
  ) {
    this.animationId = animationId;
    this.limits = limits;
    this.document = document;
    this.saved = saved;
    this.status = status;
  }

  static open(record: LoadedAnimation, limits: RobotLimits): AnimationEditor {
    const document = documentFromRecord(record);
    return new AnimationEditor(
      record.id,
      limits,
      document,
      { document, updatedAt: record.updatedAt },
      { kind: "idle" },
    );
  }

  private with(document: EditorDocument, saved: SavedSnapshot, status: SaveStatus) {
    return new AnimationEditor(this.animationId, this.limits, document, saved, status);
  }

  /** An edit leaves the save machine alone — saving while typing is allowed. */
  private edited(document: EditorDocument): AnimationEditor {
    return document === this.document ? this : this.with(document, this.saved, this.status);
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
    return this.edited(setName(this.document, name));
  }

  setDescription(description: string): AnimationEditor {
    return this.edited(setDescription(this.document, description));
  }

  setAngle(index: number, channel: number, angle: number): AnimationEditor {
    return this.edited(setAngle(this.document, this.limits, index, channel, angle));
  }

  setTime(index: number, timeMs: number): AnimationEditor {
    return this.edited(setTime(this.document, this.limits, index, timeMs));
  }

  setEase(index: number, patch: EasePatch): AnimationEditor {
    return this.edited(setEase(this.document, this.limits, index, patch));
  }

  addKeyframeAt(timeMs: number): AnimationEditor {
    return this.edited(addKeyframeAt(this.document, this.limits, timeMs));
  }

  removeKeyframe(index: number): AnimationEditor {
    return this.edited(removeKeyframe(this.document, index));
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
   * The record travelled on the error, so there is nothing to refetch. Once
   * undo lands this is recoverable — the stack survives, and the discarded
   * document is one step back.
   */
  serverAdopted(): AnimationEditor {
    if (this.status.kind !== "conflict") return this;
    const server = this.status.server;
    const document = documentFromRecord(server);
    return this.with(document, { document, updatedAt: server.updatedAt }, { kind: "idle" });
  }
}
