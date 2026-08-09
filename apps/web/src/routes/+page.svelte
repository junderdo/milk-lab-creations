<script lang="ts">
  import { listHref } from "$lib/animation/list-href";
  import { isFiltered } from "$lib/animation/list-query";
  import AnimationCard from "$lib/components/animation-card/AnimationCard.svelte";
  import AnimationFilters from "$lib/components/animation-list/AnimationFilters.svelte";
  import ListPagination from "$lib/components/animation-list/ListPagination.svelte";

  let { data } = $props();

  const hrefForPage = $derived((page: number) => listHref("/", data.query, { page }));
</script>

<main class="px-4 py-10">
  <div class="mx-auto max-w-3xl space-y-6">
    <header class="space-y-1">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Animation gallery</h1>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Community keyframe animations for Milk Lab robots.
      </p>
    </header>

    <AnimationFilters query={data.query} robots={data.robots} route="/" />

    {#if data.gallery.items.length === 0}
      <p class="text-sm text-gray-600 dark:text-gray-400">
        {#if isFiltered(data.query)}
          No animations match these filters.
        {:else}
          Nothing here yet — sign in and publish the first animation.
        {/if}
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

    <!-- also under an empty page: with filters on, the count is the answer -->
    {#if data.gallery.total > 0 || isFiltered(data.query)}
      <ListPagination
        page={data.gallery.page}
        pageCount={data.gallery.pageCount}
        total={data.gallery.total}
        {hrefForPage}
      />
    {/if}
  </div>
</main>
