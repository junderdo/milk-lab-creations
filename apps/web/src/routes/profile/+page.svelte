<!--
  Your account: who you are, and the button that ends it.

  There is no "Profile" heading. The page is reached by pressing your own name
  in the header, and a title above your name and face would only repeat what
  the reader can already see — so the identity block *is* the heading, and the
  name inside it is the h1.
-->
<script lang="ts">
  import { Pencil } from "@lucide/svelte";
  import { invalidateAll } from "$app/navigation";
  import { AVATAR_ART } from "$lib/avatar/art";
  import { AVATAR_PRESETS, avatarOf, type AvatarPreset } from "$lib/avatar/avatar";
  import ConfirmDialog from "$lib/components/confirm-dialog/ConfirmDialog.svelte";
  import { commitDisplayName } from "$lib/profile/display-name";
  import { trpc } from "$lib/trpc";
  import { NAME_MAX } from "@milklab/api/limits";

  let { data } = $props();

  const me = $derived(data.me);
  const preset = $derived(avatarOf(me.avatar, me.id));

  let editingName = $state(false);
  let draft = $state("");
  let nameInput = $state<HTMLInputElement | null>(null);
  let cancelling = false;

  let trayOpen = $state(false);
  let error = $state<string | null>(null);

  let confirmingDelete = $state(false);
  let deleting = $state(false);
  let logoutForm = $state<HTMLFormElement | null>(null);

  function startEditing(): void {
    draft = me.displayName;
    error = null;
    cancelling = false;
    editingName = true;
  }

  // the field is entered to change what is in it, so the old name is selected
  // rather than left for the user to clear
  $effect(() => {
    if (!editingName) return;
    nameInput?.focus();
    nameInput?.select();
  });

  async function commit(): Promise<void> {
    if (cancelling) {
      cancelling = false;
      return;
    }
    const decision = commitDisplayName(draft, me.displayName);
    editingName = false;
    if (decision.kind === "unchanged") return;
    if (decision.kind === "invalid") {
      error = decision.message;
      return;
    }
    try {
      await trpc().users.updateDisplayName.mutate({ displayName: decision.displayName });
      error = null;
      await invalidateAll(); // the header shows this name too
    } catch {
      error = "Could not save your name. Please try again.";
    }
  }

  function cancelEditing(): void {
    cancelling = true;
    editingName = false;
  }

  async function chooseAvatar(chosen: AvatarPreset): Promise<void> {
    trayOpen = false;
    if (chosen === preset && me.avatar) return;
    try {
      await trpc().users.setAvatar.mutate({ preset: chosen });
      error = null;
      await invalidateAll();
    } catch {
      error = "Could not save your avatar. Please try again.";
    }
  }

  async function deleteAccount(): Promise<void> {
    deleting = true;
    try {
      await trpc().users.deleteAccount.mutate();
      // the row is gone but the session is not: signing out is what makes the
      // browser agree, and it lands back on the gallery
      logoutForm?.submit();
    } catch {
      confirmingDelete = false;
      deleting = false;
      error = "Could not delete your account. Please try again.";
    }
  }
</script>

<main class="px-4 py-10">
  <div class="mx-auto max-w-3xl space-y-10">
    <header class="flex items-center gap-4">
      <div class="relative">
        <img src={AVATAR_ART[preset]} alt="" class="size-20 rounded-full" />
        <button
          type="button"
          onclick={() => (trayOpen = !trayOpen)}
          aria-expanded={trayOpen}
          aria-label="Change your avatar"
          class="absolute -right-1 -bottom-1 rounded-full border border-gray-300 bg-white p-1.5 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <Pencil class="size-4" aria-hidden="true" />
        </button>
      </div>

      <h1 class="min-w-0 text-2xl font-bold text-gray-900 dark:text-white">
        {#if editingName}
          <input
            bind:this={nameInput}
            bind:value={draft}
            onblur={commit}
            onkeydown={(event) => {
              if (event.key === "Enter") nameInput?.blur();
              else if (event.key === "Escape") cancelEditing();
            }}
            maxlength={NAME_MAX}
            aria-label="Your display name"
            class="w-full rounded-md border border-gray-300 bg-transparent px-2 py-1 text-2xl font-bold focus:outline-2 focus:outline-gray-900 dark:border-gray-700 dark:focus:outline-white"
          />
        {:else}
          <button
            type="button"
            onclick={startEditing}
            class="block max-w-full truncate rounded-md px-2 py-1 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {me.displayName}
          </button>
        {/if}
      </h1>
    </header>

    {#if trayOpen}
      <div class="flex flex-wrap gap-3" role="group" aria-label="Avatar presets">
        {#each AVATAR_PRESETS as option (option)}
          <button
            type="button"
            onclick={() => chooseAvatar(option)}
            aria-pressed={option === preset}
            aria-label={`Avatar ${option}`}
            class="rounded-full outline-offset-2 {option === preset
              ? 'outline-2 outline-gray-900 dark:outline-white'
              : 'hover:outline-2 hover:outline-gray-300 dark:hover:outline-gray-700'}"
          >
            <img src={AVATAR_ART[option]} alt="" class="size-12 rounded-full" />
          </button>
        {/each}
      </div>
    {/if}

    {#if error}
      <p class="text-sm text-red-700 dark:text-red-400">{error}</p>
    {/if}

    <section class="space-y-2 border-t border-gray-200 pt-6 dark:border-gray-800">
      <h2 class="text-sm font-semibold text-red-700 dark:text-red-400">Danger zone</h2>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Deletes your animations and your list of ears. Cannot be undone.
      </p>
      <button
        type="button"
        onclick={() => (confirmingDelete = true)}
        class="rounded-md border border-red-600 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 dark:border-red-500 dark:text-red-400 dark:hover:bg-red-950"
      >
        Delete account
      </button>
      <form method="POST" action="/auth/logout" bind:this={logoutForm} class="hidden"></form>
    </section>
  </div>
</main>

{#if confirmingDelete}
  <ConfirmDialog
    title="Delete your account?"
    confirm={{ label: deleting ? "Deleting…" : "Delete account", onclick: deleteAccount }}
    dismiss={{ label: "Keep my account", onclick: () => (confirmingDelete = false) }}
  >
    Deletes your animations and your list of ears. Cannot be undone.
  </ConfirmDialog>
{/if}
