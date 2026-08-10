/**
 * The `STORE` request, as bytes.
 *
 * `[slot:u8][animation_id:16][name_len:u8][name][wire_format]`, per
 * `robo-cat-ears/docs/ble-protocol.md` §7.3. The device's name budget is 32
 * bytes where the web app's is 100 characters, so truncation lives here too —
 * and it truncates by code point, because a name cut mid-sequence is not UTF-8
 * and the ears answer `INVALID_NAME` to it.
 */

import { FRAME_HEADER_BYTES } from "./protocol";

/** What `STORE` accepts for a name; 1-32 bytes of well-formed UTF-8. */
export const MAX_SLOT_NAME_BYTES = 32;

const ANIMATION_ID_BYTES = 16;
const utf8 = new TextEncoder();

export function utf8ByteLength(text: string): number {
  return utf8.encode(text).length;
}

/**
 * The longest prefix of `text` that fits `maxBytes`, cut on a code point
 * boundary. Iterating the string yields whole code points, so a surrogate pair
 * is never half-copied.
 */
export function truncateToBytes(text: string, maxBytes: number): string {
  if (utf8ByteLength(text) <= maxBytes) return text;

  let kept = "";
  let bytes = 0;
  for (const codePoint of text) {
    const size = utf8ByteLength(codePoint);
    if (bytes + size > maxBytes) break;
    kept += codePoint;
    bytes += size;
  }
  return kept;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A web `Animation.id` as the 16 bytes the slot carries, or `undefined`. */
export function animationIdBytes(animationId: string): Uint8Array | undefined {
  if (!UUID.test(animationId)) return undefined;

  const hex = animationId.replaceAll("-", "");
  const bytes = new Uint8Array(ANIMATION_ID_BYTES);
  for (let i = 0; i < ANIMATION_ID_BYTES; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export interface StoreRequest {
  readonly slot: number;
  readonly animationId: string;
  readonly name: string;
  readonly wire: Uint8Array;
}

/**
 * The `STORE` payload, or `undefined` when the request could not be built —
 * which is a bug in the caller, not a user error: the dialog holds the name
 * inside 32 bytes and the id comes from the row.
 */
export function buildStorePayload({
  slot,
  animationId,
  name,
  wire,
}: StoreRequest): Uint8Array | undefined {
  const id = animationIdBytes(animationId);
  if (id === undefined) return undefined;

  const nameBytes = utf8.encode(name);
  if (nameBytes.length < 1 || nameBytes.length > MAX_SLOT_NAME_BYTES) return undefined;

  const payload = new Uint8Array(1 + ANIMATION_ID_BYTES + 1 + nameBytes.length + wire.length);
  payload[0] = slot;
  payload.set(id, 1);
  payload[1 + ANIMATION_ID_BYTES] = nameBytes.length;
  payload.set(nameBytes, 2 + ANIMATION_ID_BYTES);
  payload.set(wire, 2 + ANIMATION_ID_BYTES + nameBytes.length);
  return payload;
}

/**
 * How many frames a payload of this size takes, given the link's
 * `max_chunk_bytes` — the real count progress is reported against, never a
 * guess. A payload-less request is one frame, not zero.
 */
export function frameCount(payloadBytes: number, maxChunkBytes: number): number {
  const perFrame = maxChunkBytes - FRAME_HEADER_BYTES;
  return Math.max(1, Math.ceil(payloadBytes / perFrame));
}
