<!--
  PROTOTYPE — variant A's chip. Deliberately unchanged in shape from today's:
  one verb, `ChipView.action` stays a closed union. Registration never appears
  here — it is the dialog's job, and after that the profile page's.
-->
<script lang="ts">
  import { Bluetooth, BluetoothConnected, BluetoothOff } from "@lucide/svelte";
  import { proto } from "./PROTOTYPE-profile.svelte";

  const registeredName = $derived(proto.connectedDevice?.name ?? null);
</script>

{#if proto.link === "unsupported"}
  <span class="flex max-w-56 items-center gap-2 px-2 py-1 text-gray-500">
    <BluetoothOff class="size-4 shrink-0" aria-hidden="true" />
    <span class="min-w-0">
      <span class="block truncate text-sm leading-tight">Ears need Chrome</span>
      <span class="block text-xs leading-tight text-gray-500">Never iPhone or iPad</span>
    </span>
  </span>
{:else if proto.link === "disconnected"}
  <button
    type="button"
    onclick={() => proto.connect()}
    class="flex max-w-56 items-center gap-2 rounded-md px-2 py-1 text-left text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
  >
    <Bluetooth class="size-4 shrink-0" aria-hidden="true" />
    <span class="min-w-0">
      <span class="block truncate text-sm leading-tight">Connect ears</span>
      <span class="block text-xs leading-tight text-gray-500">For this tab only</span>
    </span>
  </button>
{:else}
  <button
    type="button"
    onclick={() => proto.disconnect()}
    class="flex max-w-56 items-center gap-2 rounded-md px-2 py-1 text-left text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
  >
    <BluetoothConnected class="size-4 shrink-0" aria-hidden="true" />
    <span class="min-w-0">
      <span class="block truncate text-sm leading-tight"
        >{registeredName ?? proto.advertisedName}</span
      >
      <span class="block truncate text-xs leading-tight text-gray-500">
        {registeredName ? "3 of 16 slots used" : "Unregistered · this tab only"}
      </span>
    </span>
  </button>
{/if}
