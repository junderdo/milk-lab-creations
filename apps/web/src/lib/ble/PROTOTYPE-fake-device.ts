/**
 * PROTOTYPE — throwaway. Not production code, no tests, no error handling
 * beyond what makes the variants runnable.
 *
 * A fake 0xABF0 device standing in for real ears. It has to be fake: the ABF2
 * indication path is unimplemented firmware, and Web Bluetooth cannot run
 * under WSL2 anyway. It implements the opcode surface settled on
 * https://trello.com/c/SfF0mXwJ so the UX is judged against the real shape —
 * 16 slots, a capability record, chunked STORE, the 11 status codes.
 */

export const STATUS = {
  OK: 0x00,
  UNSUPPORTED_OPCODE: 0x01,
  MALFORMED_REQUEST: 0x02,
  SLOT_OUT_OF_RANGE: 0x03,
  SLOT_EMPTY: 0x04,
  INVALID_NAME: 0x05,
  INVALID_ANIMATION: 0x06,
  TOO_LARGE: 0x07,
  CHUNK_OUT_OF_ORDER: 0x08,
  STORAGE_FAILURE: 0x09,
  NO_ACTIVE_TRANSFER: 0x0a,
} as const;

export type Status = (typeof STATUS)[keyof typeof STATUS];

export const STATUS_NAME: Record<Status, string> = {
  [STATUS.OK]: "OK",
  [STATUS.UNSUPPORTED_OPCODE]: "UNSUPPORTED_OPCODE",
  [STATUS.MALFORMED_REQUEST]: "MALFORMED_REQUEST",
  [STATUS.SLOT_OUT_OF_RANGE]: "SLOT_OUT_OF_RANGE",
  [STATUS.SLOT_EMPTY]: "SLOT_EMPTY",
  [STATUS.INVALID_NAME]: "INVALID_NAME",
  [STATUS.INVALID_ANIMATION]: "INVALID_ANIMATION",
  [STATUS.TOO_LARGE]: "TOO_LARGE",
  [STATUS.CHUNK_OUT_OF_ORDER]: "CHUNK_OUT_OF_ORDER",
  [STATUS.STORAGE_FAILURE]: "STORAGE_FAILURE",
  [STATUS.NO_ACTIVE_TRANSFER]: "NO_ACTIVE_TRANSFER",
};

/**
 * The whole point of the "how does a nack become readable copy" bullet: one
 * sentence per code, in the second person, saying what the user does next.
 * Codes a correct client cannot provoke still need copy — they happen when the
 * client is the thing that is broken.
 */
export const STATUS_COPY: Record<Status, string> = {
  [STATUS.OK]: "Done.",
  [STATUS.UNSUPPORTED_OPCODE]:
    "Your ears are running older firmware that doesn't support this. Update them and try again.",
  [STATUS.MALFORMED_REQUEST]: "Milk Lab sent something your ears couldn't read. This is a bug — please report it.",
  [STATUS.SLOT_OUT_OF_RANGE]: "That slot doesn't exist on your ears. Reload and try again.",
  [STATUS.SLOT_EMPTY]: "That slot is empty.",
  [STATUS.INVALID_NAME]: "Your ears wouldn't accept that name. Try a shorter one without special characters.",
  [STATUS.INVALID_ANIMATION]: "Your ears couldn't read this animation. This is a bug — please report it.",
  [STATUS.TOO_LARGE]: "This animation is too big for your ears.",
  [STATUS.CHUNK_OUT_OF_ORDER]: "The transfer lost its place. Nothing was saved — try again.",
  [STATUS.STORAGE_FAILURE]: "Your ears couldn't save to their storage. Nothing was changed — try again.",
  [STATUS.NO_ACTIVE_TRANSFER]: "The transfer timed out on your ears. Nothing was saved — try again.",
};

export interface SlotEntry {
  index: number;
  /** The web-app Animation.id, or null for a watch-authored animation. */
  animationId: string | null;
  name: string;
}

export interface Capability {
  protocolVersion: number;
  slotCount: number;
  maxChunkBytes: number;
}

/** What the client refuses outside of. */
export const SUPPORTED_PROTOCOL_VERSION = 1;

/** Fixed by the protocol version, so never on the wire — but the client knows them. */
export const DEVICE_MAX_KEYFRAMES = 64;
export const DEVICE_MAX_NAME_BYTES = 32;

export const STORE_HEADER_BYTES = 5;
export const REQUEST_TIMEOUT_MS = 5000;

/** Levers the prototype's fault panel drives. */
export interface Faults {
  /** Pretend `navigator.bluetooth` is absent. */
  unsupportedBrowser: boolean;
  /** User dismissed the Chrome device picker. */
  cancelPicker: boolean;
  /** What the device answers a STORE with. */
  storeStatus: Status;
  /** Device never answers — client hits its 5 s timeout, outcome unknown. */
  storeTimesOut: boolean;
  /** ...and the store actually landed anyway. Only meaningful with storeTimesOut. */
  timeoutActuallyLanded: boolean;
  /** Link drops mid-transfer. */
  dropMidTransfer: boolean;
  /** Slow every frame down so progress is legible. */
  slowLink: boolean;
  /** What the device reports. Set out of range to exercise the refuse path. */
  protocolVersion: number;
  /** Starting occupancy of the fake store. */
  preloadedSlots: number;
}

export const DEFAULT_FAULTS: Faults = {
  unsupportedBrowser: false,
  cancelPicker: false,
  storeStatus: STATUS.OK,
  storeTimesOut: false,
  timeoutActuallyLanded: false,
  dropMidTransfer: false,
  slowLink: false,
  protocolVersion: SUPPORTED_PROTOCOL_VERSION,
  preloadedSlots: 3,
};

export class PickerDismissed extends Error {}
export class RequestTimeout extends Error {}
export class LinkLost extends Error {}
export class BluetoothUnavailable extends Error {}

const SEED_NAMES = [
  "Perk Up",
  "Slow Blink",
  "Timid", // watch-authored: zero animation id, so the web app can never rename it
  "Alert Twitch",
  "Droop",
  "Radar Sweep",
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `1 + n * 12` for robo-cat-ears, per packWireFormat. */
export function wireSizeFor(keyframeCount: number, channels: number): number {
  return 1 + keyframeCount * (8 + channels);
}

/** UTF-8 length, because the device's 32 is bytes and the web's 100 is characters. */
export function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Longest prefix of `text` that fits `maxBytes`, never splitting a code point. */
export function truncateToBytes(text: string, maxBytes: number): string {
  if (utf8Length(text) <= maxBytes) return text;
  let out = "";
  for (const char of text) {
    if (utf8Length(out + char) > maxBytes) break;
    out += char;
  }
  return out;
}

export function storeRequestBytes(nameBytes: number, wireBytes: number): number {
  return 1 + 16 + 1 + nameBytes + wireBytes;
}

export function chunkCountFor(requestBytes: number, maxChunkBytes: number): number {
  return Math.max(1, Math.ceil(requestBytes / (maxChunkBytes - STORE_HEADER_BYTES)));
}

export interface StoreProgress {
  chunkIndex: number;
  chunkCount: number;
}

/**
 * The device. One outstanding request, as the protocol assumes; the caller is
 * expected to hold the app-wide GATT mutex, which here is just `await`.
 */
export class FakeEars {
  readonly faults: Faults;
  private slots = new Map<number, SlotEntry>();
  private connected = false;
  readonly capability: Capability;

  constructor(faults: Faults) {
    this.faults = faults;
    this.capability = {
      protocolVersion: faults.protocolVersion,
      slotCount: 16,
      // MTU 512 - 3. Never the 512 API cap: 510-512 fail silently.
      maxChunkBytes: 509,
    };
    for (let index = 0; index < faults.preloadedSlots && index < SEED_NAMES.length; index += 1) {
      this.slots.set(index, {
        index,
        // "Timid" is the watch-authored one — no web-app id behind it
        animationId: index === 2 ? null : crypto.randomUUID(),
        name: SEED_NAMES[index] ?? `Slot ${index}`,
      });
    }
  }

  private get frameDelay(): number {
    return this.faults.slowLink ? 420 : 90;
  }

  private assertLive(): void {
    if (!this.connected) throw new LinkLost("Your ears disconnected.");
  }

  /** requestDevice + connect + subscribe ABF2. The mandated connect sequence starts here. */
  async connect(): Promise<void> {
    if (this.faults.unsupportedBrowser) throw new BluetoothUnavailable();
    await delay(400);
    if (this.faults.cancelPicker) throw new PickerDismissed();
    await delay(700);
    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
  }

  async readCapability(): Promise<Capability> {
    this.assertLive();
    await delay(this.frameDelay);
    return this.capability;
  }

  async list(): Promise<SlotEntry[]> {
    this.assertLive();
    // worst case is 801 bytes -> 2 indication frames
    await delay(this.frameDelay * 2);
    return [...this.slots.values()].sort((a, b) => a.index - b.index);
  }

  async store(
    slot: number,
    animationId: string,
    name: string,
    wireBytes: number,
    onProgress: (progress: StoreProgress) => void,
  ): Promise<Status> {
    this.assertLive();
    if (slot < 0 || slot >= this.capability.slotCount) return STATUS.SLOT_OUT_OF_RANGE;
    if (utf8Length(name) === 0 || utf8Length(name) > DEVICE_MAX_NAME_BYTES) return STATUS.INVALID_NAME;

    const total = chunkCountFor(
      storeRequestBytes(utf8Length(name), wireBytes),
      this.capability.maxChunkBytes,
    );

    for (let chunkIndex = 0; chunkIndex < total; chunkIndex += 1) {
      this.assertLive();
      if (this.faults.dropMidTransfer && chunkIndex === Math.floor(total / 2)) {
        this.connected = false;
        throw new LinkLost("Your ears disconnected.");
      }
      onProgress({ chunkIndex, chunkCount: total });
      await delay(this.frameDelay);
    }

    if (this.faults.storeTimesOut) {
      // The device is silent; whether it committed is exactly what the client
      // cannot know. That is the case the UI has to have an answer for.
      if (this.faults.timeoutActuallyLanded) {
        this.slots.set(slot, { index: slot, animationId, name });
      }
      await delay(REQUEST_TIMEOUT_MS + 200);
      throw new RequestTimeout();
    }

    await delay(this.frameDelay);
    if (this.faults.storeStatus !== STATUS.OK) return this.faults.storeStatus;

    // commit is atomic: overwrite is the same opcode, unconditional
    this.slots.set(slot, { index: slot, animationId, name });
    return STATUS.OK;
  }

  async deleteSlot(slot: number): Promise<Status> {
    this.assertLive();
    await delay(this.frameDelay);
    if (slot < 0 || slot >= this.capability.slotCount) return STATUS.SLOT_OUT_OF_RANGE;
    this.slots.delete(slot); // idempotent
    return STATUS.OK;
  }

  async play(slot: number): Promise<Status> {
    this.assertLive();
    await delay(this.frameDelay);
    if (slot < 0 || slot >= this.capability.slotCount) return STATUS.SLOT_OUT_OF_RANGE;
    if (!this.slots.has(slot)) return STATUS.SLOT_EMPTY;
    return STATUS.OK;
  }
}
