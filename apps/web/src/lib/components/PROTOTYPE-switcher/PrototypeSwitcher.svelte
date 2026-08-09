<!-- PROTOTYPE — throwaway. Variant switcher + fault injection. Dev builds only. -->
<script lang="ts">
  import { dev } from "$app/environment";
  import { page } from "$app/state";
  import { replaceState } from "$app/navigation";
  import { ChevronLeft, ChevronRight, Bug } from "@lucide/svelte";
  import { ears } from "$lib/ble/PROTOTYPE-ears.svelte";
  import { STATUS, STATUS_NAME, type Status } from "$lib/ble/PROTOTYPE-fake-device";

  let { variants, names }: { variants: string[]; names: Record<string, string> } = $props();

  const current = $derived(page.url.searchParams.get("variant") ?? variants[0]!);
  let faultsOpen = $state(false);

  function go(step: number) {
    const at = variants.indexOf(current);
    const next = variants[(at + step + variants.length) % variants.length]!;
    const url = new URL(page.url);
    url.searchParams.set("variant", next);
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- prototype: same route, only the query changes
    replaceState(url, page.state);
    ears.disconnect();
  }

  function onKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (target?.matches("input, textarea, select, [contenteditable]")) return;
    if (event.key === "ArrowLeft") go(-1);
    if (event.key === "ArrowRight") go(1);
  }

  const nackable: Status[] = [
    STATUS.OK,
    STATUS.INVALID_ANIMATION,
    STATUS.INVALID_NAME,
    STATUS.TOO_LARGE,
    STATUS.STORAGE_FAILURE,
    STATUS.CHUNK_OUT_OF_ORDER,
    STATUS.UNSUPPORTED_OPCODE,
  ];
</script>

<svelte:window onkeydown={onKeydown} />

{#if dev}
  <div class="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 space-y-2">
    {#if faultsOpen}
      <div
        class="max-h-[60vh] w-80 overflow-y-auto rounded-lg border border-fuchsia-400 bg-white p-3 text-xs shadow-xl dark:bg-gray-900"
      >
        <p class="mb-2 font-semibold text-fuchsia-600">Fake device — fault injection</p>
        <p class="mb-2 text-gray-500">Reconnect after changing these.</p>
        <label class="mb-1 flex items-center gap-2"
          ><input type="checkbox" bind:checked={ears.faults.unsupportedBrowser} /> Browser has no
          Web Bluetooth</label
        >
        <label class="mb-1 flex items-center gap-2"
          ><input type="checkbox" bind:checked={ears.faults.cancelPicker} /> User dismisses picker</label
        >
        <label class="mb-1 flex items-center gap-2"
          ><input type="checkbox" bind:checked={ears.faults.slowLink} /> Slow link</label
        >
        <label class="mb-1 flex items-center gap-2"
          ><input type="checkbox" bind:checked={ears.faults.dropMidTransfer} /> Drop link mid-upload</label
        >
        <label class="mb-1 flex items-center gap-2"
          ><input type="checkbox" bind:checked={ears.faults.storeTimesOut} /> STORE times out (5 s)</label
        >
        <label class="mb-1 flex items-center gap-2 pl-5"
          ><input type="checkbox" bind:checked={ears.faults.timeoutActuallyLanded} /> …but it landed
          anyway</label
        >
        <label class="mb-1 block"
          >STORE answers
          <select bind:value={ears.faults.storeStatus} class="mt-1 w-full rounded border p-1">
            {#each nackable as status (status)}
              <option value={status}>{STATUS_NAME[status]}</option>
            {/each}
          </select>
        </label>
        <label class="mb-1 block"
          >Reported protocol version
          <input
            type="number"
            bind:value={ears.faults.protocolVersion}
            class="mt-1 w-full rounded border p-1"
          />
        </label>
        <label class="block"
          >Slots already full ({ears.faults.preloadedSlots})
          <input
            type="range"
            min="0"
            max="6"
            bind:value={ears.faults.preloadedSlots}
            class="w-full"
          />
        </label>
      </div>
    {/if}

    <div
      class="flex items-center gap-1 rounded-full border-2 border-fuchsia-500 bg-white px-2 py-1 shadow-xl dark:bg-gray-900"
    >
      <button onclick={() => go(-1)} class="rounded-full p-1 hover:bg-fuchsia-100" aria-label="Previous variant">
        <ChevronLeft class="h-4 w-4" />
      </button>
      <span class="px-2 text-xs font-medium whitespace-nowrap text-gray-900 dark:text-gray-100">
        {current} — {names[current]}
      </span>
      <button onclick={() => go(1)} class="rounded-full p-1 hover:bg-fuchsia-100" aria-label="Next variant">
        <ChevronRight class="h-4 w-4" />
      </button>
      <button
        onclick={() => (faultsOpen = !faultsOpen)}
        class="rounded-full p-1 hover:bg-fuchsia-100"
        aria-label="Fault injection"
      >
        <Bug class="h-4 w-4 {faultsOpen ? 'text-fuchsia-600' : ''}" />
      </button>
    </div>
  </div>
{/if}
