/**
 * The eleven status codes a store response can carry, each with the sentence
 * the UI shows.
 *
 * Codes a correct client cannot provoke still get copy, because they fire
 * exactly when the client is the broken thing. The code and its name ride along
 * as secondary text so a bug report can name what happened.
 */

export const STATUS_CODE = {
  ok: 0x00,
  unsupportedOpcode: 0x01,
  malformedRequest: 0x02,
  slotOutOfRange: 0x03,
  slotEmpty: 0x04,
  invalidName: 0x05,
  invalidAnimation: 0x06,
  tooLarge: 0x07,
  chunkOutOfOrder: 0x08,
  storageFailure: 0x09,
  noActiveTransfer: 0x0a,
} as const;

export interface EarsStatus {
  readonly code: number;
  /** The wire name, for bug reports — not for reading aloud. */
  readonly name: string;
  readonly message: string;
}

const STATUSES: readonly EarsStatus[] = [
  { code: STATUS_CODE.ok, name: "OK", message: "Your ears did it." },
  {
    code: STATUS_CODE.unsupportedOpcode,
    name: "UNSUPPORTED_OPCODE",
    message: "Your ears don't know that command — their firmware and this app are out of step.",
  },
  {
    code: STATUS_CODE.malformedRequest,
    name: "MALFORMED_REQUEST",
    message: "Your ears couldn't make sense of that request; reconnect and try again.",
  },
  {
    code: STATUS_CODE.slotOutOfRange,
    name: "SLOT_OUT_OF_RANGE",
    message: "That slot doesn't exist on your ears; reconnect to see the slots they really have.",
  },
  {
    code: STATUS_CODE.slotEmpty,
    name: "SLOT_EMPTY",
    message: "That slot is empty now; reconnect to see what your ears are holding.",
  },
  {
    code: STATUS_CODE.invalidName,
    name: "INVALID_NAME",
    message: "Your ears wouldn't take that name; keep it to 32 bytes of ordinary text.",
  },
  {
    code: STATUS_CODE.invalidAnimation,
    name: "INVALID_ANIMATION",
    message: "Your ears wouldn't take that animation; open it in the editor and save it again.",
  },
  {
    code: STATUS_CODE.tooLarge,
    name: "TOO_LARGE",
    message: "That animation is bigger than your ears can hold.",
  },
  {
    code: STATUS_CODE.chunkOutOfOrder,
    name: "CHUNK_OUT_OF_ORDER",
    message: "The transfer to your ears lost its place; start it over.",
  },
  {
    code: STATUS_CODE.storageFailure,
    name: "STORAGE_FAILURE",
    message: "Your ears couldn't save to their own storage; try again.",
  },
  {
    code: STATUS_CODE.noActiveTransfer,
    name: "NO_ACTIVE_TRANSFER",
    message: "Your ears weren't expecting that data; start the transfer over.",
  },
];

const BY_CODE = new Map(STATUSES.map((status) => [status.code, status]));

export function statusFrom(code: number): EarsStatus {
  return (
    BY_CODE.get(code) ?? {
      code,
      name: "UNKNOWN_STATUS",
      message: "Your ears answered with something this app doesn't recognise.",
    }
  );
}

export function isOk(code: number): boolean {
  return code === STATUS_CODE.ok;
}

/** The sentence, with the wire name and code trailing it for a bug report. */
export function statusText(status: EarsStatus): string {
  return `${status.message} (${status.name} 0x${status.code.toString(16).padStart(2, "0")})`;
}
