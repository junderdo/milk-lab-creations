/**
 * The device-local safety net: the document being edited, mirrored into
 * `localStorage` so that closing a tab never silently loses work.
 *
 * A draft is a convenience layer, never the persistence — explicit Save is.
 * Every storage call is therefore wrapped and silently degraded: a browser in
 * private mode, a full quota or a blocked origin costs the net, not the editor.
 * For the same reason the undo stack is not stored. A draft is one document,
 * the server version it was edited on top of, and when it was written.
 *
 * Storage, the clock and the debounce timer all arrive from outside, which is
 * what lets a lifecycle spanning a tab close be exercised as a few synchronous
 * calls in a plain node test.
 */

import {
  documentFromRecord,
  documentsEqual,
  keyframesOf,
  type EditorDocument,
} from "./document";

export const DRAFT_VERSION = 1;

/** Long enough that a drag or a typed word is one write, short enough to survive a crash. */
export const DRAFT_DEBOUNCE_MS = 1000;

/** The slice of `Storage` a draft needs — the seam tests substitute. */
export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** A pending write, replaceable and cancellable — the debounce, as an interface. */
export interface DraftSchedule {
  after(delayMs: number, run: () => void): void;
  cancel(): void;
}

export interface Draft {
  document: EditorDocument;
  /** The server `updatedAt` this draft was edited on top of; `null` if never saved. */
  baseUpdatedAt: Date | null;
  savedAt: Date;
}

/** What the server has right now, to decide a draft against. */
export interface DraftBase {
  document: EditorDocument;
  updatedAt: Date | null;
}

/**
 * Nothing to ask about, or a draft to offer.
 *
 * `stale` means the draft was written on top of a version the server has since
 * moved past — the dialog says so more loudly, but restoring is still allowed:
 * the collision itself is adjudicated at save time by the conflict dialog.
 */
export type DraftOffer = { kind: "none" } | { kind: "offer"; draft: Draft; stale: boolean };

const KEY_PREFIX = "milklab:editor-draft:";

/** `null` is the single slot for an animation that does not exist server-side yet. */
export function draftKeyFor(animationId: string | null): string {
  return `${KEY_PREFIX}${animationId ?? "new"}`;
}

/** `localStorage`, or a stand-in when the browser refuses to hand it over. */
export function localDraftStorage(): DraftStorage {
  try {
    // absent during SSR, and an access that throws outright on a blocked origin
    if (globalThis.localStorage !== undefined) return globalThis.localStorage;
  } catch {
    // fall through to the stand-in
  }
  return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

export function timeoutSchedule(): DraftSchedule {
  let pending: ReturnType<typeof setTimeout> | undefined;
  return {
    after(delayMs, run) {
      clearTimeout(pending);
      pending = setTimeout(run, delayMs);
    },
    cancel() {
      clearTimeout(pending);
      pending = undefined;
    },
  };
}

interface WriterOptions {
  storage: DraftStorage;
  key: string;
  schedule?: DraftSchedule;
  now?: () => number;
}

/**
 * Keeps one key in step with the document, on a debounce.
 *
 * Mutable and side-effecting, unlike the rest of the editor modules: it owns a
 * timer and a slot in storage, both of which are singular by nature. The editor
 * state stays immutable and knows nothing about it.
 */
export class DraftWriter {
  private readonly storage: DraftStorage;
  private readonly key: string;
  private readonly schedule: DraftSchedule;
  private readonly now: () => number;
  private pending: { document: EditorDocument; baseUpdatedAt: Date | null } | null = null;

  constructor({
    storage,
    key,
    schedule = timeoutSchedule(),
    now = Date.now,
  }: WriterOptions) {
    this.storage = storage;
    this.key = key;
    this.schedule = schedule;
    this.now = now;
  }

  documentChanged(document: EditorDocument, baseUpdatedAt: Date | null): void {
    this.pending = { document, baseUpdatedAt };
    this.schedule.after(DRAFT_DEBOUNCE_MS, () => this.flush());
  }

  /** Write what is pending now — the tab is hiding, or the editor is going away. */
  flush(): void {
    this.schedule.cancel();
    const pending = this.pending;
    if (pending === null) return;
    this.pending = null;

    try {
      this.storage.setItem(
        this.key,
        JSON.stringify({
          draftVersion: DRAFT_VERSION,
          document: pending.document,
          baseUpdatedAt: pending.baseUpdatedAt,
          savedAt: new Date(this.now()),
        }),
      );
    } catch {
      // a full quota or a blocked origin costs the draft, not the edit
    }
  }

  /** The work is safe, or the user said to drop it. Any pending write goes too. */
  discard(): void {
    this.schedule.cancel();
    this.pending = null;
    try {
      this.storage.removeItem(this.key);
    } catch {
      // nothing to do about a storage that will not answer
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * A document out of a stored envelope.
 *
 * The same boundary parse the API gets, for the same reason: what comes back is
 * whatever an older build of this app — or another tab, or a devtools console —
 * left behind. A draft with no keyframes is not a document the editor can open,
 * so it counts as unreadable rather than as an empty animation.
 */
function documentFrom(value: unknown): EditorDocument | null {
  if (!isRecord(value) || typeof value.name !== "string") return null;
  const description = typeof value.description === "string" ? value.description : null;
  const document = documentFromRecord({ name: value.name, description, payload: value.payload });
  return keyframesOf(document).length === 0 ? null : document;
}

function draftFrom(raw: string): Draft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.draftVersion !== DRAFT_VERSION) return null;

  const document = documentFrom(parsed.document);
  const savedAt = asDate(parsed.savedAt);
  if (document === null || savedAt === null) return null;
  return { document, savedAt, baseUpdatedAt: asDate(parsed.baseUpdatedAt) };
}

function sameVersion(base: Date | null, server: Date | null): boolean {
  return (base?.getTime() ?? null) === (server?.getTime() ?? null);
}

/**
 * The draft decision made on editor entry, before editing begins.
 *
 * A draft that says nothing the server does not already have — or that cannot
 * be read at all — is deleted here and never mentioned: a prompt offering to
 * restore what is already on screen is a prompt that teaches people to dismiss
 * prompts. Anything else is the caller's to ask about, and stays in storage
 * until they answer.
 */
export function takeDraft(storage: DraftStorage, key: string, server: DraftBase): DraftOffer {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return { kind: "none" };
  }
  if (raw === null) return { kind: "none" };

  const draft = draftFrom(raw);
  if (draft === null || documentsEqual(draft.document, server.document)) {
    try {
      storage.removeItem(key);
    } catch {
      // it stays until the next entry, where it lands here again
    }
    return { kind: "none" };
  }

  return { kind: "offer", draft, stale: !sameVersion(draft.baseUpdatedAt, server.updatedAt) };
}
