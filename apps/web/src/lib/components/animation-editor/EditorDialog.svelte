<!--
  The editor's blocking dialogs: a draft to restore, a conflicting save, unsaved
  work on the way out. Each is the same shape — a title, a sentence, and exactly
  two choices with no way past them but choosing — so the shape lives here once.
  `confirm` is the emphasised one, which is not always the one that acts.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Choice {
    label: string;
    onclick: () => void;
  }

  interface Props {
    title: string;
    children: Snippet;
    confirm: Choice;
    dismiss: Choice;
  }

  let { title, children, confirm, dismiss }: Props = $props();
  const titleId = $props.id();
</script>

<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
  role="dialog"
  aria-modal="true"
  aria-labelledby={titleId}
>
  <div class="w-full max-w-md space-y-4 rounded-md bg-white p-5 shadow-xl dark:bg-gray-950">
    <h2 id={titleId} class="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
    <p class="text-sm text-gray-600 dark:text-gray-400">{@render children()}</p>
    <div class="flex flex-wrap justify-end gap-3">
      <button
        type="button"
        onclick={dismiss.onclick}
        class="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        {dismiss.label}
      </button>
      <button
        type="button"
        onclick={confirm.onclick}
        class="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
      >
        {confirm.label}
      </button>
    </div>
  </div>
</div>
