<!--
  PROTOTYPE — throwaway. Variant A: "Slot grid dialog".

  Connecting is GLOBAL and lives in the header chip. The page carries one
  "Send to ears" button; everything else happens in a modal that shows all 16
  slots at once as a grid. The same dialog, opened from the chip, is the slot
  manager — one surface, two entry points.
-->
<script lang="ts">
  import { Bluetooth, Check, Loader2, Play, Trash2, TriangleAlert, X } from "@lucide/svelte";
  import { ears, eligibilityOf, deviceNameFor, utf8Length, DEVICE_MAX_NAME_BYTES } from "$lib/ble/PROTOTYPE-ears.svelte";

  let {
    animation,
    keyframeCount,
    open = $bindable(false),
  }: {
    animation: { id: string; name: string; ownerId: string; robot?: { slug: string } };
    keyframeCount: number;
    open?: boolean;
  } = $props();

  const eligibility = $derived(
    eligibilityOf({ keyframeCount, robotSlug: animation.robot?.slug }),
  );

  let selected = $state<number | null>(null);
  let name = $state("");
  const truncated = $derived(deviceNameFor(animation.name).truncated);

  const phase = $derived(ears.phase);
  const transfer = $derived(ears.transfer);
  const existing = $derived(ears.slotHolding(animation.id));

  async function openDialog() {
    open = true;
    ears.clearTransfer();
    name = deviceNameFor(animation.name).value;
    if (phase.kind === "disconnected") await ears.connect();
    // after the LIST, not before it — there are no slots to default to until then
    selected = ears.slotHolding(animation.id)?.index ?? ears.firstFreeSlot();
  }

  function send() {
    if (selected === null) return;
    ears.upload({
      slot: selected,
      animationId: animation.id,
      name,
      keyframeCount,
      channels: 4,
    });
  }

  const slotIndexes = $derived([...Array(ears.slotCount).keys()]);
  const occupant = $derived(selected === null ? undefined : ears.slotAt(selected));
  const busy = $derived(transfer.kind === "uploading" || transfer.kind === "reconciling");
</script>

<div class="space-y-2">
  <button
    type="button"
    onclick={openDialog}
    disabled={!eligibility.ok || phase.kind === "unsupported"}
    class="flex w-full items-center justify-center gap-2 rounded-md bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
  >
    <Bluetooth class="h-4 w-4" />
    {existing ? "Re-send to my ears" : "Send to my ears"}
  </button>

  <!-- Disabled with a reason, never hidden: a missing button is a mystery, and
       "why can't I send this" is a question the page should answer in place. -->
  {#if !eligibility.ok}
    <p class="text-xs text-amber-700 dark:text-amber-400">{eligibility.reason}</p>
  {:else if phase.kind === "unsupported"}
    <p class="text-xs text-gray-500">
      Sending to your ears needs Chrome or Edge, on desktop or Android.
    </p>
  {:else if existing}
    <p class="text-xs text-gray-500">Already in slot {existing.index + 1} as "{existing.name}".</p>
  {/if}
</div>

{#if open}
  <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
    <div class="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl dark:bg-gray-900">
      <div class="mb-4 flex items-start justify-between">
        <div>
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Send to my ears</h2>
          {#if ears.isReady}
            <p class="text-xs text-gray-500">
              {ears.usedSlots} of {ears.slotCount} slots used
            </p>
          {/if}
        </div>
        <button onclick={() => (open = false)} aria-label="Close" class="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800">
          <X class="h-4 w-4" />
        </button>
      </div>

      {#if phase.kind === "connecting"}
        <p class="flex items-center gap-2 py-8 text-sm text-gray-600 dark:text-gray-400">
          <Loader2 class="h-4 w-4 animate-spin" />
          {phase.step === "picker"
            ? "Pick ROBO_CAT_EARS in the browser's dialog…"
            : phase.step === "capability"
              ? "Saying hello to your ears…"
              : "Reading what's on your ears…"}
        </p>
      {:else if phase.kind === "refused"}
        <p class="py-8 text-sm text-amber-700 dark:text-amber-400">
          Your ears speak protocol v{phase.reportedVersion}, and this app speaks v1. Update whichever
          is older, then reconnect.
        </p>
      {:else if phase.kind === "disconnected"}
        <div class="py-8 text-center">
          {#if phase.lastError}
            <p class="mb-3 text-sm text-red-600 dark:text-red-400">{phase.lastError}</p>
          {/if}
          <button onclick={() => ears.connect()} class="rounded-md bg-sky-600 px-4 py-2 text-sm text-white">
            Connect to my ears
          </button>
        </div>
      {:else if ears.isReady}
        <!-- Name is editable here because the device's 32 bytes and the web
             app's 100 characters disagree, and truncation should be the user's
             call rather than a silent chop. -->
        <label class="mb-4 block">
          <span class="text-xs font-medium text-gray-700 dark:text-gray-300">Name on the ears</span>
          <input
            bind:value={name}
            class="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
          <span class="text-xs {utf8Length(name) > DEVICE_MAX_NAME_BYTES ? 'text-red-600' : 'text-gray-500'}">
            {utf8Length(name)}/{DEVICE_MAX_NAME_BYTES} bytes{truncated ? " · shortened to fit" : ""}
          </span>
        </label>

        <p class="mb-2 text-xs font-medium text-gray-700 dark:text-gray-300">Choose a slot</p>
        <div class="mb-4 grid grid-cols-4 gap-2">
          {#each slotIndexes as index (index)}
            {@const entry = ears.slotAt(index)}
            {@const isTarget = transfer.kind !== "idle" && transfer.slot === index}
            <button
              type="button"
              disabled={busy}
              onclick={() => (selected = index)}
              class="relative h-16 rounded-md border p-1.5 text-left text-[11px] leading-tight transition
                {selected === index
                ? 'border-sky-500 ring-2 ring-sky-300'
                : 'border-gray-300 dark:border-gray-700'}
                {entry ? 'bg-gray-50 dark:bg-gray-800' : 'bg-white dark:bg-gray-900'}"
            >
              <span class="block text-gray-400">{index + 1}</span>
              {#if entry}
                <span class="block truncate font-medium text-gray-800 dark:text-gray-200">{entry.name}</span>
                {#if entry.animationId === null}
                  <span class="block text-gray-400">on-device</span>
                {/if}
              {:else}
                <span class="block text-gray-400">empty</span>
              {/if}
              {#if isTarget && transfer.kind === "uploading"}
                <span class="absolute inset-x-1.5 bottom-1.5 h-1 rounded bg-gray-200">
                  <span
                    class="block h-1 rounded bg-sky-500"
                    style="width: {((transfer.chunkIndex + 1) / transfer.chunkCount) * 100}%"
                  ></span>
                </span>
              {/if}
            </button>
          {/each}
        </div>

        {#if transfer.kind === "uploading"}
          <p class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <Loader2 class="h-4 w-4 animate-spin" />
            Sending… frame {transfer.chunkIndex + 1} of {transfer.chunkCount}
          </p>
        {:else if transfer.kind === "reconciling"}
          <!-- The unknown-outcome case. Never "failed" — the store may well have
               landed, and re-reading LIST is the only way to find out. -->
          <p class="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
            <Loader2 class="h-4 w-4 animate-spin" />
            Your ears went quiet. Checking whether it saved…
          </p>
        {:else if transfer.kind === "done"}
          <p class="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
            <Check class="h-4 w-4" />
            Saved to slot {transfer.slot + 1}{transfer.overwrote
              ? `, replacing "${transfer.overwrote}"`
              : ""}.
          </p>
        {:else if transfer.kind === "failed"}
          <p class="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
            <TriangleAlert class="mt-0.5 h-4 w-4 shrink-0" />
            <span>{transfer.message} <span class="text-gray-400">({transfer.code})</span></span>
          </p>
        {:else if occupant}
          <!-- Overwrite confirmation is inline, not a second modal: the grid
               already shows what is there, so the button just has to say it. -->
          <p class="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
            <TriangleAlert class="mt-0.5 h-4 w-4 shrink-0" />
            <span>Slot {occupant.index + 1} holds "{occupant.name}". Sending replaces it.</span>
          </p>
        {/if}

        <div class="mt-4 flex items-center justify-between gap-2">
          <div class="flex gap-1">
            {#if occupant && !busy}
              <button
                onclick={() => ears.play(occupant.index)}
                disabled={ears.busySlot !== null}
                class="flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs dark:border-gray-700"
              >
                <Play class="h-3 w-3" /> Play
              </button>
              <button
                onclick={() => ears.deleteSlot(occupant.index)}
                disabled={ears.busySlot !== null}
                class="flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs text-red-600 dark:border-gray-700"
              >
                <Trash2 class="h-3 w-3" /> Delete
              </button>
            {/if}
          </div>
          <button
            onclick={send}
            disabled={selected === null || busy || utf8Length(name) === 0 || utf8Length(name) > DEVICE_MAX_NAME_BYTES}
            class="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {occupant ? `Replace slot ${selected! + 1}` : `Send to slot ${(selected ?? 0) + 1}`}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}
