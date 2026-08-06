<script lang="ts">
  import AnimationCard from "$lib/components/animation-card/AnimationCard.svelte";

  let { data } = $props();
</script>

<main class="px-4 py-10">
  <div class="mx-auto max-w-3xl space-y-6">
    <header class="space-y-1">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Animation gallery</h1>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Community keyframe animations for Milk Lab robots.
      </p>
    </header>

    {#if data.gallery.items.length === 0}
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Nothing here yet — sign in and publish the first animation.
      </p>
    {:else}
      <ul class="divide-y divide-gray-200 dark:divide-gray-800">
        {#each data.gallery.items as item (item.id)}
          <li>
            <AnimationCard
              id={item.id}
              name={item.name}
              payload={item.payload}
              durationMs={item.durationMs}
              keyframeCount={item.keyframeCount}
            >
              {#snippet byline()}
                <span class="ml-2 text-sm text-gray-600 dark:text-gray-400">
                  by {item.owner?.displayName ?? "unknown"} · {item.robot?.name}
                </span>
              {/snippet}
            </AnimationCard>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</main>
