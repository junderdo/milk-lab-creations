<!--
  PROTOTYPE — throwaway, prototype/profile-and-registration. Dev builds only.
  Variant switcher plus the state panel: every case the profile page and the
  registration moment have to answer for is two clicks away.
-->
<script lang="ts">
  import { dev } from "$app/environment";
  import { page } from "$app/state";
  import { replaceState } from "$app/navigation";
  import { ChevronLeft, ChevronRight, Bug } from "@lucide/svelte";
  import { proto, type LinkFault } from "$lib/profile/PROTOTYPE-profile.svelte";

  let { variants, names }: { variants: string[]; names: Record<string, string> } = $props();

  const current = $derived(page.url.searchParams.get("variant") ?? variants[0]!);
  let panelOpen = $state(false);

  function go(step: number) {
    const at = variants.indexOf(current);
    const next = variants[(at + step + variants.length) % variants.length]!;
    const url = new URL(page.url);
    url.searchParams.set("variant", next);
    // each variant owns its own sub-navigation, so drop the other's
    url.searchParams.delete("pane");
    url.searchParams.delete("tab");
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- prototype: same route, only the query changes
    replaceState(url, page.state);
  }

  function onKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (target?.matches("input, textarea, select, [contenteditable]")) return;
    if (event.key === "ArrowLeft") go(-1);
    if (event.key === "ArrowRight") go(1);
  }

  const LINKS: { value: LinkFault; label: string }[] = [
    { value: "disconnected", label: "Disconnected" },
    { value: "connected", label: "Connected, serial known" },
    { value: "pre-serial", label: "Connected, firmware too old" },
    { value: "unsupported", label: "No Web Bluetooth (Firefox / iOS)" },
  ];
</script>

<svelte:window onkeydown={onKeydown} />

{#if dev}
  <div class="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 space-y-2">
    {#if panelOpen}
      <div
        class="max-h-[70vh] w-80 space-y-3 overflow-y-auto rounded-lg border border-fuchsia-400 bg-white p-3 text-xs text-gray-900 shadow-xl dark:bg-gray-900 dark:text-gray-100"
      >
        <p class="font-semibold text-fuchsia-600">Fake server + fake ears</p>

        <label class="block">
          Link
          <select
            bind:value={proto.faults.link}
            class="mt-1 w-full rounded border border-gray-300 p-1 dark:border-gray-700 dark:bg-gray-800"
          >
            {#each LINKS as link (link.value)}
              <option value={link.value}>{link.label}</option>
            {/each}
          </select>
        </label>

        <label class="block">
          Which pair is connected
          <select
            bind:value={proto.faults.serialIndex}
            class="mt-1 w-full rounded border border-gray-300 p-1 dark:border-gray-700 dark:bg-gray-800"
          >
            <option value={0}>Pair 1 — a41f3c9d2b70</option>
            <option value={1}>Pair 2 — 0c8e17ff42a1</option>
            <option value={2}>Pair 3 — 7b2d55e0c93f</option>
          </select>
          <span class="mt-1 block text-gray-500">
            {proto.connectedSerial && proto.isRegistered(proto.connectedSerial)
              ? "Already registered — no prompt is owed."
              : "Not registered — this is the registration moment."}
          </span>
        </label>

        <label class="block">
          Registered devices ({proto.devices.length})
          <input
            type="range"
            min="0"
            max="3"
            value={proto.faults.seeded}
            oninput={(e) => {
              proto.faults.seeded = Number(e.currentTarget.value);
              proto.reseed(proto.faults.seeded);
            }}
            class="w-full"
          />
        </label>

        {#if proto.connectedSerial}
          <div class="flex gap-2">
            {#if proto.dismissedHere}
              <button
                class="rounded border border-gray-300 px-2 py-1 dark:border-gray-700"
                onclick={() => proto.undismiss(proto.connectedSerial!)}
              >
                Clear dismissal
              </button>
            {:else}
              <button
                class="rounded border border-gray-300 px-2 py-1 dark:border-gray-700"
                onclick={() => proto.dismiss(proto.connectedSerial!)}
              >
                Dismiss prompt
              </button>
            {/if}
          </div>
          <p class="text-gray-500">
            Dismissed here: {proto.dismissedHere ? "yes" : "no"} · prompt owed: {proto.needsRegistration
              ? "yes"
              : "no"}
          </p>
        {/if}
      </div>
    {/if}

    <div
      class="flex items-center gap-1 rounded-full border-2 border-fuchsia-500 bg-white px-2 py-1 shadow-xl dark:bg-gray-900"
    >
      <button
        onclick={() => go(-1)}
        class="rounded-full p-1 hover:bg-fuchsia-100"
        aria-label="Previous variant"
      >
        <ChevronLeft class="h-4 w-4" />
      </button>
      <span class="px-2 text-xs font-medium whitespace-nowrap text-gray-900 dark:text-gray-100">
        {current} — {names[current]}
      </span>
      <button
        onclick={() => go(1)}
        class="rounded-full p-1 hover:bg-fuchsia-100"
        aria-label="Next variant"
      >
        <ChevronRight class="h-4 w-4" />
      </button>
      <button
        onclick={() => (panelOpen = !panelOpen)}
        class="rounded-full p-1 hover:bg-fuchsia-100"
        aria-label="Fake state panel"
      >
        <Bug class="h-4 w-4 {panelOpen ? 'text-fuchsia-600' : ''}" />
      </button>
    </div>
  </div>
{/if}
