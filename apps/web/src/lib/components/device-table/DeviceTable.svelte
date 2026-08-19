<!--
  The pairs of ears you have registered, and the two things you can do to one.

  The table says out loud that it is private. Devices are private permanently,
  and a page that shows them should say so rather than leave the reader to
  infer it (`docs/spec/profile-and-devices.md` §8.3).

  A name commits on blur, exactly as the display name above it does — the two
  fields on this page behave the same way and share the decision that says what
  a blur meant.
-->
<script lang="ts">
  import ConfirmDialog from "$lib/components/confirm-dialog/ConfirmDialog.svelte";
  import { forgetDevice, renameDevice, type DeviceActionDeps } from "$lib/devices/actions";
  import { localDismissalStorage } from "$lib/devices/dismissed";
  import { deviceStore, type Device } from "$lib/devices/store.svelte";
  import { calendarDate } from "$lib/format/calendar-date";
  import { commitName } from "$lib/profile/display-name";
  import { trpc } from "$lib/trpc";
  import { NAME_MAX } from "@milklab/api/limits";

  interface Props {
    /** `null` is "we could not find out", which is not an empty list. */
    devices: Device[] | null;
    userId: string;
  }

  let { devices, userId }: Props = $props();

  let editing = $state<string | null>(null);
  let draft = $state("");
  let nameInput = $state<HTMLInputElement | null>(null);
  let cancelling = false;

  let forgetting = $state<Device | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);

  const deps = (): DeviceActionDeps => ({
    api: {
      rename: (input) => trpc().devices.rename.mutate(input),
      forget: (input) => trpc().devices.forget.mutate(input),
    },
    store: deviceStore,
    storage: localDismissalStorage(),
    userId,
  });

  function startEditing(device: Device): void {
    draft = device.name;
    error = null;
    cancelling = false;
    editing = device.serial;
  }

  // the field is entered to change what is in it, so the old name is selected
  // rather than left for the user to clear
  $effect(() => {
    if (editing === null) return;
    nameInput?.focus();
    nameInput?.select();
  });

  async function commit(device: Device): Promise<void> {
    if (cancelling) {
      cancelling = false;
      return;
    }
    const decision = commitName(draft, device.name, "A name for your ears");
    if (decision.kind === "invalid") {
      // the field stays open holding what was typed: closing it would make the
      // fix "type the whole name again", and Escape is still the way out
      error = decision.message;
      return;
    }
    editing = null;
    if (decision.kind === "unchanged") return;
    try {
      await renameDevice(deps(), device.serial, decision.displayName);
      error = null;
    } catch {
      error = "Could not rename those ears. Please try again.";
    }
  }

  function cancelEditing(): void {
    cancelling = true;
    editing = null;
  }

  async function forget(device: Device): Promise<void> {
    busy = true;
    try {
      await forgetDevice(deps(), device.serial);
      error = null;
      forgetting = null;
    } catch {
      forgetting = null;
      error = "Could not forget those ears. Please try again.";
    } finally {
      busy = false;
    }
  }
</script>

<section class="space-y-3 border-t border-gray-200 pt-6 dark:border-gray-800">
  <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
    <h2 class="text-lg font-bold text-gray-900 dark:text-white">Your ears</h2>
    <p class="text-sm text-gray-600 dark:text-gray-400">Only you can see this list.</p>
  </div>

  {#if devices === null}
    <p class="text-sm text-gray-600 dark:text-gray-400">
      We couldn't load your ears just now. Reload the page to try again.
    </p>
  {:else if devices.length === 0}
    <p class="text-sm text-gray-600 dark:text-gray-400">
      No ears registered yet. Connect a pair from the header and you'll be asked to name them.
    </p>
  {:else}
    <div class="overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead class="text-gray-600 dark:text-gray-400">
          <tr class="border-b border-gray-200 dark:border-gray-800">
            <th scope="col" class="py-2 pr-4 font-medium">Name</th>
            <th scope="col" class="py-2 pr-4 font-medium">Serial</th>
            <th scope="col" class="py-2 pr-4 font-medium">Registered</th>
            <th scope="col" class="py-2 text-right font-medium">
              <span class="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {#each devices as device (device.serial)}
            <tr class="border-b border-gray-200 last:border-0 dark:border-gray-800">
              <td class="py-2 pr-4 text-gray-900 dark:text-white">
                {#if editing === device.serial}
                  <input
                    bind:this={nameInput}
                    bind:value={draft}
                    onblur={() => commit(device)}
                    onkeydown={(event) => {
                      if (event.key === "Enter") nameInput?.blur();
                      else if (event.key === "Escape") cancelEditing();
                    }}
                    maxlength={NAME_MAX}
                    aria-label="Name for {device.name}"
                    class="w-full rounded-md border border-gray-300 bg-transparent px-2 py-1 focus:outline-2 focus:outline-gray-900 dark:border-gray-700 dark:focus:outline-white"
                  />
                {:else}
                  {device.name}
                {/if}
              </td>
              <td class="py-2 pr-4 font-mono text-xs text-gray-600 dark:text-gray-400">
                {device.serial}
              </td>
              <td class="py-2 pr-4 text-gray-600 dark:text-gray-400">
                <time datetime={device.createdAt.toISOString()}>
                  {calendarDate(device.createdAt)}
                </time>
              </td>
              <td class="py-2 text-right whitespace-nowrap">
                <button
                  type="button"
                  onclick={() => startEditing(device)}
                  class="rounded-md px-2 py-1 text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onclick={() => (forgetting = device)}
                  class="rounded-md px-2 py-1 text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                >
                  Forget
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <!-- always in the tree, so a failure in an in-place edit is announced rather
       than silently inserted. Empty, it is `sr-only` — out of flow, so it costs
       no gap in the stack. -->
  <p aria-live="polite" class="text-sm text-red-700 dark:text-red-400 {error ? '' : 'sr-only'}">
    {error ?? ""}
  </p>
</section>

{#if forgetting}
  {@const device = forgetting}
  <ConfirmDialog
    title="Forget {device.name}?"
    confirm={{
      label: busy ? "Forgetting…" : "Forget them",
      onclick: () => forget(device),
    }}
    dismiss={{ label: "Keep them", onclick: () => (forgetting = null) }}
  >
    They leave your list and you won't be asked to register them again. Connecting still works, and
    you can register them again from this page.
  </ConfirmDialog>
{/if}
