import { describe, expect, it } from "vitest";
import { buildSlots, SUB_OPCODE, type Slot } from "./protocol";
import type { EarsSession, RequestOptions, RequestOutcome } from "./session";
import { STATUS_CODE } from "./status";
import { defaultSlot, sendToSlot } from "./upload";

const ANIMATION_ID = "00112233-4455-6677-8899-aabbccddeeff";
const OTHER_ID = "ffeeddcc-bbaa-9988-7766-554433221100";

function occupied(index: number, animationId: string | null, name: string): Slot {
  return { index, entry: { index, animationId, name } };
}

function listPayloadFor(entries: readonly { index: number; id: string; name: string }[]) {
  const bytes: number[] = [entries.length];
  for (const entry of entries) {
    bytes.push(entry.index);
    const hex = entry.id.replaceAll("-", "");
    for (let i = 0; i < 16; i++) bytes.push(Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16));
    const name = [...new TextEncoder().encode(entry.name)];
    bytes.push(name.length, ...name);
  }
  return new Uint8Array(bytes);
}

interface FakeSession {
  readonly session: EarsSession;
  readonly requests: { subOpcode: number; payload: Uint8Array }[];
}

function fakeSession(outcomes: RequestOutcome[]): FakeSession {
  const requests: { subOpcode: number; payload: Uint8Array }[] = [];
  const queued = [...outcomes];

  return {
    requests,
    session: {
      deviceId: "ears-1",
      deviceName: "ROBO_CAT_EARS",
      maxChunkBytes: 512,
      request: (subOpcode, payload, options?: RequestOptions) => {
        requests.push({ subOpcode, payload });
        const outcome = queued.shift() ?? { kind: "link-lost" as const };
        if (outcome.kind === "ok" || outcome.kind === "failed") {
          options?.onProgress?.(1, 1);
        }
        return Promise.resolve(outcome);
      },
      disconnect: () => undefined,
    },
  };
}

const wire = new Uint8Array([1, 0, 0, 90, 90, 90, 90, 0, 0, 0, 0, 0, 0]);

function request(slot: number, slots: readonly Slot[] = buildSlots(4, [])) {
  return { slot, animationId: ANIMATION_ID, name: "Tail flick", wire, slots };
}

describe("defaultSlot", () => {
  it("is the slot already holding this animation", () => {
    const slots = [
      occupied(0, OTHER_ID, "Something else"),
      occupied(1, ANIMATION_ID, "Tail flick"),
      { index: 2, entry: null },
    ];
    expect(defaultSlot(slots, ANIMATION_ID)).toBe(1);
  });

  it("falls back to the first empty slot", () => {
    const slots = [occupied(0, OTHER_ID, "Something else"), { index: 1, entry: null }];
    expect(defaultSlot(slots, ANIMATION_ID)).toBe(1);
  });

  it("prefers the matching slot over an earlier empty one", () => {
    const slots = [{ index: 0, entry: null }, occupied(1, ANIMATION_ID, "Tail flick")];
    expect(defaultSlot(slots, ANIMATION_ID)).toBe(1);
  });

  it("has no default when the store is full and holds nothing of ours", () => {
    const slots = [occupied(0, OTHER_ID, "A"), occupied(1, null, "Made on the ears")];
    expect(defaultSlot(slots, ANIMATION_ID)).toBeUndefined();
  });
});

describe("sendToSlot", () => {
  it("sends one STORE and reports the slot list with the animation in place", async () => {
    const fake = fakeSession([{ kind: "ok", payload: new Uint8Array(0) }]);

    const result = await sendToSlot(fake.session, request(2));

    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]?.subOpcode).toBe(SUB_OPCODE.store);
    expect(result.kind).toBe("stored");
    expect(result.slots?.[2]?.entry).toEqual({
      index: 2,
      animationId: ANIMATION_ID,
      name: "Tail flick",
    });
  });

  it("leaves the other slots exactly as they were", async () => {
    const fake = fakeSession([{ kind: "ok", payload: new Uint8Array(0) }]);
    const before = buildSlots(4, [{ index: 0, animationId: OTHER_ID, name: "Something else" }]);

    const result = await sendToSlot(fake.session, request(2, before));

    expect(result.slots?.[0]?.entry?.name).toBe("Something else");
    expect(result.slots).toHaveLength(4);
  });

  it("reports frame progress against the real count", async () => {
    const fake = fakeSession([{ kind: "ok", payload: new Uint8Array(0) }]);
    const progress: [number, number][] = [];

    await sendToSlot(fake.session, request(0), {
      onProgress: (sent, total) => progress.push([sent, total]),
    });

    expect(progress).toEqual([[1, 1]]);
  });

  it("turns a nack into that status code's sentence and leaves the slots alone", async () => {
    const fake = fakeSession([
      {
        kind: "failed",
        status: {
          code: STATUS_CODE.invalidName,
          name: "INVALID_NAME",
          message: "Your ears wouldn't take that name.",
        },
      },
    ]);

    const result = await sendToSlot(fake.session, request(1));

    expect(result.kind).toBe("not-stored");
    expect(result.message).toContain("name");
    expect(result.message).toContain("INVALID_NAME");
    expect(result.slots).toBeNull();
  });

  it("sends nothing more after the first error", async () => {
    const fake = fakeSession([
      {
        kind: "failed",
        status: { code: STATUS_CODE.tooLarge, name: "TOO_LARGE", message: "Too big." },
      },
    ]);

    await sendToSlot(fake.session, request(1));

    expect(fake.requests).toHaveLength(1);
  });

  it("re-reads LIST after silence and reports that it did save", async () => {
    const fake = fakeSession([
      { kind: "unknown" },
      {
        kind: "ok",
        payload: listPayloadFor([{ index: 3, id: ANIMATION_ID, name: "Tail flick" }]),
      },
    ]);

    const result = await sendToSlot(fake.session, request(3));

    expect(fake.requests.map((r) => r.subOpcode)).toEqual([SUB_OPCODE.store, SUB_OPCODE.list]);
    expect(result.kind).toBe("stored");
    expect(result.message).toContain("went quiet");
    expect(result.slots?.[3]?.entry?.animationId).toBe(ANIMATION_ID);
  });

  it("re-reads LIST after silence and reports that it did not save", async () => {
    const fake = fakeSession([
      { kind: "unknown" },
      { kind: "ok", payload: listPayloadFor([{ index: 0, id: OTHER_ID, name: "Something else" }]) },
    ]);

    const result = await sendToSlot(fake.session, request(3));

    expect(result.kind).toBe("not-stored");
    expect(result.message).toContain("went quiet");
    expect(result.slots?.[3]?.entry).toBeNull();
  });

  it("never retries the store, whatever the re-read says", async () => {
    const fake = fakeSession([{ kind: "unknown" }, { kind: "ok", payload: listPayloadFor([]) }]);

    await sendToSlot(fake.session, request(3));

    expect(fake.requests.filter((r) => r.subOpcode === SUB_OPCODE.store)).toHaveLength(1);
  });

  it("says it cannot tell when the re-read itself fails", async () => {
    const fake = fakeSession([{ kind: "unknown" }, { kind: "link-lost" }]);

    const result = await sendToSlot(fake.session, request(3));

    expect(result.kind).toBe("unclear");
    expect(result.slots).toBeNull();
  });

  it("announces the check before it runs, so a slow re-read is not a hang", async () => {
    const fake = fakeSession([{ kind: "unknown" }, { kind: "ok", payload: listPayloadFor([]) }]);
    const announced: string[] = [];

    await sendToSlot(fake.session, request(3), { onChecking: (m) => announced.push(m) });

    expect(announced).toHaveLength(1);
    expect(announced[0]).toContain("went quiet");
    expect(announced[0]).toContain("Checking whether it saved");
  });

  it("puts a lost link through the same check rather than calling it a failure", async () => {
    const fake = fakeSession([
      { kind: "link-lost" },
      { kind: "ok", payload: listPayloadFor([{ index: 1, id: ANIMATION_ID, name: "Tail flick" }]) },
    ]);
    const announced: string[] = [];

    const result = await sendToSlot(fake.session, request(1), {
      onChecking: (m) => announced.push(m),
    });

    expect(announced[0]).toContain("disconnected");
    expect(fake.requests.map((r) => r.subOpcode)).toEqual([SUB_OPCODE.store, SUB_OPCODE.list]);
    expect(result.kind).toBe("stored");
  });

  it("reports a lost link it cannot check as unknown, never as a failure", async () => {
    const fake = fakeSession([{ kind: "link-lost" }, { kind: "link-lost" }]);

    const result = await sendToSlot(fake.session, request(1));

    expect(result.kind).toBe("unclear");
    expect(result.message).toContain("disconnected");
  });

  it("will not claim success when the slot already held this animation under that name", async () => {
    const before = buildSlots(4, [{ index: 3, animationId: ANIMATION_ID, name: "Tail flick" }]);
    const fake = fakeSession([
      { kind: "unknown" },
      { kind: "ok", payload: listPayloadFor([{ index: 3, id: ANIMATION_ID, name: "Tail flick" }]) },
    ]);

    const result = await sendToSlot(fake.session, request(3, before));

    expect(result.kind).toBe("unclear");
    expect(result.message).toContain("can't tell");
  });

  it("does claim success when the re-read shows the new name in place", async () => {
    const before = buildSlots(4, [{ index: 3, animationId: ANIMATION_ID, name: "Old name" }]);
    const fake = fakeSession([
      { kind: "unknown" },
      { kind: "ok", payload: listPayloadFor([{ index: 3, id: ANIMATION_ID, name: "Tail flick" }]) },
    ]);

    const result = await sendToSlot(fake.session, request(3, before));

    expect(result.kind).toBe("stored");
  });

  it("counts a slot holding the right id under the wrong name as not saved", async () => {
    const fake = fakeSession([
      { kind: "unknown" },
      { kind: "ok", payload: listPayloadFor([{ index: 3, id: ANIMATION_ID, name: "Old name" }]) },
    ]);

    const result = await sendToSlot(fake.session, request(3));

    expect(result.kind).toBe("not-stored");
  });

  it("refuses to send a request it cannot build rather than guessing", async () => {
    const fake = fakeSession([{ kind: "ok", payload: new Uint8Array(0) }]);

    const result = await sendToSlot(fake.session, { ...request(0), name: "" });

    expect(result.kind).toBe("not-stored");
    expect(fake.requests).toHaveLength(0);
  });
});

describe("buildSlots", () => {
  it("is what the grid renders, occupied and empty alike", () => {
    expect(buildSlots(2, [{ index: 1, animationId: ANIMATION_ID, name: "Tail flick" }])).toEqual([
      { index: 0, entry: null },
      { index: 1, entry: { index: 1, animationId: ANIMATION_ID, name: "Tail flick" } },
    ]);
  });
});
