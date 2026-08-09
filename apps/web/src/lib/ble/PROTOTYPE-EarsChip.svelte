<!-- PROTOTYPE — throwaway. The global connection affordance, for variants A and B. -->
<script lang="ts">
  import { Bluetooth, BluetoothConnected, BluetoothOff } from "@lucide/svelte";
  import { ears } from "./PROTOTYPE-ears.svelte";

  let { onopen }: { onopen?: () => void } = $props();

  const phase = $derived(ears.phase);
</script>

{#if phase.kind === "unsupported"}
  <!-- navigator.bluetooth is simply absent. The entry point explains itself
       rather than hiding: a user who came here to send to their ears needs to
       know why they can't, not to wonder where the button went. -->
  <span
    class="flex items-center gap-1.5 rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-500"
    title="Your ears connect over Web Bluetooth, which Safari and Firefox don't support. Use Chrome or Edge on desktop or Android."
  >
    <BluetoothOff class="h-3.5 w-3.5" /> Ears need Chrome
  </span>
{:else if phase.kind === "ready"}
  <button
    type="button"
    onclick={onopen}
    class="flex items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-800 hover:bg-sky-200 dark:bg-sky-950 dark:text-sky-300"
  >
    <BluetoothConnected class="h-3.5 w-3.5" />
    Ears · {ears.usedSlots}/{ears.slotCount}
  </button>
{:else if phase.kind === "connecting"}
  <span class="flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
    <Bluetooth class="h-3.5 w-3.5 animate-pulse" />
    {phase.step === "picker" ? "Choose your ears…" : phase.step === "capability" ? "Checking…" : "Reading slots…"}
  </span>
{:else if phase.kind === "refused"}
  <span
    class="flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300"
    title="Your ears speak protocol v{phase.reportedVersion}; this app speaks v1. Update whichever is older."
  >
    <BluetoothOff class="h-3.5 w-3.5" /> Ears out of date
  </span>
{:else}
  <button
    type="button"
    onclick={() => ears.connect()}
    class="flex items-center gap-1.5 rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
  >
    <Bluetooth class="h-3.5 w-3.5" />
    {phase.lastError ? "Reconnect" : "Connect ears"}
  </button>
{/if}
