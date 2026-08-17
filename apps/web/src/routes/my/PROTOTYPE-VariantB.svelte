<!--
  PROTOTYPE — variant B: "Tabs on /my".

  No new page. /my grows a tab strip — Animations | Profile | Ears — so the
  profile is a room inside the place signed-in users already visit, and the
  header's "My animations" link becomes "My stuff". The registration moment is
  a banner across the top of the page: it never blocks, it never steals focus,
  and it is the same strip whichever tab you're on.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import { X } from "@lucide/svelte";
  import { PRESET_KEYS, PRESETS, avatarOf } from "$lib/profile/PROTOTYPE-avatars";
  import Avatar from "$lib/profile/PROTOTYPE-Avatar.svelte";
  import { proto } from "$lib/profile/PROTOTYPE-profile.svelte";

  let { animations }: { animations: Snippet } = $props();

  const tab = $derived(page.url.searchParams.get("tab") ?? "animations");
  const current = $derived(avatarOf(proto.avatar, proto.userId));

  let registerName = $state("");
  let bannerOpen = $state(false);
  let renaming = $state<string | null>(null);
  let renameValue = $state("");

  const TABS = [
    { key: "animations", label: "Animations" },
    { key: "profile", label: "Profile" },
    { key: "ears", label: "Ears" },
  ];

  function href(key: string) {
    return `${resolve("/my")}?variant=B&tab=${key}`;
  }

  function submitRegister(event: SubmitEvent) {
    event.preventDefault();
    if (!proto.connectedSerial || registerName.trim() === "") return;
    proto.register(proto.connectedSerial, registerName);
    registerName = "";
    bannerOpen = false;
  }

  const fieldClass =
    "rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800";
</script>

<div class="mx-auto max-w-3xl space-y-6 px-4 py-6">
  {#if proto.needsRegistration}
    <div
      class="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950"
    >
      <div class="flex flex-wrap items-center gap-3">
        <p class="flex-1 text-sm text-amber-900 dark:text-amber-200">
          A pair of ears you haven't named is connected.
          <span class="font-mono text-xs">{proto.connectedSerial}</span>
        </p>
        {#if !bannerOpen}
          <button
            onclick={() => (bannerOpen = true)}
            class="rounded-md bg-amber-800 px-3 py-1.5 text-sm text-white dark:bg-amber-300 dark:text-amber-950"
          >
            Name them
          </button>
        {/if}
        <button
          onclick={() => proto.dismiss(proto.connectedSerial!)}
          aria-label="Not now"
          class="rounded p-1 text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900"
        >
          <X class="size-4" aria-hidden="true" />
        </button>
      </div>
      {#if bannerOpen}
        <form class="mt-3 flex flex-wrap items-center gap-2" onsubmit={submitRegister}>
          <!-- svelte-ignore a11y_autofocus -->
          <input
            bind:value={registerName}
            autofocus
            placeholder="Desk ears"
            class="{fieldClass} flex-1"
          />
          <button
            type="submit"
            disabled={registerName.trim() === ""}
            class="rounded-md bg-amber-800 px-3 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-amber-300 dark:text-amber-950"
          >
            Save
          </button>
        </form>
      {/if}
    </div>
  {/if}

  <nav class="flex gap-1 border-b border-gray-200 dark:border-gray-800">
    {#each TABS as item (item.key)}
      <a
        href={href(item.key)}
        class="-mb-px border-b-2 px-3 py-2 text-sm {tab === item.key
          ? 'border-gray-900 font-medium text-gray-900 dark:border-white dark:text-white'
          : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400'}"
      >
        {item.label}
        {#if item.key === "ears"}
          <span class="ml-1 text-xs text-gray-500">{proto.devices.length}</span>
        {/if}
      </a>
    {/each}
  </nav>

  {#if tab === "animations"}
    {@render animations()}
  {:else if tab === "profile"}
    <div class="flex items-center gap-4">
      <Avatar preset={current} size="size-16" />
      <input bind:value={proto.displayName} class="{fieldClass} max-w-xs flex-1" />
    </div>
    <div class="flex flex-wrap gap-2">
      {#each PRESET_KEYS as key (key)}
        <button
          type="button"
          onclick={() => proto.setAvatar(key)}
          aria-pressed={current === key}
          title={PRESETS[key].name}
          class="rounded-full p-0.5 {current === key
            ? 'ring-2 ring-gray-900 dark:ring-white'
            : 'ring-1 ring-gray-200 dark:ring-gray-800'}"
        >
          <Avatar preset={key} size="size-10" />
        </button>
      {/each}
    </div>
    <p class="text-sm text-gray-600 dark:text-gray-400">
      Your name and avatar are public — they show on every animation you share.
    </p>
    <button class="text-sm text-red-600 hover:underline dark:text-red-400">Delete account</button>
  {:else}
    <div class="space-y-3">
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Ears you've named. Private to you — nobody else can see this list.
      </p>

      {#each proto.devices as device (device.serial)}
        <div
          class="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-800"
        >
          <div class="min-w-0 flex-1">
            {#if renaming === device.serial}
              <form
                onsubmit={(e) => {
                  e.preventDefault();
                  proto.rename(device.serial, renameValue);
                  renaming = null;
                }}
              >
                <input bind:value={renameValue} class="{fieldClass} w-full" />
              </form>
            {:else}
              <p class="truncate font-medium text-gray-900 dark:text-white">
                {device.name}
                {#if proto.connectedSerial === device.serial}
                  <span
                    class="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-normal text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    >connected now</span
                  >
                {/if}
              </p>
              <p class="font-mono text-xs text-gray-500">{device.serial}</p>
            {/if}
          </div>
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
      {/each}

      {#if proto.preSerialFirmware}
        <div class="rounded-lg border border-dashed border-gray-300 p-3 dark:border-gray-700">
          <button
            disabled
            class="cursor-not-allowed rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white opacity-40 dark:bg-white dark:text-gray-900"
            >Register connected pair</button
          >
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            The connected ears run firmware from before pairs could identify themselves. Update them
            and you can name them.
          </p>
        </div>
      {:else if proto.connectedSerial && !proto.connectedDevice}
        <form
          class="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-gray-300 p-3 dark:border-gray-700"
          onsubmit={submitRegister}
        >
          <input
            bind:value={registerName}
            placeholder="Name the connected pair"
            class="{fieldClass} flex-1"
          />
          <button
            type="submit"
            disabled={registerName.trim() === ""}
            class="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-gray-900"
            >Register</button
          >
        </form>
      {:else if proto.link === "disconnected"}
        <p
          class="rounded-lg border border-dashed border-gray-300 p-3 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400"
        >
          Connect a pair from the header to add it here.
        </p>
      {/if}
    </div>
  {/if}
</div>
