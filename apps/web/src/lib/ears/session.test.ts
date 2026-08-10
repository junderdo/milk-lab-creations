import { afterEach, describe, expect, it, vi } from "vitest";
import { REQUEST_TIMEOUT_MS, STORE_TYPE, SUB_OPCODE } from "./protocol";
import { BOOTSTRAP_CHUNK_BYTES, createSession, type EarsLink } from "./session";
import { STATUS_CODE } from "./status";

interface FakeLink {
  readonly link: EarsLink;
  readonly writes: Uint8Array[];
  respond(bytes: number[]): void;
  drop(): void;
  breakWrites(): void;
}

function fakeLink(): FakeLink {
  const writes: Uint8Array[] = [];
  const onResponse: ((value: ArrayBufferLike) => void)[] = [];
  const onDisconnect: (() => void)[] = [];
  let writesBroken = false;

  return {
    writes,
    link: {
      deviceName: "ROBO_CAT_EARS",
      write: async (frame) => {
        if (writesBroken) throw new Error("GATT operation failed");
        writes.push(frame);
      },
      onResponse: (handler) => onResponse.push(handler),
      onDisconnect: (handler) => onDisconnect.push(handler),
      disconnect: () => {
        for (const handler of onDisconnect) handler();
      },
    },
    respond: (bytes) => {
      for (const handler of onResponse) handler(new Uint8Array(bytes).buffer);
    },
    drop: () => {
      for (const handler of onDisconnect) handler();
    },
    breakWrites: () => {
      writesBroken = true;
    },
  };
}

/** Let the request's own awaits run without letting a timer fire. */
async function settleMicrotasks(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

const capabilityResponse = (corr: number) => [
  STORE_TYPE,
  corr,
  STATUS_CODE.ok,
  0,
  1,
  1,
  16,
  0x01,
  0xfd,
];
const emptyResponse = (corr: number, status: number) => [STORE_TYPE, corr, status, 0, 1];

afterEach(() => {
  vi.useRealTimers();
});

describe("createSession", () => {
  it("writes a request at the bootstrap chunk size before CAPABILITY is known", async () => {
    const fake = fakeLink();
    const session = createSession(fake.link);

    const outcome = session.request(SUB_OPCODE.capability, new Uint8Array(0));
    await settleMicrotasks();
    fake.respond(capabilityResponse(0));

    expect(await outcome).toEqual({ kind: "ok", payload: new Uint8Array([1, 16, 0x01, 0xfd]) });
    expect(session.maxChunkBytes).toBe(BOOTSTRAP_CHUNK_BYTES);
    expect([...(fake.writes[0] ?? [])]).toEqual([STORE_TYPE, 0, SUB_OPCODE.capability, 0, 1]);
  });

  it("serializes two requests issued at once rather than sending them concurrently", async () => {
    const fake = fakeLink();
    const session = createSession(fake.link);

    const first = session.request(SUB_OPCODE.capability, new Uint8Array(0));
    const second = session.request(SUB_OPCODE.list, new Uint8Array(0));
    await settleMicrotasks();

    expect(fake.writes).toHaveLength(1);

    fake.respond(capabilityResponse(0));
    await first;
    await settleMicrotasks();

    expect(fake.writes).toHaveLength(2);
    expect(fake.writes[1]?.[2]).toBe(SUB_OPCODE.list);

    fake.respond([STORE_TYPE, 1, STATUS_CODE.ok, 0, 1, 0]);
    expect(await second).toMatchObject({ kind: "ok" });
  });

  it("chunks a later request against the size CAPABILITY reported", async () => {
    const fake = fakeLink();
    const session = createSession(fake.link);
    session.maxChunkBytes = 509;

    const outcome = session.request(SUB_OPCODE.store, new Uint8Array(600));
    await settleMicrotasks();

    expect(fake.writes.map((frame) => frame.length)).toEqual([509, 5 + 96]);

    fake.respond(emptyResponse(0, STATUS_CODE.ok));
    await outcome;
  });

  it("turns a non-OK status into a failure carrying the copy and the code", async () => {
    const fake = fakeLink();
    const session = createSession(fake.link);

    const outcome = session.request(SUB_OPCODE.play, new Uint8Array([3]));
    await settleMicrotasks();
    fake.respond(emptyResponse(0, STATUS_CODE.slotEmpty));

    expect(await outcome).toMatchObject({
      kind: "failed",
      status: { code: STATUS_CODE.slotEmpty, name: "SLOT_EMPTY" },
    });
  });

  it("reports silence as an unknown outcome, never a failure", async () => {
    vi.useFakeTimers();
    const fake = fakeLink();
    const session = createSession(fake.link);

    const outcome = session.request(SUB_OPCODE.list, new Uint8Array(0));
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);

    expect(await outcome).toEqual({ kind: "unknown" });
  });

  it("ignores a response that arrives after its request gave up", async () => {
    vi.useFakeTimers();
    const fake = fakeLink();
    const session = createSession(fake.link);

    const abandoned = session.request(SUB_OPCODE.list, new Uint8Array(0));
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await abandoned;

    const next = session.request(SUB_OPCODE.capability, new Uint8Array(0));
    let settled = false;
    void next.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(0);
    fake.respond([STORE_TYPE, 0, STATUS_CODE.ok, 0, 1, 9]); // the abandoned request's corr
    await vi.advanceTimersByTimeAsync(0);

    expect(settled).toBe(false);

    fake.respond(capabilityResponse(1));
    expect(await next).toMatchObject({ kind: "ok" });
  });

  it("ignores a value on the notify characteristic that is not a store response", async () => {
    const fake = fakeLink();
    const session = createSession(fake.link);

    const outcome = session.request(SUB_OPCODE.capability, new Uint8Array(0));
    await settleMicrotasks();
    fake.respond([0x02, 0, 30, 1]); // lighting state, readable on the same characteristic
    await settleMicrotasks();
    fake.respond(capabilityResponse(0));

    expect(await outcome).toMatchObject({ kind: "ok" });
  });

  it("lands the in-flight request and every later one on link-lost when the ears go away", async () => {
    const fake = fakeLink();
    const session = createSession(fake.link);

    const inFlight = session.request(SUB_OPCODE.list, new Uint8Array(0));
    await settleMicrotasks();
    fake.drop();

    expect(await inFlight).toEqual({ kind: "link-lost" });
    expect(await session.request(SUB_OPCODE.list, new Uint8Array(0))).toEqual({
      kind: "link-lost",
    });
  });

  it("treats a write that rejects as a lost link rather than a failure", async () => {
    const fake = fakeLink();
    const session = createSession(fake.link);
    fake.breakWrites();

    expect(await session.request(SUB_OPCODE.list, new Uint8Array(0))).toEqual({
      kind: "link-lost",
    });
  });

  it("reassembles a response split across frames", async () => {
    const fake = fakeLink();
    const session = createSession(fake.link);

    const outcome = session.request(SUB_OPCODE.list, new Uint8Array(0));
    await settleMicrotasks();
    fake.respond([STORE_TYPE, 0, STATUS_CODE.ok, 0, 2, 1, 2]);
    fake.respond([STORE_TYPE, 0, STATUS_CODE.ok, 1, 2, 3]);

    expect(await outcome).toEqual({ kind: "ok", payload: new Uint8Array([1, 2, 3]) });
  });
});
