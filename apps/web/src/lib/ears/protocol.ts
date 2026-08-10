/**
 * The `0x06` store surface of the ears' BLE protocol, as pure bytes-in /
 * values-out. No Web Bluetooth here — this module is the half of the client
 * that can be tested without a radio.
 *
 * The contract is `robo-cat-ears/docs/ble-protocol.md` §5–§10. Two of its rules
 * shape everything below: the five-byte header is uniform even on a
 * single-frame request, so reassembly is a transport concern and never a
 * per-command one; and a client ignores trailing bytes it does not understand,
 * which is what makes appending a field to a response non-breaking.
 */

/** `DATA_TYPE_STORE`, the type byte both directions carry. */
export const STORE_TYPE = 0x06;

/** `[type][corr][sub_opcode|status][chunk_index][chunk_count]`. */
export const FRAME_HEADER_BYTES = 5;

/** The one protocol version this client speaks. */
export const KNOWN_PROTOCOL_VERSION = 1;

/** A request goes unanswered for this long before the outcome is unknown. */
export const REQUEST_TIMEOUT_MS = 5_000;

export const SUB_OPCODE = {
  capability: 0x01,
  list: 0x02,
  store: 0x03,
  delete: 0x04,
  play: 0x05,
} as const;

export type SubOpcode = (typeof SUB_OPCODE)[keyof typeof SUB_OPCODE];

/**
 * A frame this app allocated. Spelt out because `BufferSource` will not take a
 * view over a possibly-shared buffer, which is what a bare `Uint8Array` is.
 */
export type Frame = Uint8Array<ArrayBuffer>;

export interface RequestFraming {
  readonly corr: number;
  readonly subOpcode: SubOpcode;
  readonly payload: Uint8Array;
  readonly maxChunkBytes: number;
}

/**
 * The frames to write to `ABF1`, in order, ascending `chunk_index`, one `corr`
 * throughout. A payload-less request is one frame, not zero.
 */
export function encodeRequest({
  corr,
  subOpcode,
  payload,
  maxChunkBytes,
}: RequestFraming): Frame[] {
  const perFrame = maxChunkBytes - FRAME_HEADER_BYTES;
  if (perFrame < 1) {
    throw new Error(`max_chunk_bytes ${maxChunkBytes} leaves no room for a payload`);
  }

  const chunkCount = Math.max(1, Math.ceil(payload.length / perFrame));
  const frames: Frame[] = [];
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
    const chunk = payload.subarray(chunkIndex * perFrame, (chunkIndex + 1) * perFrame);
    const frame = new Uint8Array(FRAME_HEADER_BYTES + chunk.length);
    frame.set([STORE_TYPE, corr, subOpcode, chunkIndex, chunkCount]);
    frame.set(chunk, FRAME_HEADER_BYTES);
    frames.push(frame);
  }
  return frames;
}

export interface ResponseFrame {
  readonly corr: number;
  readonly statusCode: number;
  readonly chunkIndex: number;
  readonly chunkCount: number;
  readonly payload: Uint8Array;
}

/**
 * A store response out of an `ABF2` value, or `undefined` for anything else —
 * the characteristic is multiplexed, and its readable value carries lighting
 * state under a different type byte.
 */
export function parseResponseFrame(bytes: Uint8Array): ResponseFrame | undefined {
  if (bytes.length < FRAME_HEADER_BYTES) return undefined;

  const [type, corr, statusCode, chunkIndex, chunkCount] = bytes;
  if (
    type !== STORE_TYPE ||
    corr === undefined ||
    statusCode === undefined ||
    chunkIndex === undefined ||
    chunkCount === undefined
  ) {
    return undefined;
  }

  return {
    corr,
    statusCode,
    chunkIndex,
    chunkCount,
    payload: bytes.slice(FRAME_HEADER_BYTES),
  };
}

export interface ReassembledResponse {
  readonly corr: number;
  readonly statusCode: number;
  readonly payload: Uint8Array;
}

export interface Reassembler {
  /** The whole response once its last chunk lands, else `undefined`. */
  accept(frame: ResponseFrame): ReassembledResponse | undefined;
  reset(): void;
}

/**
 * Joins response frames blindly. List entries straddle frame boundaries, so
 * nothing here may look at the payload — only the whole response is parsable.
 */
export function createReassembler(): Reassembler {
  let pending: { corr: number; statusCode: number; chunks: Uint8Array[]; next: number } | undefined;

  return {
    accept(frame) {
      if (frame.chunkIndex === 0) {
        pending = { corr: frame.corr, statusCode: frame.statusCode, chunks: [], next: 0 };
      }
      if (pending === undefined || frame.chunkIndex !== pending.next) {
        pending = undefined;
        return undefined;
      }

      pending.chunks.push(frame.payload);
      pending.next++;
      if (pending.next < frame.chunkCount) return undefined;

      const response = {
        corr: pending.corr,
        statusCode: pending.statusCode,
        payload: concat(pending.chunks),
      };
      pending = undefined;
      return response;
    },
    reset() {
      pending = undefined;
    },
  };
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export interface Capability {
  readonly protocolVersion: number;
  readonly slotCount: number;
  readonly maxChunkBytes: number;
}

const CAPABILITY_BYTES = 4;

export function parseCapability(payload: Uint8Array): Capability | undefined {
  if (payload.length < CAPABILITY_BYTES) return undefined;

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  return {
    protocolVersion: view.getUint8(0),
    slotCount: view.getUint8(1),
    maxChunkBytes: view.getUint16(2),
  };
}

export interface SlotEntry {
  readonly index: number;
  /** The web app's `Animation.id`, or `null` for a slot made on the ears. */
  readonly animationId: string | null;
  readonly name: string;
}

const ANIMATION_ID_BYTES = 16;
const utf8 = new TextDecoder();

/**
 * The `LIST` response: sparse, ascending by index, only occupied slots.
 * `undefined` means the bytes ran out mid-entry — a truncated listing is never
 * partially believed, because a missing entry reads as an empty slot.
 */
export function parseList(payload: Uint8Array): SlotEntry[] | undefined {
  const entryCount = payload[0];
  if (entryCount === undefined) return undefined;

  const entries: SlotEntry[] = [];
  let offset = 1;
  for (let i = 0; i < entryCount; i++) {
    const index = payload[offset];
    const nameLength = payload[offset + 1 + ANIMATION_ID_BYTES];
    if (index === undefined || nameLength === undefined) return undefined;

    const nameStart = offset + 2 + ANIMATION_ID_BYTES;
    if (nameStart + nameLength > payload.length) return undefined;

    entries.push({
      index,
      animationId: animationIdFrom(payload.subarray(offset + 1, offset + 1 + ANIMATION_ID_BYTES)),
      name: utf8.decode(payload.subarray(nameStart, nameStart + nameLength)),
    });
    offset = nameStart + nameLength;
  }
  return entries;
}

function animationIdFrom(bytes: Uint8Array): string | null {
  if (bytes.every((byte) => byte === 0)) return null;

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

export interface Slot {
  readonly index: number;
  readonly entry: SlotEntry | null;
}

/** Every slot the ears reported, occupied or not — what a grid renders. */
export function buildSlots(slotCount: number, entries: readonly SlotEntry[]): Slot[] {
  const byIndex = new Map(entries.map((entry) => [entry.index, entry]));
  return Array.from({ length: slotCount }, (_unused, index) => ({
    index,
    entry: byIndex.get(index) ?? null,
  }));
}

export type VersionVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly stale: "app" | "ears"; readonly message: string };

/**
 * Refuse rather than degrade: outside the known version the client cannot know
 * what changed, so it disconnects and says which side is behind.
 */
export function versionVerdict(protocolVersion: number): VersionVerdict {
  if (protocolVersion === KNOWN_PROTOCOL_VERSION) return { ok: true };

  return protocolVersion > KNOWN_PROTOCOL_VERSION
    ? {
        ok: false,
        stale: "app",
        message: `Your ears speak version ${protocolVersion} and this app only speaks ${KNOWN_PROTOCOL_VERSION} — reload the page to pick up a newer app.`,
      }
    : {
        ok: false,
        stale: "ears",
        message: `Your ears speak version ${protocolVersion} and this app speaks ${KNOWN_PROTOCOL_VERSION} — their firmware needs updating.`,
      };
}
