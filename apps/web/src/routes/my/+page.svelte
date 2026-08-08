<script lang="ts">
  import { Plus } from "@lucide/svelte";
  import { resolve } from "$app/paths";
  import AnimationCard from "$lib/components/animation-card/AnimationCard.svelte";

  let { data } = $props();

  const newAnimationClasses =
    "inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200";
</script>

<main class="px-4 py-10">
  <div class="mx-auto max-w-3xl space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">My animations</h1>
      <a href={resolve("/animations/new")} class={newAnimationClasses}>
        <Plus class="h-4 w-4" />
        New animation
      </a>
    </div>

    {#if data.mine.length === 0}
      <p class="text-sm text-gray-600 dark:text-gray-400">
        No animations saved yet — start one and it will show up here.
      </p>
    {:else}
      <ul class="divide-y divide-gray-200 dark:divide-gray-800">
        {#each data.mine as item (item.id)}
          <li>
            <AnimationCard
              id={item.id}
              name={item.name}
              payload={item.payload}
              durationMs={item.durationMs}
              keyframeCount={item.keyframeCount}
            >
              {#snippet byline()}
                <span
                  class="ml-2 rounded-full border border-gray-300 px-2 py-0.5 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-400"
                >
                  {item.visibility}
                </span>
                {#if item.remixedFromId}
                  <span
                    class="ml-1 rounded-full border border-gray-300 px-2 py-0.5 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-400"
                  >
                    remix
                  </span>
                {/if}
              {/snippet}
            </AnimationCard>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</main>
