<script lang="ts">
  let { data } = $props();
  const animation = $derived(data.animation);
</script>

<main class="px-4 py-10">
  <div class="mx-auto max-w-3xl space-y-6">
    <header class="space-y-1">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{animation.name}</h1>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        by {animation.owner?.displayName ?? "unknown"} · {animation.robot?.name} ·
        {(animation.durationMs / 1000).toFixed(1)}s · {animation.keyframeCount} keyframes
      </p>
      {#if animation.description}
        <p class="text-sm text-gray-700 dark:text-gray-300">{animation.description}</p>
      {/if}
    </header>

    <section class="space-y-2">
      <h2 class="text-sm font-semibold text-gray-900 dark:text-white">Keyframes</h2>
      <pre
        class="overflow-x-auto rounded-md bg-gray-100 p-4 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">{JSON.stringify(
          animation.payload,
          null,
          2,
        )}</pre>
    </section>
  </div>
</main>
