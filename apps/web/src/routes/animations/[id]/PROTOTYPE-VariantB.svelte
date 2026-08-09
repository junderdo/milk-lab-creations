<!--
  PROTOTYPE — throwaway. Variant B: "Device dock".

  No modal anywhere. A dock pinned to the right edge is the ears — always
  present once connected, showing all 16 slots as a live inventory with play and
  delete on every row. Sending doesn't open anything: it ARMS the dock, and the
  slots become targets you click. The device is a place, not a dialog.
-->
<script lang="ts">
  import {
    Bluetooth,
    Check,
    ChevronRight,
    Loader2,
    Play,
    Plus,
    RefreshCw,
    Trash2,
    TriangleAlert,
  } from "@lucide/svelte";
  import { ears, eligibilityOf, deviceNameFor } from "$lib/ble/PROTOTYPE-ears.svelte";

  let {
    animation,
    keyframeCount,
    armed = $bindable(false),
  }: {
    animation: { id: string; name: string; robot?: { slug: string } };
    keyframeCount: number;
    armed?: boolean;
  } = $props();

  const eligibility = $derived(eligibilityOf({ keyframeCount, robotSlug: animation.robot?.slug }));
  const deviceName = $derived(deviceNameFor(animation.name));
  const phase = $derived(ears.phase);
  const transfer = $derived(ears.transfer);
  const existing = $derived(ears.slotHolding(animation.id));
  const busy = $derived(transfer.kind === "uploading" || transfer.kind === "reconciling");

  const slotIndexes = $derived([...Array(ears.slotCount).keys()]);

  let open = $state(true);

  async function arm() {
    armed = true;
    open = true;
    ears.clearTransfer();
    if (phase.kind === "disconnected") await ears.connect();
  }

  function sendTo(slot: number) {
    if (!armed || busy) return;
    // Name is not editable here: the dock has no room for a form, and the
    // animation's own name is what the user already chose. Truncation to 32
    // bytes is shown on the arming banner instead.
    ears.upload({
      slot,
      animationId: animation.id,
      name: deviceName.value,
      keyframeCount,
      channels: 4,
    });
    armed = false;
  }
</script>

<button
  type="button"
  onclick={arm}
  disabled={!eligibility.ok || phase.kind === "unsupported"}
  class="flex w-full items-center justify-center gap-2 rounded-md bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
>
  <Bluetooth class="h-4 w-4" />
  {existing ? "Re-send to my ears" : "Send to my ears"}
</button>
{#if !eligibility.ok}
  <p class="mt-2 text-xs text-amber-700 dark:text-amber-400">{eligibility.reason}</p>
{:else if phase.kind === "unsupported"}
  <p class="mt-2 text-xs text-gray-500">Sending to your ears needs Chrome or Edge.</p>
{/if}

{#if phase.kind !== "unsupported" && phase.kind !== "disconnected"}
  <aside
    class="fixed top-0 right-0 z-40 flex h-dvh w-72 flex-col border-l border-gray-200 bg-white shadow-lg transition-transform dark:border-gray-800 dark:bg-gray-950
      {open ? 'translate-x-0' : 'translate-x-[17rem]'}"
  >
    <button
      onclick={() => (open = !open)}
      class="absolute top-1/2 -left-6 rounded-l-md border border-r-0 border-gray-200 bg-white p-1.5 dark:border-gray-800 dark:bg-gray-950"
      aria-label={open ? "Hide ears" : "Show ears"}
    >
      <ChevronRight class="h-4 w-4 transition-transform {open ? '' : 'rotate-180'}" />
    </button>

    <header class="border-b border-gray-200 p-3 dark:border-gray-800">
      <div class="flex items-center justify-between">
        <p class="text-sm font-semibold text-gray-900 dark:text-white">My ears</p>
        {#if ears.isReady}
          <button onclick={() => ears.refreshList()} aria-label="Refresh" class="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800">
            <RefreshCw class="h-3.5 w-3.5 text-gray-500" />
          </button>
        {/if}
      </div>
      {#if phase.kind === "connecting"}
        <p class="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
          <Loader2 class="h-3 w-3 animate-spin" />
          {phase.step === "picker" ? "Choose ROBO_CAT_EARS…" : phase.step === "capability" ? "Saying hello…" : "Reading slots…"}
        </p>
      {:else if phase.kind === "refused"}
        <p class="mt-1 text-xs text-amber-700 dark:text-amber-400">
          Ears speak v{phase.reportedVersion}, app speaks v1. Update whichever is older.
        </p>
      {:else if ears.isReady}
        <p class="mt-1 text-xs text-gray-500">{ears.usedSlots} of {ears.slotCount} slots used</p>
      {/if}
    </header>

    {#if armed && ears.isReady}
      <!-- Arming banner: the dock's whole mode changed, so it says so loudly
           and stays dismissible. This is the overwrite warning's home too. -->
      <div class="border-b border-sky-200 bg-sky-50 p-3 text-xs dark:border-sky-900 dark:bg-sky-950">
        <p class="font-medium text-sky-900 dark:text-sky-200">Pick a slot for "{deviceName.value}"</p>
        {#if deviceName.truncated}
          <p class="mt-0.5 text-sky-700 dark:text-sky-400">Name shortened to fit 32 bytes.</p>
        {/if}
        <p class="mt-0.5 text-sky-700 dark:text-sky-400">Choosing a full slot replaces it.</p>
        <button onclick={() => (armed = false)} class="mt-1 underline">Cancel</button>
      </div>
    {/if}

    {#if ears.isReady}
      <ul class="flex-1 overflow-y-auto">
        {#each slotIndexes as index (index)}
          {@const entry = ears.slotAt(index)}
          {@const active = transfer.kind !== "idle" && transfer.slot === index}
          <li class="border-b border-gray-100 dark:border-gray-900">
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <div
              class="group flex items-center gap-2 px-3 py-2 {armed && !busy
                ? 'cursor-pointer hover:bg-sky-50 dark:hover:bg-sky-950'
                : ''}"
              role={armed ? "button" : undefined}
              tabindex={armed ? 0 : undefined}
              onclick={() => sendTo(index)}
              onkeydown={(event) => event.key === "Enter" && sendTo(index)}
            >
              <span class="w-5 shrink-0 text-xs text-gray-400">{index + 1}</span>
              <div class="min-w-0 flex-1">
                {#if entry}
                  <p class="truncate text-xs font-medium text-gray-800 dark:text-gray-200">{entry.name}</p>
                  {#if entry.animationId === null}
                    <p class="text-[10px] text-gray-400">made on the ears · can't be renamed</p>
                  {:else if entry.animationId === animation.id}
                    <p class="text-[10px] text-sky-600">this animation</p>
                  {/if}
                {:else}
                  <p class="flex items-center gap-1 text-xs text-gray-400">
                    {#if armed}<Plus class="h-3 w-3" />{/if} empty
                  </p>
                {/if}

                {#if active && transfer.kind === "uploading"}
                  <div class="mt-1 h-1 rounded bg-gray-200 dark:bg-gray-800">
                    <div
                      class="h-1 rounded bg-sky-500 transition-all"
                      style="width: {((transfer.chunkIndex + 1) / transfer.chunkCount) * 100}%"
                    ></div>
                  </div>
                {:else if active && transfer.kind === "reconciling"}
                  <p class="mt-0.5 flex items-center gap-1 text-[10px] text-amber-600">
                    <Loader2 class="h-2.5 w-2.5 animate-spin" /> ears went quiet — checking…
                  </p>
                {:else if active && transfer.kind === "done"}
                  <p class="mt-0.5 flex items-center gap-1 text-[10px] text-green-600">
                    <Check class="h-2.5 w-2.5" />
                    saved{transfer.overwrote ? `, replaced "${transfer.overwrote}"` : ""}
                  </p>
                {:else if active && transfer.kind === "failed"}
                  <p class="mt-0.5 flex items-start gap-1 text-[10px] text-red-600">
                    <TriangleAlert class="mt-px h-2.5 w-2.5 shrink-0" />
                    {transfer.message}
                  </p>
                {/if}
              </div>

              {#if entry && !armed}
                <div class="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
                  <button
                    onclick={(event) => {
                      event.stopPropagation();
                      ears.play(index);
                    }}
                    disabled={ears.busySlot !== null}
                    aria-label="Play slot {index + 1}"
                    class="rounded p-1 hover:bg-gray-200 dark:hover:bg-gray-800"
                  >
                    {#if ears.busySlot === index}
                      <Loader2 class="h-3 w-3 animate-spin" />
                    {:else}
                      <Play class="h-3 w-3" />
                    {/if}
                  </button>
                  <button
                    onclick={(event) => {
                      event.stopPropagation();
                      ears.deleteSlot(index);
                    }}
                    disabled={ears.busySlot !== null}
                    aria-label="Delete slot {index + 1}"
                    class="rounded p-1 text-red-600 hover:bg-gray-200 dark:hover:bg-gray-800"
                  >
                    <Trash2 class="h-3 w-3" />
                  </button>
                </div>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </aside>
{/if}
