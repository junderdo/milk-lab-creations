<!--
  The editor's blocking dialogs: a draft to restore, a conflicting save, unsaved
  work on the way out. Each is the same shape — a title, a sentence, and two
  choices with no way past them but choosing — so the shape lives here once.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    title: string;
    children: Snippet;
  }

  let { title, children }: Props = $props();
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
    {@render children()}
  </div>
</div>
