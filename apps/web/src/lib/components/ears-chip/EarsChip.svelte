<!--
  The one place the app connects to a pair of ears, and the connection's status
  display in the same object.

  Browser-only: `navigator.bluetooth` does not exist during SSR, so a chip
  rendered on the server would have to guess and would tell Firefox users the
  wrong thing until hydration corrected it.
-->
<script lang="ts">
  import { browser } from "$app/environment";
  import { Bluetooth, BluetoothConnected, BluetoothOff, LoaderCircle } from "@lucide/svelte";
  import { chipView } from "$lib/ears/chip";
  import { ears } from "$lib/ears/connection.svelte";
  import { resolveRegistration } from "$lib/devices/registration";
  import { deviceStore } from "$lib/devices/store.svelte";

  // composed here rather than read off the connection: resolving a registration
  // needs the device list, and the connection object deliberately knows nothing
  // about tRPC or the logged-in user. Same shape as `sendEligibility`.
  //
  // No `?? data.devices` fallback, unlike the routes: this component is
  // browser-only, so it never renders in the pass where the store is unseeded.
  const view = $derived(
    chipView(ears.state, resolveRegistration(ears.state, deviceStore.all)),
  );

  const TONE_CLASSES = {
    unavailable: "text-gray-500 dark:text-gray-500",
    idle: "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white",
    busy: "text-gray-600 dark:text-gray-400",
    live: "text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950",
  } as const;

  function act(): void {
    if (view.action === "connect") void ears.connect();
    else if (view.action === "disconnect") ears.disconnect();
  }
</script>

{#if browser}
  <button
    type="button"
    onclick={act}
    disabled={view.action === "none"}
    aria-label={view.action === "disconnect"
      ? `Disconnect from ${view.label}`
      : `${view.label}. ${view.detail}`}
    class="flex max-w-56 items-center gap-2 rounded-md px-2 py-1 text-left disabled:cursor-default {TONE_CLASSES[
      view.tone
    ]}"
  >
    {#if view.tone === "busy"}
      <LoaderCircle class="size-4 shrink-0 animate-spin" aria-hidden="true" />
    {:else if view.tone === "live"}
      <BluetoothConnected class="size-4 shrink-0" aria-hidden="true" />
    {:else if view.tone === "unavailable"}
      <BluetoothOff class="size-4 shrink-0" aria-hidden="true" />
    {:else}
      <Bluetooth class="size-4 shrink-0" aria-hidden="true" />
    {/if}
    <span class="min-w-0">
      <span class="block truncate text-sm leading-tight">{view.label}</span>
      <!-- clamped, not truncated: a failure notice is the point of the line -->
      <span
        title={view.detail}
        class="line-clamp-2 text-xs leading-tight text-gray-500 dark:text-gray-500"
        >{view.detail}</span
      >
    </span>
  </button>
{/if}
