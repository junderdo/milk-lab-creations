/**
 * One request at a time, over one link.
 *
 * Every GATT operation in the app funnels through a session: concurrent Web
 * Bluetooth operations may reject with `NetworkError` and Blink has no
 * operation queue, so the serialization has to live here. Requests queue in
 * call order; the next one's first frame is not written until the previous
 * request has an outcome.
 *
 * The link is a port, not a `BluetoothDevice` — the radio lives in
 * `web-bluetooth.ts`, which keeps this half testable.
 */

import {
  REQUEST_TIMEOUT_MS,
  createReassembler,
  encodeRequest,
  parseResponseFrame,
  type Frame,
  type SubOpcode,
} from "./protocol";
import { isOk, statusFrom, type EarsStatus } from "./status";

/**
 * `CAPABILITY` and its response both fit one frame at the smallest ATT MTU
 * (23 - 3), so nothing needs `max_chunk_bytes` in order to go and fetch it.
 */
export const BOOTSTRAP_CHUNK_BYTES = 20;

/** The GATT operations a session needs, and nothing else. */
export interface EarsLink {
  /** The device's own address, which a cached slot list has to be tagged with. */
  readonly deviceId: string;
  readonly deviceName: string;
  /** Write-with-response on `ABF1`; rejects if the link is gone. */
  write(frame: Frame): Promise<void>;
  onResponse(handler: (value: Uint8Array) => void): void;
  onDisconnect(handler: () => void): void;
  disconnect(): void;
}

export type RequestOutcome =
  | { readonly kind: "ok"; readonly payload: Uint8Array }
  | { readonly kind: "failed"; readonly status: EarsStatus }
  /** The 5 s timeout: the ears may well have done it. Re-read `LIST` to find out. */
  | { readonly kind: "unknown" }
  | { readonly kind: "link-lost" };

export interface EarsSession {
  readonly deviceId: string;
  readonly deviceName: string;
  /** Set from `CAPABILITY`; never hardcoded, never derived from the MTU. */
  maxChunkBytes: number;
  request(subOpcode: SubOpcode, payload: Uint8Array): Promise<RequestOutcome>;
  disconnect(): void;
}

export function createSession(link: EarsLink): EarsSession {
  const reassembler = createReassembler();
  let maxChunkBytes = BOOTSTRAP_CHUNK_BYTES;
  let corr = 0;
  let lost = false;
  let queue: Promise<unknown> = Promise.resolve();
  let inFlight:
    | { readonly corr: number; readonly settle: (outcome: RequestOutcome) => void }
    | undefined;

  function settle(outcome: RequestOutcome): void {
    const pending = inFlight;
    inFlight = undefined;
    pending?.settle(outcome);
  }

  link.onResponse((value) => {
    const frame = parseResponseFrame(value);
    if (frame === undefined || inFlight === undefined || frame.corr !== inFlight.corr) return;

    const response = reassembler.accept(frame);
    if (response === undefined) return;

    settle(
      isOk(response.statusCode)
        ? { kind: "ok", payload: response.payload }
        : { kind: "failed", status: statusFrom(response.statusCode) },
    );
  });

  link.onDisconnect(() => {
    lost = true;
    reassembler.reset();
    settle({ kind: "link-lost" });
  });

  async function send(subOpcode: SubOpcode, payload: Uint8Array): Promise<RequestOutcome> {
    if (lost) return { kind: "link-lost" };

    const requestCorr = corr;
    corr = (corr + 1) & 0xff;
    reassembler.reset();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const answered = new Promise<RequestOutcome>((resolve) => {
      inFlight = { corr: requestCorr, settle: resolve };
      timer = setTimeout(() => {
        settle({ kind: "unknown" });
      }, REQUEST_TIMEOUT_MS);
    });

    try {
      for (const frame of encodeRequest({
        corr: requestCorr,
        subOpcode,
        payload,
        maxChunkBytes,
      })) {
        // an early error response is terminal for the transfer on the device,
        // so once this request has an outcome there is nothing left to send into
        if (inFlight === undefined) break;
        await link.write(frame);
      }
    } catch {
      // a rejected write is the link, not the ears: nothing will answer
      settle({ kind: "link-lost" });
    }

    const outcome = await answered;
    clearTimeout(timer);
    return outcome;
  }

  return {
    deviceId: link.deviceId,
    deviceName: link.deviceName,
    get maxChunkBytes(): number {
      return maxChunkBytes;
    },
    set maxChunkBytes(bytes: number) {
      maxChunkBytes = bytes;
    },
    request(subOpcode, payload) {
      const outcome = queue.then(() => send(subOpcode, payload));
      queue = outcome.catch(() => undefined);
      return outcome;
    },
    disconnect() {
      lost = true;
      link.disconnect();
    },
  };
}
