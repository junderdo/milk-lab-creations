<!--
  PROTOTYPE — throwaway. Variant C: "Inline wizard".

  Nothing in the header, no dock, no modal. A section on the page walks one
  linear path: connect -> confirm target -> result. It defaults to the next free
  slot and only shows the 16 slots if you ask. Managing the device is a separate
  collapsed disclosure below, deliberately out of the upload path.

  It also disagrees with A and B on eligibility ON PURPOSE: this variant does
  NOT pre-check, it sends and lets the ears nack. Worth feeling before deciding.
-->
<script lang="ts">
  import {
    Bluetooth,
    Check,
    ChevronDown,
    Loader2,
    Play,
    RotateCcw,
    Trash2,
    TriangleAlert,
  } from "@lucide/svelte";
  import { ears, deviceNameFor } from "$lib/ble/PROTOTYPE-ears.svelte";

  let {
    animation,
    keyframeCount,
  }: {
    animation: { id: string; name: string; robot?: { slug: string } };
    keyframeCount: number;
  } = $props();

  const deviceName = $derived(deviceNameFor(animation.name));
  const phase = $derived(ears.phase);
  const transfer = $derived(ears.transfer);
  const existing = $derived(ears.slotHolding(animation.id));

  let chosen = $state<number | null>(null);
  let pickerOpen = $state(false);
  let manageOpen = $state(false);

  // The default target, in priority order: where this animation already lives,
  // then the first empty slot. Never a silent overwrite of someone else's slot.
  const target = $derived(chosen ?? existing?.index ?? ears.firstFreeSlot());
  const occupant = $derived(target === null ? undefined : ears.slotAt(target));
  const slotIndexes = $derived([...Array(ears.slotCount).keys()]);

  function send() {
    if (target === null) return;
    ears.upload({
      slot: target,
      animationId: animation.id,
      name: deviceName.value,
      keyframeCount,
      channels: 4,
    });
  }
</script>

<section class="rounded-lg border border-gray-200 dark:border-gray-800">
  <div class="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
    <h2 class="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
      <Bluetooth class="h-4 w-4" /> Send to your ears
    </h2>
  </div>

  <div class="space-y-3 p-4">
    {#if phase.kind === "unsupported"}
      <!-- Explains itself rather than hiding. The section is the only place the
           ears exist in this variant, so hiding it would erase the feature. -->
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Your browser can't talk to Bluetooth devices. Open Milk Lab in Chrome or Edge — on a desktop,
        or on Android — to send animations to your ears. This doesn't work on iPhone or iPad.
      </p>
    {:else if phase.kind === "disconnected"}
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Turn your ears on, then connect. You'll pick <span class="font-medium">ROBO_CAT_EARS</span> in
        your browser's dialog.
      </p>
      {#if phase.lastError}
        <p class="text-sm text-red-600 dark:text-red-400">{phase.lastError}</p>
      {/if}
      <button
        onclick={() => ears.connect()}
        class="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
      >
        Connect to my ears
      </button>
      <p class="text-xs text-gray-400">
        You'll need to reconnect each time you reload the page — browsers don't remember Bluetooth
        devices.
      </p>
    {:else if phase.kind === "connecting"}
      <p class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
        <Loader2 class="h-4 w-4 animate-spin" />
        {phase.step === "picker"
          ? "Waiting for you to pick your ears…"
          : phase.step === "capability"
            ? "Saying hello to your ears…"
            : "Reading what's already on them…"}
      </p>
    {:else if phase.kind === "refused"}
      <p class="text-sm text-amber-700 dark:text-amber-400">
        Your ears are running protocol v{phase.reportedVersion}, but this app speaks v1. Update
        whichever one is older and try again.
      </p>
    {:else if ears.isReady}
      {#if transfer.kind === "uploading"}
        <p class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <Loader2 class="h-4 w-4 animate-spin" /> Sending to slot {transfer.slot + 1}…
        </p>
        <div class="h-1.5 rounded bg-gray-200 dark:bg-gray-800">
          <div
            class="h-1.5 rounded bg-sky-500 transition-all"
            style="width: {((transfer.chunkIndex + 1) / transfer.chunkCount) * 100}%"
          ></div>
        </div>
        <p class="text-xs text-gray-400">
          Frame {transfer.chunkIndex + 1} of {transfer.chunkCount}. Keep this tab open.
        </p>
      {:else if transfer.kind === "reconciling"}
        <p class="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
          <Loader2 class="h-4 w-4 animate-spin" />
          Your ears stopped answering. Checking whether it saved…
        </p>
      {:else if transfer.kind === "done"}
        <p class="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
          <Check class="h-4 w-4" />
          "{transfer.name}" is in slot {transfer.slot + 1}{transfer.overwrote
            ? `, replacing "${transfer.overwrote}"`
            : ""}.
        </p>
        <div class="flex gap-2">
          <button
            onclick={() => ears.play(transfer.slot)}
            class="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
          >
            <Play class="h-3.5 w-3.5" /> Play it now
          </button>
          <button onclick={() => ears.clearTransfer()} class="px-3 py-1.5 text-sm text-gray-500">
            Send somewhere else
          </button>
        </div>
      {:else if transfer.kind === "failed"}
        <p class="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
          <TriangleAlert class="mt-0.5 h-4 w-4 shrink-0" />
          <span>{transfer.message}</span>
        </p>
        <button
          onclick={() => ears.clearTransfer()}
          class="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700"
        >
          <RotateCcw class="h-3.5 w-3.5" /> Try again
        </button>
        <p class="text-xs text-gray-400">Error code: {transfer.code}</p>
      {:else if target === null}
        <p class="text-sm text-amber-700 dark:text-amber-400">
          All {ears.slotCount} slots are full. Delete one below to make room.
        </p>
      {:else}
        <p class="text-sm text-gray-700 dark:text-gray-300">
          Sending <span class="font-medium">"{deviceName.value}"</span>
          {#if deviceName.truncated}<span class="text-gray-400"> (shortened to fit)</span>{/if}
          to slot <span class="font-medium">{target + 1}</span>{#if occupant}, replacing
            <span class="font-medium">"{occupant.name}"</span>{/if}.
        </p>
        {#if occupant}
          <p class="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
            <TriangleAlert class="mt-0.5 h-4 w-4 shrink-0" />
            <span>That replaces what's in the slot. It can't be undone from here.</span>
          </p>
        {/if}
        <div class="flex items-center gap-2">
          <button
            onclick={send}
            class="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            {occupant ? "Replace and send" : "Send"}
          </button>
          <button
            onclick={() => (pickerOpen = !pickerOpen)}
            class="text-sm text-gray-500 underline"
          >
            {pickerOpen ? "Use the suggested slot" : "Choose a different slot"}
          </button>
        </div>

        {#if pickerOpen}
          <div class="grid grid-cols-2 gap-1.5 pt-1">
            {#each slotIndexes as index (index)}
              {@const entry = ears.slotAt(index)}
              <button
                onclick={() => {
                  chosen = index;
                  pickerOpen = false;
                }}
                class="flex items-baseline gap-2 rounded border px-2 py-1.5 text-left text-xs
                  {target === index ? 'border-sky-500 bg-sky-50 dark:bg-sky-950' : 'border-gray-200 dark:border-gray-800'}"
              >
                <span class="text-gray-400">{index + 1}</span>
                <span class="truncate {entry ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400'}">
                  {entry?.name ?? "empty"}
                </span>
              </button>
            {/each}
          </div>
        {/if}
      {/if}
    {/if}
  </div>

  {#if ears.isReady}
    <!-- Management is deliberately off the upload path: a disclosure, closed by
         default, so deleting is never one stray click away from sending. -->
    <div class="border-t border-gray-200 dark:border-gray-800">
      <button
        onclick={() => (manageOpen = !manageOpen)}
        class="flex w-full items-center justify-between px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400"
      >
        <span>What's on your ears · {ears.usedSlots} of {ears.slotCount} slots</span>
        <ChevronDown class="h-4 w-4 transition-transform {manageOpen ? 'rotate-180' : ''}" />
      </button>
      {#if manageOpen}
        <ul class="px-4 pb-3">
          {#each ears.slots as entry (entry.index)}
            <li class="flex items-center gap-2 border-t border-gray-100 py-2 dark:border-gray-900">
              <span class="w-5 text-xs text-gray-400">{entry.index + 1}</span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm text-gray-800 dark:text-gray-200">{entry.name}</p>
                {#if entry.animationId === null}
                  <p class="text-xs text-gray-400">Made on the ears — not from Milk Lab</p>
                {/if}
              </div>
              <button
                onclick={() => ears.play(entry.index)}
                disabled={ears.busySlot !== null}
                aria-label="Play"
                class="rounded p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                {#if ears.busySlot === entry.index}
                  <Loader2 class="h-3.5 w-3.5 animate-spin" />
                {:else}
                  <Play class="h-3.5 w-3.5" />
                {/if}
              </button>
              <button
                onclick={() => ears.deleteSlot(entry.index)}
                disabled={ears.busySlot !== null}
                aria-label="Delete"
                class="rounded p-1.5 text-red-600 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </li>
          {:else}
            <li class="py-2 text-sm text-gray-400">Nothing saved on your ears yet.</li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</section>
