/**
 * PROTOTYPE — throwaway.
 *
 * The one live ears connection, as reactive state. Singular by nature: Web
 * Bluetooth gives one device per page, every GATT operation serializes app-wide
 * behind one mutex, and the ears only accept one client at a time. So this is a
 * module singleton like `theme.svelte.ts`, not a per-component thing.
 *
 * All three variants drive *this* — they disagree about where connecting lives
 * and how the store is shown, not about what the connection is. Whatever wins,
 * this shape is roughly what ships.
 */

import {
  DEFAULT_FAULTS,
  DEVICE_MAX_KEYFRAMES,
  DEVICE_MAX_NAME_BYTES,
  FakeEars,
  LinkLost,
  PickerDismissed,
  RequestTimeout,
  BluetoothUnavailable,
  STATUS,
  STATUS_COPY,
  STATUS_NAME,
  SUPPORTED_PROTOCOL_VERSION,
  chunkCountFor,
  storeRequestBytes,
  truncateToBytes,
  utf8Length,
  wireSizeFor,
  type Capability,
  type Faults,
  type SlotEntry,
  type Status,
} from "./PROTOTYPE-fake-device";

export type Phase =
  | { kind: "unsupported" }
  | { kind: "disconnected"; lastError: string | null }
  | { kind: "connecting"; step: "picker" | "capability" | "list" }
  | { kind: "refused"; reportedVersion: number }
  | { kind: "ready" };

export type Transfer =
  | { kind: "idle" }
  | { kind: "uploading"; slot: number; name: string; chunkIndex: number; chunkCount: number }
  | { kind: "reconciling"; slot: number; name: string }
  | { kind: "done"; slot: number; name: string; overwrote: string | null }
  | { kind: "failed"; slot: number; name: string; message: string; code: string | null };

export interface Eligibility {
  ok: boolean;
  reason: string | null;
}

function createEarsController() {
  const faults = $state<Faults>({ ...DEFAULT_FAULTS });
  let device: FakeEars | null = null;
  let phase = $state<Phase>({ kind: "disconnected", lastError: null });
  let capability = $state<Capability | null>(null);
  let slots = $state<SlotEntry[]>([]);
  let transfer = $state<Transfer>({ kind: "idle" });
  /** Which slot a per-row action is busy on, so the row can spin alone. */
  let busySlot = $state<number | null>(null);

  function reset(lastError: string | null): void {
    device?.disconnect();
    device = null;
    capability = null;
    slots = [];
    transfer = { kind: "idle" };
    busySlot = null;
    phase = faults.unsupportedBrowser ? { kind: "unsupported" } : { kind: "disconnected", lastError };
  }

  /**
   * The mandated connect sequence: picker -> subscribe ABF2 -> CAPABILITY ->
   * LIST -> operate. Must be called straight off a click; an `await` before
   * `requestDevice` would spend the transient user activation.
   */
  async function connect(): Promise<void> {
    if (faults.unsupportedBrowser) {
      phase = { kind: "unsupported" };
      return;
    }
    const ears = new FakeEars({ ...faults });
    phase = { kind: "connecting", step: "picker" };
    try {
      await ears.connect();
      device = ears;

      phase = { kind: "connecting", step: "capability" };
      const record = await ears.readCapability();
      // Refuse rather than degrade: we control both ends, so a version we have
      // never seen means one side is stale and guessing is not a strategy.
      if (record.protocolVersion !== SUPPORTED_PROTOCOL_VERSION) {
        ears.disconnect();
        device = null;
        phase = { kind: "refused", reportedVersion: record.protocolVersion };
        return;
      }
      capability = record;

      phase = { kind: "connecting", step: "list" };
      slots = await ears.list();
      phase = { kind: "ready" };
    } catch (thrown) {
      if (thrown instanceof PickerDismissed) return reset(null); // a dismissal is not an error
      if (thrown instanceof BluetoothUnavailable) return reset(null);
      reset(thrown instanceof LinkLost ? "Your ears disconnected." : "Couldn't connect to your ears.");
    }
  }

  function disconnect(): void {
    reset(null);
  }

  async function refreshList(): Promise<void> {
    if (device === null) return;
    slots = await device.list();
  }

  function slotAt(index: number): SlotEntry | undefined {
    return slots.find((entry) => entry.index === index);
  }

  function firstFreeSlot(): number | null {
    if (capability === null) return null;
    for (let index = 0; index < capability.slotCount; index += 1) {
      if (slotAt(index) === undefined) return index;
    }
    return null;
  }

  /** Which slot already holds this animation — an upload is then a re-send, not a new one. */
  function slotHolding(animationId: string): SlotEntry | undefined {
    return slots.find((entry) => entry.animationId === animationId);
  }

  async function upload(input: {
    slot: number;
    animationId: string;
    name: string;
    keyframeCount: number;
    channels: number;
  }): Promise<void> {
    if (device === null || capability === null) return;
    const occupant = slotAt(input.slot);
    const overwrote = occupant?.name ?? null;
    const wireBytes = wireSizeFor(input.keyframeCount, input.channels);

    transfer = {
      kind: "uploading",
      slot: input.slot,
      name: input.name,
      chunkIndex: 0,
      chunkCount: chunkCountFor(
        storeRequestBytes(utf8Length(input.name), wireBytes),
        capability.maxChunkBytes,
      ),
    };

    try {
      const status = await device.store(
        input.slot,
        input.animationId,
        input.name,
        wireBytes,
        ({ chunkIndex, chunkCount }) => {
          transfer = { kind: "uploading", slot: input.slot, name: input.name, chunkIndex, chunkCount };
        },
      );
      if (status === STATUS.OK) {
        await refreshList();
        transfer = { kind: "done", slot: input.slot, name: input.name, overwrote };
      } else {
        transfer = {
          kind: "failed",
          slot: input.slot,
          name: input.name,
          message: STATUS_COPY[status],
          code: STATUS_NAME[status],
        };
      }
    } catch (thrown) {
      if (thrown instanceof RequestTimeout) {
        // Unknown outcome. The protocol's answer is to re-read LIST and see what
        // actually happened — never to assume failure and never to retry blind.
        transfer = { kind: "reconciling", slot: input.slot, name: input.name };
        await refreshList();
        const landed = slotAt(input.slot)?.animationId === input.animationId;
        transfer = landed
          ? { kind: "done", slot: input.slot, name: input.name, overwrote }
          : {
              kind: "failed",
              slot: input.slot,
              name: input.name,
              message: "Your ears stopped responding. Nothing was saved — try again.",
              code: "TIMEOUT",
            };
        return;
      }
      reset("Your ears disconnected mid-upload. Nothing was saved.");
    }
  }

  async function runSlotAction(slot: number, action: (ears: FakeEars) => Promise<Status>) {
    if (device === null) return;
    busySlot = slot;
    try {
      const status = await action(device);
      if (status !== STATUS.OK) {
        transfer = {
          kind: "failed",
          slot,
          name: slotAt(slot)?.name ?? "",
          message: STATUS_COPY[status],
          code: STATUS_NAME[status],
        };
      }
      await refreshList();
    } catch {
      reset("Your ears disconnected.");
    } finally {
      busySlot = null;
    }
  }

  return {
    faults,
    get phase() {
      return phase;
    },
    get capability() {
      return capability;
    },
    get slots() {
      return slots;
    },
    get transfer() {
      return transfer;
    },
    get busySlot() {
      return busySlot;
    },
    get isReady() {
      return phase.kind === "ready";
    },
    get usedSlots() {
      return slots.length;
    },
    get slotCount() {
      return capability?.slotCount ?? 0;
    },
    slotAt,
    firstFreeSlot,
    slotHolding,
    connect,
    disconnect,
    refreshList,
    upload,
    clearTransfer: () => {
      transfer = { kind: "idle" };
    },
    deleteSlot: (slot: number) => runSlotAction(slot, (ears) => ears.deleteSlot(slot)),
    play: (slot: number) => runSlotAction(slot, (ears) => ears.play(slot)),
  };
}

export const ears = createEarsController();

/**
 * Whether an animation can be stored at all.
 *
 * Checked against limits the protocol version fixes — they are deliberately not
 * on the wire, so the client knows them from the version it agreed to. This is
 * the "hide / disable with a reason / let the ears nack" question made concrete.
 */
export function eligibilityOf(input: {
  keyframeCount: number;
  robotSlug: string | undefined;
}): Eligibility {
  if (input.robotSlug !== "robo-cat-ears") {
    return { ok: false, reason: "This animation is for a different robot." };
  }
  if (input.keyframeCount === 0) return { ok: false, reason: "This animation has no keyframes." };
  if (input.keyframeCount > DEVICE_MAX_KEYFRAMES) {
    return {
      ok: false,
      reason: `Your ears hold ${DEVICE_MAX_KEYFRAMES} keyframes; this one has ${input.keyframeCount}.`,
    };
  }
  return { ok: true, reason: null };
}

/** The device name for an animation: 32 *bytes*, where the web app allows 100 characters. */
export function deviceNameFor(name: string): { value: string; truncated: boolean } {
  const value = truncateToBytes(name.trim(), DEVICE_MAX_NAME_BYTES);
  return { value, truncated: value !== name.trim() };
}

export { DEVICE_MAX_NAME_BYTES, utf8Length };
