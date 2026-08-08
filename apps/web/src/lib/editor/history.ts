/**
 * The editor's undo stack: a list of documents, and the rules for when a new
 * one becomes a step.
 *
 * Because every document mutation is already a pure value (`document.ts`), the
 * stack itself is trivial — two arrays of documents. The real content of this
 * module is *granularity*: a drag that crosses two hundred pointer frames is one
 * step, a typing burst is one step per pause, and an ease change is a step on
 * its own so two eases can be A/B'd with Ctrl+Z. That is expressed as an
 * `EditIntent` carried by each edit, plus a `pending` marker for the step
 * currently being accumulated.
 *
 * The current document lives in the editor, not here, so it is passed in to
 * `undo`/`redo`/`committed`. Keeping one copy of it means the stack can never
 * drift out of step with what is on screen.
 *
 * View state is absent by construction: nothing here can hold a playhead or a
 * selection, because a step is an `EditorDocument` and a document has neither.
 */

import { documentsEqual, type EditorDocument } from "./document";

/**
 * What kind of edit produced a document, and therefore whether it extends the
 * step in progress or begins a new one.
 *
 * - `immediate` — its own step, always (add, delete, ease change, adopting the
 *   server's copy on a conflict).
 * - `gesture` — everything under one continuous pointer press with the same
 *   `id` is one step, closed by `committed` on release.
 * - `typing` — keystrokes in one field coalesce until a pause or a blur.
 */
export type EditIntent =
  | { kind: "immediate" }
  | { kind: "gesture"; id: string }
  | { kind: "typing"; field: string };

/** Idle long enough that the next keystroke reads as a new thought. */
export const TYPING_PAUSE_MS = 500;

/** Steps kept before the oldest drops off, silently. */
export const HISTORY_DEPTH = 100;

interface Pending {
  intent: EditIntent;
  /** When the last edit of this step landed — the clock the pause is measured from. */
  at: number;
}

/** The document to move to, and the stack that remains once it is there. */
export interface HistoryMove {
  history: DocumentHistory;
  document: EditorDocument;
}

function extendsStep(pending: Pending, intent: EditIntent, nowMs: number): boolean {
  const open = pending.intent;
  if (open.kind === "gesture" && intent.kind === "gesture") return open.id === intent.id;
  if (open.kind === "typing" && intent.kind === "typing") {
    return open.field === intent.field && nowMs - pending.at <= TYPING_PAUSE_MS;
  }
  return false;
}

export class DocumentHistory {
  private constructor(
    private readonly past: EditorDocument[],
    private readonly future: EditorDocument[],
    private readonly pending: Pending | null,
  ) {}

  static empty(): DocumentHistory {
    return new DocumentHistory([], [], null);
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /**
   * Note that `before` became `after`.
   *
   * A step is pushed at its *start*, holding the document as it was before the
   * first edit of the step. Every later edit of the same step then only moves
   * the document, leaving the stack alone — which is exactly what makes a drag
   * cost one entry no matter how many frames it emits.
   */
  record(
    before: EditorDocument,
    after: EditorDocument,
    intent: EditIntent,
    nowMs: number,
  ): DocumentHistory {
    if (documentsEqual(before, after)) return this;

    const pending = { intent, at: nowMs };
    if (this.pending !== null && extendsStep(this.pending, intent, nowMs)) {
      return new DocumentHistory(this.past, this.future, pending);
    }
    return new DocumentHistory(capped([...this.past, before]), [], pending);
  }

  /**
   * Close the step in progress: pointer released, or the field blurred.
   *
   * A gesture that ended where it started leaves nothing worth undoing — a dot
   * dragged and put back should not cost a Ctrl+Z — so its entry is dropped
   * here, once `current` is known to match it.
   */
  committed(current: EditorDocument): DocumentHistory {
    if (this.pending === null) return this;
    const previous = this.past.at(-1);
    const noop = previous !== undefined && documentsEqual(previous, current);
    return new DocumentHistory(noop ? this.past.slice(0, -1) : this.past, this.future, null);
  }

  undo(current: EditorDocument): HistoryMove | null {
    const previous = this.past.at(-1);
    if (previous === undefined) return null;
    return {
      history: new DocumentHistory(this.past.slice(0, -1), [current, ...this.future], null),
      document: previous,
    };
  }

  redo(current: EditorDocument): HistoryMove | null {
    const [next, ...rest] = this.future;
    if (next === undefined) return null;
    return {
      history: new DocumentHistory(capped([...this.past, current]), rest, null),
      document: next,
    };
  }
}

function capped(past: EditorDocument[]): EditorDocument[] {
  return past.length > HISTORY_DEPTH ? past.slice(past.length - HISTORY_DEPTH) : past;
}
