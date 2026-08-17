<!--
  PROTOTYPE — variant C: "Profile hub".

  /my *is* the profile. One scroll: who you are at the top, your ears as a
  shelf under it, your animations below — no tabs, no second page, no settings
  screen. Editing is inline and in place: click the name to type over it, click
  the avatar to open the swatches.

  There is no registration prompt on this page on purpose. In C the moment
  belongs to the chip (see PROTOTYPE-ChipC), which pops its own naming field the
  instant an unnamed pair connects. The shelf's ghost card is the second door.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { Pencil, Bluetooth } from "@lucide/svelte";
  import { PRESET_KEYS, PRESETS, avatarOf } from "$lib/profile/PROTOTYPE-avatars";
  import Avatar from "$lib/profile/PROTOTYPE-Avatar.svelte";
  import { proto } from "$lib/profile/PROTOTYPE-profile.svelte";

  let { animations }: { animations: Snippet } = $props();

  const current = $derived(avatarOf(proto.avatar, proto.userId));

  let pickerOpen = $state(false);
  let editingName = $state(false);
  let renaming = $state<string | null>(null);
  let renameValue = $state("");
  let registerName = $state("");

  function submitRegister(event: SubmitEvent) {
    event.preventDefault();
    if (!proto.connectedSerial || registerName.trim() === "") return;
    proto.register(proto.connectedSerial, registerName);
    registerName = "";
  }
</script>

<div class="mx-auto max-w-3xl space-y-8 px-4 py-8">
  <header class="flex items-center gap-5">
    <button
      type="button"
      onclick={() => (pickerOpen = !pickerOpen)}
      class="relative rounded-full ring-1 ring-gray-200 hover:ring-gray-400 dark:ring-gray-800"
      aria-label="Change avatar"
    >
      <Avatar preset={current} size="size-20" />
      <span
        class="absolute right-0 bottom-0 rounded-full bg-gray-900 p-1 text-white dark:bg-white dark:text-gray-900"
      >
        <Pencil class="size-3" aria-hidden="true" />
      </span>
    </button>

    <div class="min-w-0 flex-1">
      {#if editingName}
        <!-- svelte-ignore a11y_autofocus -->
        <input
          bind:value={proto.displayName}
          autofocus
          onblur={() => (editingName = false)}
          class="w-full max-w-xs rounded-md border border-gray-300 px-2 py-1 text-2xl font-bold dark:border-gray-700 dark:bg-gray-800"
        />
      {:else}
        <button
          type="button"
          onclick={() => (editingName = true)}
          class="group flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-white"
        >
          {proto.displayName}
          <Pencil
            class="size-4 text-gray-400 opacity-0 group-hover:opacity-100"
            aria-hidden="true"
          />
        </button>
      {/if}
      <p class="mt-1 text-sm text-gray-500">
        {proto.devices.length}
        {proto.devices.length === 1 ? "pair of ears" : "pairs of ears"} · your name and avatar are public
      </p>
    </div>
  </header>

  {#if pickerOpen}
    <div class="flex flex-wrap gap-2 rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
      {#each PRESET_KEYS as key (key)}
        <button
          type="button"
          title={PRESETS[key].name}
          aria-pressed={current === key}
          onclick={() => {
            proto.setAvatar(key);
            pickerOpen = false;
          }}
          class="rounded-full p-0.5 {current === key
            ? 'ring-2 ring-gray-900 dark:ring-white'
            : 'ring-1 ring-gray-200 dark:ring-gray-800'}"
        >
          <Avatar preset={key} size="size-12" />
        </button>
      {/each}
    </div>
  {/if}

  <section class="space-y-3">
    <h2 class="text-sm font-semibold text-gray-900 dark:text-white">My ears</h2>
    <div class="grid gap-3 sm:grid-cols-2">
      {#each proto.devices as device (device.serial)}
        <div
          class="rounded-xl border p-4 {proto.connectedSerial === device.serial
            ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950'
            : 'border-gray-200 dark:border-gray-800'}"
        >
          {#if renaming === device.serial}
            <form
              onsubmit={(e) => {
                e.preventDefault();
                proto.rename(device.serial, renameValue);
                renaming = null;
              }}
            >
              <!-- svelte-ignore a11y_autofocus -->
              <input
                bind:value={renameValue}
                autofocus
                class="w-full rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
              />
            </form>
          {:else}
            <p class="font-medium text-gray-900 dark:text-white">{device.name}</p>
          {/if}
          <p class="mt-1 font-mono text-xs text-gray-500">{device.serial}</p>
          <p class="mt-2 text-xs text-gray-500">
            {#if proto.connectedSerial === device.serial}
              <span class="font-medium text-emerald-700 dark:text-emerald-400"
                >Connected right now</span
              >
            {:else}
              Named {device.registeredAt.toLocaleDateString()}
            {/if}
          </p>
          <div class="mt-3 flex gap-3">
            <button
              class="text-xs text-gray-600 hover:underline dark:text-gray-400"
              onclick={() => {
                renaming = device.serial;
                renameValue = device.name;
              }}>Rename</button
            >
            <button
              class="text-xs text-red-600 hover:underline dark:text-red-400"
              onclick={() => proto.forget(device.serial)}>Forget</button
            >
          </div>
        </div>
      {/each}

      <!-- The ghost card: the shelf always shows a slot for the pair you're
           connected to, so "Not now" in the chip is never a dead end. -->
      <div
        class="rounded-xl border border-dashed p-4 {proto.connectedSerial && !proto.connectedDevice
          ? 'border-amber-400 dark:border-amber-700'
          : 'border-gray-300 dark:border-gray-700'}"
      >
        {#if proto.preSerialFirmware}
          <p class="font-medium text-gray-500">Can't be named yet</p>
          <p class="mt-2 text-xs text-gray-500">
            The pair you're connected to runs firmware from before ears could identify themselves.
            Update them and they'll appear here.
          </p>
          <button
            disabled
            class="mt-3 cursor-not-allowed rounded-md bg-gray-900 px-3 py-1.5 text-xs text-white opacity-40 dark:bg-white dark:text-gray-900"
            >Name these ears</button
          >
        {:else if proto.connectedSerial && !proto.connectedDevice}
          <p class="font-medium text-gray-900 dark:text-white">An unnamed pair is connected</p>
          <p class="mt-1 font-mono text-xs text-gray-500">{proto.connectedSerial}</p>
          <form class="mt-3 space-y-2" onsubmit={submitRegister}>
            <input
              bind:value={registerName}
              placeholder="Desk ears"
              class="w-full rounded-md border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
            />
            <button
              type="submit"
              disabled={registerName.trim() === ""}
              class="rounded-md bg-gray-900 px-3 py-1.5 text-xs text-white disabled:opacity-40 dark:bg-white dark:text-gray-900"
              >Add to my ears</button
            >
          </form>
        {:else}
          <p class="flex items-center gap-2 text-sm text-gray-500">
            <Bluetooth class="size-4" aria-hidden="true" /> Connect a pair to name it
          </p>
          <p class="mt-2 text-xs text-gray-500">
            Ears you name show up here and in the header instead of "{proto.advertisedName}".
          </p>
        {/if}
      </div>
    </div>
  </section>

  <section class="border-t border-gray-200 pt-6 dark:border-gray-800">
    {@render animations()}
  </section>

  <button class="text-xs text-gray-500 hover:underline">Delete account</button>
</div>
