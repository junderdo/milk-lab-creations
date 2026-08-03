<script lang="ts">
  import { resolve } from "$app/paths";

  let { data } = $props();
</script>

<main class="px-4 py-10">
  <div class="mx-auto max-w-3xl space-y-6">
    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">My animations</h1>

    {#if data.mine.length === 0}
      <p class="text-sm text-gray-600 dark:text-gray-400">No animations saved yet.</p>
    {:else}
      <ul class="divide-y divide-gray-200 dark:divide-gray-800">
        {#each data.mine as item (item.id)}
          <li class="py-3">
            <a
              href={resolve("/animations/[id]", { id: item.id })}
              class="group flex items-baseline justify-between"
            >
              <div>
                <span class="font-medium text-gray-900 group-hover:underline dark:text-white">
                  {item.name}
                </span>
                <span
                  class="ml-2 rounded-full border border-gray-300 px-2 py-0.5 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-400"
                >
                  {item.visibility}
                </span>
              </div>
              <span class="text-sm tabular-nums text-gray-600 dark:text-gray-400">
                {(item.durationMs / 1000).toFixed(1)}s · {item.keyframeCount} keyframes
              </span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</main>
