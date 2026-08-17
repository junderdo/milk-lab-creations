<!--
  PROTOTYPE — variant C's chip. The registration moment lives *inside the chip*:
  the panel opens itself on a connect that needs a name, and the naming field is
  right under the thing that just changed state. No page, no modal, no banner.
-->
<script lang="ts">
  import { Bluetooth, BluetoothConnected, BluetoothOff, Check, X } from "@lucide/svelte";
  import { proto } from "./PROTOTYPE-profile.svelte";

  let open = $state(false);
  let name = $state("");
  /** Reopen once per newly connected serial, never on every render. */
  let promptedFor = $state<string | null>(null);

  const device = $derived(proto.connectedDevice);

  $effect(() => {
    const serial = proto.connectedSerial;
    if (serial && proto.needsRegistration && promptedFor !== serial) {
      promptedFor = serial;
      name = "";
      open = true;
    }
    if (!serial) promptedFor = null;
  });

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!proto.connectedSerial || name.trim() === "") return;
    proto.register(proto.connectedSerial, name);
    open = false;
  }
</script>

<div class="relative">
  {#if proto.link === "unsupported"}
    <span class="flex items-center gap-2 px-2 py-1 text-sm text-gray-500">
      <BluetoothOff class="size-4" aria-hidden="true" /> Ears need Chrome
    </span>
  {:else if proto.link === "disconnected"}
    <button
      type="button"
      onclick={() => proto.connect()}
      class="flex items-center gap-2 rounded-full border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
    >
      <Bluetooth class="size-4" aria-hidden="true" /> Connect ears
    </button>
  {:else}
    <button
      type="button"
      onclick={() => (open = !open)}
      aria-expanded={open}
      class="flex items-center gap-2 rounded-full border border-emerald-300 px-3 py-1 text-sm text-emerald-800 dark:border-emerald-800 dark:text-emerald-300"
    >
      <BluetoothConnected class="size-4" aria-hidden="true" />
      <span class="max-w-32 truncate">{device?.name ?? proto.advertisedName}</span>
    </button>
  {/if}

  {#if open && (proto.link === "connected" || proto.link === "pre-serial")}
    <div
      class="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-800 dark:bg-gray-900"
    >
      {#if proto.preSerialFirmware}
        <p class="text-sm font-medium text-gray-900 dark:text-white">Connected</p>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
          You can send animations to these ears, but you can't name them yet — their firmware is too
          old to tell the app which pair they are.
        </p>
        <input
          disabled
          placeholder="Name these ears"
          class="mt-3 w-full cursor-not-allowed rounded-md border border-gray-200 px-2 py-1.5 text-sm opacity-50 dark:border-gray-800"
        />
      {:else if device}
        <p class="text-sm font-medium text-gray-900 dark:text-white">{device.name}</p>
        <p class="mt-1 font-mono text-xs text-gray-500">{device.serial}</p>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">Connected for this tab only.</p>
      {:else}
        <form onsubmit={submit}>
          <p class="text-sm font-medium text-gray-900 dark:text-white">
            You haven't named this pair
          </p>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Give them a name and they'll show up here instead of "{proto.advertisedName}".
          </p>
          <!-- svelte-ignore a11y_autofocus -->
          <input
            bind:value={name}
            autofocus
            placeholder="Desk ears"
            class="mt-3 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
          <div class="mt-3 flex items-center gap-2">
            <button
              type="submit"
              disabled={name.trim() === ""}
              class="inline-flex items-center gap-1 rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-gray-900"
            >
              <Check class="size-4" aria-hidden="true" /> Save name
            </button>
            <button
              type="button"
              onclick={() => {
                proto.dismiss(proto.connectedSerial!);
                open = false;
              }}
              class="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              <X class="size-4" aria-hidden="true" /> Not now
            </button>
          </div>
        </form>
      {/if}

      <button
        type="button"
        onclick={() => {
          proto.disconnect();
          open = false;
        }}
        class="mt-4 text-xs text-gray-500 hover:underline"
      >
        Disconnect
      </button>
    </div>
  {/if}
</div>
