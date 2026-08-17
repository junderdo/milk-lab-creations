<!--
  PROTOTYPE — variant A: "Settings page", now with C's identity block.

  The profile is its own page, reached from the user's name in the header, and
  /my stays exactly what it is today. Devices are a table, danger zone last, and
  the registration moment is a modal that interrupts the connect — you named
  your ears or you said no.

  Identity is no longer two labelled form rows. C's header won: the avatar and
  name edit in place at the top of the page — click the avatar for the swatches,
  click the name to type over it — and it doubles as the page's title, so the
  "Profile" heading is gone. Everything below it stays a settings page.

  In the prototype the page is `?variant=A&pane=profile` rather than a real
  route, so the switcher can reach it; read it as `/settings`.
-->
<script lang="ts">
  import { Trash2, Bluetooth, Pencil } from "@lucide/svelte";
  import { PRESET_KEYS, PRESETS, avatarOf } from "$lib/profile/PROTOTYPE-avatars";
  import Avatar from "$lib/profile/PROTOTYPE-Avatar.svelte";
  import { proto } from "$lib/profile/PROTOTYPE-profile.svelte";

  let renaming = $state<string | null>(null);
  let renameValue = $state("");
  let registerName = $state("");
  let dialogDismissed = $state<string | null>(null);
  let pickerOpen = $state(false);
  let editingName = $state(false);

  const showDialog = $derived(proto.needsRegistration && dialogDismissed !== proto.connectedSerial);
  const current = $derived(avatarOf(proto.avatar, proto.userId));

  function submitRegister(event: SubmitEvent) {
    event.preventDefault();
    if (!proto.connectedSerial || registerName.trim() === "") return;
    proto.register(proto.connectedSerial, registerName);
    registerName = "";
  }

  const fieldClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800";
</script>

<div class="mx-auto max-w-3xl space-y-10 px-4 py-10">
  <header class="flex items-center gap-5">
    <button
      type="button"
      onclick={() => (pickerOpen = !pickerOpen)}
      aria-expanded={pickerOpen}
      aria-label="Change avatar"
      class="relative rounded-full ring-1 ring-gray-200 hover:ring-gray-400 dark:ring-gray-800"
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
        Your name and avatar are public — they show on every animation you share.
      </p>
    </div>
  </header>

  {#if pickerOpen}
    <div class="flex flex-wrap gap-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
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
            : 'ring-1 ring-gray-200 hover:ring-gray-400 dark:ring-gray-800'}"
        >
          <Avatar preset={key} size="size-12" />
        </button>
      {/each}
    </div>
  {/if}

  <section class="space-y-3">
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-semibold text-gray-900 dark:text-white">My ears</h2>
      <span class="text-xs text-gray-500">Only you can see this list</span>
    </div>

    {#if proto.devices.length === 0}
      <p class="text-sm text-gray-600 dark:text-gray-400">
        No ears registered yet. Connect a pair from the header and you'll be asked to name them.
      </p>
    {:else}
      <table class="w-full text-left text-sm">
        <thead class="text-xs text-gray-500">
          <tr class="border-b border-gray-200 dark:border-gray-800">
            <th class="py-2 font-medium">Name</th>
            <th class="py-2 font-medium">Serial</th>
            <th class="py-2 font-medium">Registered</th>
            <th class="py-2"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
          {#each proto.devices as device (device.serial)}
            <tr>
              <td class="py-3 pr-3">
                {#if renaming === device.serial}
                  <form
                    onsubmit={(e) => {
                      e.preventDefault();
                      proto.rename(device.serial, renameValue);
                      renaming = null;
                    }}
                  >
                    <input bind:value={renameValue} class={fieldClass} />
                  </form>
                {:else}
                  <span class="font-medium text-gray-900 dark:text-white">{device.name}</span>
                  {#if proto.connectedSerial === device.serial}
                    <span
                      class="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    >
                      connected now
                    </span>
                  {/if}
                {/if}
              </td>
              <td class="py-3 pr-3 font-mono text-xs text-gray-500">{device.serial}</td>
              <td class="py-3 pr-3 text-gray-500">
                {device.registeredAt.toLocaleDateString()}
              </td>
              <td class="py-3 text-right whitespace-nowrap">
                <button
                  class="text-xs text-gray-600 hover:underline dark:text-gray-400"
                  onclick={() => {
                    renaming = device.serial;
                    renameValue = device.name;
                  }}
                >
                  Rename
                </button>
                <button
                  class="ml-3 text-xs text-red-600 hover:underline dark:text-red-400"
                  onclick={() => proto.forget(device.serial)}
                >
                  Forget
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    <!-- The second door: after "Not now", this is where registration is found
         again without reconnecting. -->
    <div class="rounded-md border border-gray-200 p-3 dark:border-gray-800">
      {#if proto.preSerialFirmware}
        <button
          disabled
          class="inline-flex cursor-not-allowed items-center gap-2 rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white opacity-40 dark:bg-white dark:text-gray-900"
        >
          <Bluetooth class="size-4" aria-hidden="true" /> Register the connected pair
        </button>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
          These ears' firmware is too old to tell the app which pair they are. Update them and you
          can name them.
        </p>
      {:else if proto.connectedSerial && !proto.connectedDevice}
        <form class="flex flex-wrap items-center gap-2" onsubmit={submitRegister}>
          <input
            bind:value={registerName}
            placeholder="Name these ears"
            class="{fieldClass} max-w-xs"
          />
          <button
            type="submit"
            disabled={registerName.trim() === ""}
            class="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-gray-900"
          >
            Register
          </button>
          <span class="font-mono text-xs text-gray-500">{proto.connectedSerial}</span>
        </form>
      {:else if proto.connectedDevice}
        <p class="text-sm text-gray-600 dark:text-gray-400">
          The pair you're connected to is already in this list.
        </p>
      {:else}
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Connect a pair from the header to add it here.
        </p>
      {/if}
    </div>
  </section>

  <section class="space-y-3 border-t border-gray-200 pt-6 dark:border-gray-800">
    <h2 class="text-sm font-semibold text-red-700 dark:text-red-400">Delete account</h2>
    <p class="text-sm text-gray-600 dark:text-gray-400">
      Deletes your animations and your list of ears. Cannot be undone.
    </p>
    <button
      class="inline-flex items-center gap-2 rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 dark:border-red-800 dark:text-red-400"
    >
      <Trash2 class="size-4" aria-hidden="true" /> Delete my account
    </button>
  </section>
</div>

{#if showDialog}
  <div class="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
    <div class="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Name these ears</h2>
      <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
        You've connected a pair you haven't named. Naming them is how you'll tell them apart from
        any other pair — every pair advertises itself as "{proto.advertisedName}".
      </p>
      <p class="mt-2 font-mono text-xs text-gray-500">{proto.connectedSerial}</p>
      <form onsubmit={submitRegister}>
        <!-- svelte-ignore a11y_autofocus -->
        <input
          bind:value={registerName}
          autofocus
          placeholder="Desk ears"
          class="{fieldClass} mt-4"
        />
        <div class="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onclick={() => {
              dialogDismissed = proto.connectedSerial;
              proto.dismiss(proto.connectedSerial!);
            }}
            class="rounded-md px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400"
          >
            Not now
          </button>
          <button
            type="submit"
            disabled={registerName.trim() === ""}
            class="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-gray-900"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
