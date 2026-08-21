<!--
  The one way an animation is deleted: owner-only by construction (the API
  refuses anyone else), confirmed first, and finished on the owner's list,
  which is the page that no longer has it. Any local draft of it goes too —
  wherever the delete was clicked from, a draft of a deleted row could only
  ever bring back a ghost.
-->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { AFTER_DELETE_PATH, DELETE_FAILED_MESSAGE, deletePrompt } from "$lib/editor/deletion";
  import { draftKeyFor, localDraftStorage } from "$lib/editor/draft";
  import { trpc } from "$lib/trpc";
  import ConfirmDialog from "$lib/components/confirm-dialog/ConfirmDialog.svelte";

  interface Props {
    id: string;
    name: string;
    disabled?: boolean;
    /** Runs after the row is gone and before leaving — for a host with state to stand down. */
    ondeleted?: () => void;
  }

  let { id, name, disabled = false, ondeleted }: Props = $props();

  let pending = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);

  export function isOpen(): boolean {
    return pending;
  }

  async function applyDelete() {
    pending = false;
    busy = true;
    error = null;
    try {
      await trpc().animations.delete.mutate({ id });
      localDraftStorage().removeItem(draftKeyFor(id));
      ondeleted?.();
      await goto(resolve(AFTER_DELETE_PATH));
    } catch {
      error = DELETE_FAILED_MESSAGE;
      busy = false;
    }
  }
</script>

<button
  type="button"
  onclick={() => (pending = true)}
  disabled={disabled || busy}
  class="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
>
  {busy ? "Deleting…" : "Delete"}
</button>

{#if error !== null}
  <p class="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>
{/if}

{#if pending}
  {@const prompt = deletePrompt(name)}
  <ConfirmDialog
    title={prompt.title}
    confirm={{ label: prompt.confirmLabel, onclick: () => void applyDelete() }}
    dismiss={{ label: "Cancel", onclick: () => (pending = false) }}
  >
    {prompt.body}
  </ConfirmDialog>
{/if}
