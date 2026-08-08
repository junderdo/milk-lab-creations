/**
 * Drafts as sequences: edit, let the debounce fire, reopen, decide. Storage,
 * clock and the debounce timer are all injected, so a lifecycle that spans a
 * tab close is a handful of synchronous calls.
 */

import { describe, expect, it } from "vitest";
import { documentFromRecord, type EditorDocument } from "./document";
import {
  DRAFT_DEBOUNCE_MS,
  DraftWriter,
  draftKeyFor,
  takeDraft,
  type DraftSchedule,
  type DraftStorage,
} from "./draft";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parsedObject(raw: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) throw new Error(`not a draft envelope: ${raw}`);
  return parsed;
}

const ease = { easeInType: 1, easeOutType: 1, easeInMs: 150, easeOutMs: 150 } as const;

const SERVER_UPDATED_AT = new Date("2026-08-05T12:00:00.000Z");

const serverDocument = documentFromRecord({
  name: "Ear wiggle",
  description: "twitchy",
  payload: {
    schemaVersion: 1,
    keyframes: [
      { timeMs: 0, angles: [90, 90, 90, 90], ...ease },
      { timeMs: 500, angles: [40, 80, 140, 100], ...ease },
    ],
  },
});

function edited(document: EditorDocument, name: string): EditorDocument {
  return { ...document, name };
}

/** A `localStorage` stand-in that can be told to fail the way a full quota does. */
function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  let failing = false;
  const refuse = () => {
    if (failing) throw new Error("QuotaExceededError");
  };
  return {
    items,
    fail() {
      failing = true;
    },
    getItem(key: string) {
      refuse();
      return items.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      refuse();
      items.set(key, value);
    },
    removeItem(key: string) {
      refuse();
      items.delete(key);
    },
  };
}

/** The debounce, made explicit: nothing runs until the test says the delay elapsed. */
function fakeSchedule() {
  let pending: (() => void) | null = null;
  let delayMs: number | null = null;
  return {
    delay: () => delayMs,
    scheduled: () => pending !== null,
    elapse() {
      const run = pending;
      pending = null;
      delayMs = null;
      run?.();
    },
    after(ms: number, run: () => void) {
      pending = run;
      delayMs = ms;
    },
    cancel() {
      pending = null;
      delayMs = null;
    },
  };
}

const KEY = draftKeyFor("anim-1");

function writerOn(storage: DraftStorage, schedule: DraftSchedule, at = 1_000) {
  return new DraftWriter({ storage, key: KEY, schedule, now: () => at });
}

function envelopeIn(storage: ReturnType<typeof fakeStorage>): Record<string, unknown> {
  const raw = storage.items.get(KEY);
  if (raw === undefined) throw new Error("expected a draft to have been written");
  return parsedObject(raw);
}

describe("draft keys", () => {
  it("scopes a draft to its animation, with one slot for an uncreated one", () => {
    expect(draftKeyFor("anim-1")).toBe("milklab:editor-draft:anim-1");
    expect(draftKeyFor(null)).toBe("milklab:editor-draft:new");
  });
});

describe("writing", () => {
  it("waits out the debounce before touching storage", () => {
    const storage = fakeStorage();
    const schedule = fakeSchedule();
    const writer = writerOn(storage, schedule);

    writer.documentChanged(edited(serverDocument, "Renamed"), SERVER_UPDATED_AT);
    expect(storage.items.size).toBe(0);
    expect(schedule.delay()).toBe(DRAFT_DEBOUNCE_MS);

    schedule.elapse();
    expect(envelopeIn(storage)).toMatchObject({
      draftVersion: 1,
      baseUpdatedAt: SERVER_UPDATED_AT.toISOString(),
      savedAt: new Date(1_000).toISOString(),
    });
  });

  it("writes the last document of a burst, once", () => {
    const storage = fakeStorage();
    const schedule = fakeSchedule();
    const writer = writerOn(storage, schedule);

    writer.documentChanged(edited(serverDocument, "R"), SERVER_UPDATED_AT);
    writer.documentChanged(edited(serverDocument, "Re"), SERVER_UPDATED_AT);
    writer.documentChanged(edited(serverDocument, "Renamed"), SERVER_UPDATED_AT);
    schedule.elapse();

    expect(envelopeIn(storage).document).toMatchObject({ name: "Renamed" });
    expect(schedule.scheduled()).toBe(false);
  });

  it("flushes what is pending immediately — the tab is going away", () => {
    const storage = fakeStorage();
    const schedule = fakeSchedule();
    const writer = writerOn(storage, schedule);

    writer.documentChanged(edited(serverDocument, "Renamed"), SERVER_UPDATED_AT);
    writer.flush();

    expect(envelopeIn(storage).document).toMatchObject({ name: "Renamed" });
    expect(schedule.scheduled()).toBe(false);
    // and the flush consumed it: a second one has nothing left to write
    storage.items.delete(KEY);
    writer.flush();
    expect(storage.items.size).toBe(0);
  });

  it("degrades silently when storage refuses the write", () => {
    const storage = fakeStorage();
    const schedule = fakeSchedule();
    const writer = writerOn(storage, schedule);
    storage.fail();

    writer.documentChanged(edited(serverDocument, "Renamed"), SERVER_UPDATED_AT);
    expect(() => schedule.elapse()).not.toThrow();
    expect(() => writer.discard()).not.toThrow();
  });

  it("carries a null base for an animation that does not exist server-side yet", () => {
    const storage = fakeStorage();
    const schedule = fakeSchedule();
    writerOn(storage, schedule).documentChanged(serverDocument, null);
    schedule.elapse();

    expect(envelopeIn(storage).baseUpdatedAt).toBeNull();
  });
});

describe("discarding", () => {
  it("removes the draft and cancels a write that was still pending", () => {
    const storage = fakeStorage({ [KEY]: "anything" });
    const schedule = fakeSchedule();
    const writer = writerOn(storage, schedule);

    writer.documentChanged(edited(serverDocument, "Renamed"), SERVER_UPDATED_AT);
    writer.discard();

    expect(storage.items.has(KEY)).toBe(false);
    expect(schedule.scheduled()).toBe(false);
    // the pending write must not reappear on the next flush
    writer.flush();
    expect(storage.items.has(KEY)).toBe(false);
  });
});

describe("taking a draft on entry", () => {
  const server = { document: serverDocument, updatedAt: SERVER_UPDATED_AT };

  function stored(envelope: unknown) {
    return fakeStorage({ [KEY]: JSON.stringify(envelope) });
  }

  function envelopeFor(document: EditorDocument, baseUpdatedAt: Date | null = SERVER_UPDATED_AT) {
    return { draftVersion: 1, document, baseUpdatedAt, savedAt: "2026-08-05T12:30:00.000Z" };
  }

  it("offers a draft that differs from the server copy", () => {
    const storage = stored(envelopeFor(edited(serverDocument, "Renamed")));
    const offer = takeDraft(storage, KEY, server);

    expect(offer).toEqual({
      draft: {
        document: edited(serverDocument, "Renamed"),
        baseUpdatedAt: SERVER_UPDATED_AT,
        savedAt: new Date("2026-08-05T12:30:00.000Z"),
      },
      stale: false,
    });
    // still there: it is only gone once the choice is made
    expect(storage.items.has(KEY)).toBe(true);
  });

  it("flags a draft written on top of an older server version", () => {
    const storage = stored(envelopeFor(edited(serverDocument, "Renamed"), new Date("2026-08-01")));
    expect(takeDraft(storage, KEY, server)?.stale).toBe(true);
  });

  it("deletes a draft the server copy already matches, with no prompt", () => {
    const storage = stored(envelopeFor(serverDocument));
    expect(takeDraft(storage, KEY, server)).toBeNull();
    expect(storage.items.has(KEY)).toBe(false);
  });

  it("deletes anything it cannot read as a draft", () => {
    for (const junk of [
      "{not json",
      JSON.stringify({ draftVersion: 2, document: serverDocument, savedAt: "2026-08-05" }),
      JSON.stringify(envelopeFor(serverDocument)).replace('"savedAt"', '"wroteAt"'),
      JSON.stringify({ ...envelopeFor(serverDocument), document: { name: 7 } }),
      JSON.stringify({ ...envelopeFor(serverDocument), document: { name: "Empty", payload: {} } }),
    ]) {
      const storage = fakeStorage({ [KEY]: junk });
      expect(takeDraft(storage, KEY, server)).toBeNull();
      expect(storage.items.has(KEY)).toBe(false);
    }
  });

  it("offers nothing when there is no draft, or when storage will not answer", () => {
    expect(takeDraft(fakeStorage(), KEY, server)).toBeNull();

    const refusing = stored(envelopeFor(edited(serverDocument, "Renamed")));
    refusing.fail();
    expect(takeDraft(refusing, KEY, server)).toBeNull();
  });

  it("round-trips what the writer wrote", () => {
    const storage = fakeStorage();
    const schedule = fakeSchedule();
    const document = edited(serverDocument, "Renamed");

    writerOn(storage, schedule).documentChanged(document, SERVER_UPDATED_AT);
    schedule.elapse();
    const offer = takeDraft(storage, KEY, server);

    expect(offer?.draft.document).toEqual(document);
    expect(offer?.draft.savedAt).toEqual(new Date(1_000));
  });

  it("treats a draft on a never-saved animation as fresh, not stale", () => {
    const storage = stored(envelopeFor(edited(serverDocument, "Renamed"), null));
    const offer = takeDraft(storage, KEY, { document: serverDocument, updatedAt: null });

    expect(offer?.stale).toBe(false);
  });
});
