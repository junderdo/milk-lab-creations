<!--
  One animation into one slot, and the slots themselves: the grid of every slot
  the ears have, the name they will call it, and the truth about what happened.

  The whole dialog is one surface, and the grid is both the target picker and
  the slot manager. Overwrite is confirmed inline rather than in a second modal
  — the grid already shows what is in the slot — and the progress bar sits on the
  target slot in that same grid, so the thing being changed and the thing
  reporting progress are the same object on screen.

  Play renders no in-flight state: `OK` from the ears means they accepted the
  command, not that they finished moving, and there is no completion event to
  stop a spinner on.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { LoaderCircle, Play, Trash2 } from "@lucide/svelte";
  import { packWireFormat } from "@milklab/api/wire-format";
  import { ears } from "$lib/ears/connection.svelte";
  import type { Capability, Slot } from "$lib/ears/protocol";
  import { dialogView } from "$lib/ears/send-dialog";
  import {
    deleteSlot,
    playSlot,
    type SlotAction,
    type SlotActionResult,
  } from "$lib/ears/slot-actions";
  import { occupantName, slotNumber } from "$lib/ears/slot-copy";
  import { MAX_SLOT_NAME_BYTES, truncateToBytes } from "$lib/ears/store";
  import { defaultSlot, sendToSlot, type UploadResult } from "$lib/ears/upload";
  import type { Keyframe } from "$lib/animation/interpolator";

  interface Props {
    animationId: string;
    animationName: string;
    keyframes: readonly Keyframe[];
    deviceName: string;
    capability: Capability;
    initialSlots: readonly Slot[];
    onclose: () => void;
  }

  let { animationId, animationName, keyframes, deviceName, capability, initialSlots, onclose }: Props =
    $props();

  // The dialog owns the list it draws, seeded from the state it opened on and
  // advanced by each send's own result. The page can only hand over a snapshot:
  // it has to survive the ears going away mid-transfer, so it cannot track the
  // connection, and a grid that never repainted was the bug this fixes.
  let slots = $state<readonly Slot[]>(untrack(() => initialSlots));

  // Seeded once: the target is the user's choice from that moment on, and the
  // name is theirs to edit. Hence `untrack` — re-deriving either would
  // overwrite what the user chose.
  let target = $state<number | undefined>(untrack(() => defaultSlot(initialSlots, animationId)));
  let name = $state(untrack(() => truncateToBytes(animationName, MAX_SLOT_NAME_BYTES)));

  let sending = $state(false);
  let managing = $state(false);
  let framesSent = $state(0);
  let frameCount = $state(0);
  let checking = $state<string | null>(null);
  let result = $state<UploadResult | SlotActionResult | null>(null);

  const busy = $derived(sending || managing);
  const view = $derived(dialogView({ slots, target, name, animationId }));
  const titleId = $props.id();

  const RESULT_CLASSES = {
    stored: "text-emerald-700 dark:text-emerald-400",
    done: "text-emerald-700 dark:text-emerald-400",
    "not-stored": "text-red-600 dark:text-red-400",
    failed: "text-red-600 dark:text-red-400",
    stale: "text-amber-700 dark:text-amber-400",
    unclear: "text-amber-700 dark:text-amber-400",
  } as const;

  /** Everything the dialog learns about the slots lands in both places at once. */
  function rememberSlots(deviceId: string, learnt: readonly Slot[] | null): void {
    if (learnt === null) return;
    slots = learnt;
    ears.updateSlots(deviceId, learnt);
  }

  async function send(): Promise<void> {
    const session = ears.session;
    if (target === undefined || session === undefined || busy) return;

    sending = true;
    result = null;
    checking = null;
    framesSent = 0;
    frameCount = 0;

    const outcome = await sendToSlot(
      session,
      { slot: target, animationId, name, wire: packWireFormat({ keyframes }), slots },
      {
        onProgress: (sent, total) => {
          framesSent = sent;
          frameCount = total;
        },
        onChecking: (message) => (checking = message),
      },
    );

    // the grid here and the count on the header chip are the same fact
    rememberSlots(session.deviceId, outcome.slots);
    result = outcome;
    checking = null;
    sending = false;
  }

  /**
   * The waiting state here is about the request, not about the ears moving: it
   * stops when the response lands, which is a moment that truthfully exists.
   */
  async function manage(slot: number, action: SlotAction): Promise<void> {
    const session = ears.session;
    if (session === undefined || busy) return;

    managing = true;
    result = null;
    checking = null;

    const outcome = await action(session, { slot, slots }, {
      onChecking: (message) => (checking = message),
    });

    rememberSlots(session.deviceId, outcome.slots);
    result = outcome;
    checking = null;
    managing = false;
  }
</script>

<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
  role="dialog"
  aria-modal="true"
  aria-labelledby={titleId}
>
  <div
    class="max-h-full w-full max-w-lg space-y-4 overflow-y-auto rounded-md bg-white p-5 shadow-xl dark:bg-gray-950"
  >
    <header class="space-y-1">
      <h2 id={titleId} class="text-lg font-bold text-gray-900 dark:text-white">Send to my ears</h2>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        {deviceName} · {capability.slotCount} slots
      </p>
    </header>

    <fieldset disabled={busy} class="space-y-2">
      <legend class="text-sm font-medium text-gray-900 dark:text-white">Choose a slot</legend>
      <div class="grid grid-cols-4 gap-2">
        {#each slots as slot (slot.index)}
          {@const chosen = slot.index === target}
          {@const occupant = occupantName(slot)}
          <div
            class="flex flex-col overflow-hidden rounded-md border {chosen
              ? 'border-gray-900 bg-gray-100 dark:border-white dark:bg-gray-800'
              : 'border-gray-300 dark:border-gray-700'}"
          >
            <button
              type="button"
              onclick={() => (target = slot.index)}
              aria-pressed={chosen}
              class="grow p-2 text-left disabled:cursor-not-allowed {chosen
                ? ''
                : 'hover:bg-gray-50 dark:hover:bg-gray-900'}"
            >
              <span class="block text-xs text-gray-500 dark:text-gray-500">
                {slotNumber(slot.index)}
              </span>
              <span class="block truncate text-xs text-gray-900 dark:text-gray-200" title={occupant}>
                {slot.entry === null ? "Empty" : occupant}
              </span>
            </button>

            <!-- under the slot's own label, above its actions: the bar belongs to
                 the thing being written, not to the buttons that manage it -->
            {#if chosen && frameCount > 0}
              <span class="block h-1 bg-gray-200 dark:bg-gray-700">
                <span
                  class="block h-full bg-emerald-500"
                  style="width: {(framesSent / frameCount) * 100}%"
                ></span>
              </span>
            {/if}

            {#if slot.entry !== null}
              {@const playLabel = `Play “${occupant}” on your ears`}
              {@const deleteLabel = `Delete “${occupant}” from slot ${slotNumber(slot.index)}`}
              <div
                class="flex divide-x divide-gray-300 border-t border-gray-300 dark:divide-gray-700 dark:border-gray-700"
              >
                <button
                  type="button"
                  onclick={() => manage(slot.index, playSlot)}
                  title={playLabel}
                  class="flex grow justify-center p-1.5 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  <Play class="size-3.5" aria-hidden="true" />
                  <span class="sr-only">{playLabel}</span>
                </button>
                <button
                  type="button"
                  onclick={() => manage(slot.index, deleteSlot)}
                  title={deleteLabel}
                  class="flex grow justify-center p-1.5 text-gray-600 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed dark:text-gray-400 dark:hover:bg-red-950 dark:hover:text-red-400"
                >
                  <Trash2 class="size-3.5" aria-hidden="true" />
                  <span class="sr-only">{deleteLabel}</span>
                </button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </fieldset>

    <div class="space-y-1">
      <label for="{titleId}-name" class="block text-sm font-medium text-gray-900 dark:text-white">
        What your ears will call it
      </label>
      <input
        id="{titleId}-name"
        type="text"
        bind:value={name}
        disabled={busy}
        class="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
      />
      <p class="text-xs text-gray-500 dark:text-gray-500">
        {view.nameBytes} of {MAX_SLOT_NAME_BYTES} bytes
      </p>
      {#if view.nameProblem}
        <p class="text-xs text-red-600 dark:text-red-400">{view.nameProblem}</p>
      {/if}
    </div>

    {#if view.overwriteWarning}
      <p class="text-sm text-amber-700 dark:text-amber-400">{view.overwriteWarning}</p>
    {/if}

    {#if busy}
      <p class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
        <LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
        {#if checking}
          {checking}
        {:else if sending}
          {frameCount > 0 ? `Frame ${framesSent} of ${frameCount}…` : "Sending…"}
        {:else}
          Asking your ears…
        {/if}
      </p>
    {/if}

    {#if result}
      <p class="text-sm {RESULT_CLASSES[result.kind]}" role="status">{result.message}</p>
    {/if}

    <div class="flex flex-wrap justify-end gap-3">
      <button
        type="button"
        onclick={onclose}
        disabled={busy}
        class="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        {result?.kind === "stored" ? "Done" : "Cancel"}
      </button>
      <button
        type="button"
        onclick={send}
        disabled={!view.canConfirm || busy || ears.session === undefined}
        class="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
      >
        {view.confirmLabel}
      </button>
    </div>
  </div>
</div>
