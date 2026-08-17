<!--
  PROTOTYPE — variant B's chip. The closed three-verb union widens into a menu:
  the chip is a status display that opens a list of what you can do to this
  connection. Registration is one row in it, so a dismissed prompt is found
  again in the same place a disconnect is.
-->
<script lang="ts">
  import { Bluetooth, BluetoothConnected, BluetoothOff, ChevronDown } from "@lucide/svelte";
  import { resolve } from "$app/paths";
  import { proto } from "./PROTOTYPE-profile.svelte";

  let open = $state(false);
  const device = $derived(proto.connectedDevice);
</script>

<div class="relative">
  {#if proto.link === "unsupported"}
    <span class="flex items-center gap-2 px-2 py-1 text-gray-500">
      <BluetoothOff class="size-4" aria-hidden="true" />
      <span class="text-sm">Ears need Chrome</span>
    </span>
  {:else if proto.link === "disconnected"}
    <button
      type="button"
      onclick={() => proto.connect()}
      class="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
    >
      <Bluetooth class="size-4" aria-hidden="true" />
      Connect ears
    </button>
  {:else}
    <button
      type="button"
      onclick={() => (open = !open)}
      aria-expanded={open}
      class="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
    >
      <BluetoothConnected class="size-4" aria-hidden="true" />
      <span class="max-w-32 truncate">{device?.name ?? proto.advertisedName}</span>
      {#if !device && !proto.preSerialFirmware}
        <span class="rounded-full bg-amber-200 px-1.5 text-[10px] text-amber-900">new</span>
      {/if}
      <ChevronDown class="size-3.5" aria-hidden="true" />
    </button>
  {/if}

  {#if open && proto.link !== "disconnected" && proto.link !== "unsupported"}
    <div
      class="absolute right-0 z-40 mt-1 w-64 rounded-lg border border-gray-200 bg-white p-1 text-sm shadow-lg dark:border-gray-800 dark:bg-gray-900"
    >
      <p class="px-3 py-2 text-xs text-gray-500">
        Connected for this tab only — gone on reload.
        {#if proto.connectedSerial}
          <span class="mt-1 block font-mono text-[11px]">{proto.connectedSerial}</span>
        {/if}
      </p>

      {#if proto.preSerialFirmware}
        <p class="px-3 py-2 text-xs text-gray-500">
          <span class="block font-medium text-gray-700 dark:text-gray-300">Can't be registered</span
          >
          These ears' firmware is too old to tell the app which pair they are. Update them and this will
          work.
        </p>
      {:else if device}
        <a
          href={`${resolve("/my")}?variant=B&tab=ears`}
          class="block rounded px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          Rename "{device.name}"
        </a>
      {:else}
        <a
          href={`${resolve("/my")}?variant=B&tab=ears`}
          class="block rounded px-3 py-2 font-medium hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          Register these ears
        </a>
      {/if}

      <button
        type="button"
        onclick={() => {
          proto.disconnect();
          open = false;
        }}
        class="block w-full rounded px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        Disconnect
      </button>
    </div>
  {/if}
</div>
