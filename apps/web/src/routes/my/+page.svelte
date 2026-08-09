<script lang="ts">
  import { Plus } from "@lucide/svelte";
  import { resolve } from "$app/paths";
  import { listHref } from "$lib/animation/list-href";
  import { isFiltered } from "$lib/animation/list-query";
  import AnimationCard from "$lib/components/animation-card/AnimationCard.svelte";
  import AnimationFilters from "$lib/components/animation-list/AnimationFilters.svelte";
  import ListPagination from "$lib/components/animation-list/ListPagination.svelte";
  import {
    ANIMATION_CAP_MESSAGE,
    ANIMATION_LIMIT,
    atAnimationCap,
    nearAnimationCap,
  } from "$lib/quota";

  let { data } = $props();

  // the list is one filtered page, so the cap counter comes from the quota query
  const owned = $derived(data.quota.count);
  const atCap = $derived(atAnimationCap(owned));

  const hrefForPage = $derived((page: number) => listHref("/my", data.query, { page }));

  const newAnimationClasses =
    "inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200";
</script>

<main class="px-4 py-10">
  <div class="mx-auto max-w-3xl space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">My animations</h1>
      <div class="flex items-center gap-3">
        <span
          class="text-xs tabular-nums"
          class:text-amber-600={nearAnimationCap(owned)}
          class:dark:text-amber-400={nearAnimationCap(owned)}
          class:text-gray-500={!nearAnimationCap(owned)}
          class:dark:text-gray-400={!nearAnimationCap(owned)}
        >
          {owned} / {ANIMATION_LIMIT} animations
        </span>
        <!-- a disabled anchor is not a thing, so at the cap it becomes a
             non-link that says why -->
        {#if atCap}
          <span
            class="{newAnimationClasses} cursor-not-allowed opacity-40"
            title={ANIMATION_CAP_MESSAGE}
            aria-disabled="true"
          >
            <Plus class="h-4 w-4" />
            New animation
          </span>
        {:else}
          <a href={resolve("/animations/new")} class={newAnimationClasses}>
            <Plus class="h-4 w-4" />
            New animation
          </a>
        {/if}
      </div>
    </div>

    {#if atCap}
      <p
        role="status"
        class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
      >
        {ANIMATION_CAP_MESSAGE}
      </p>
    {/if}

    <AnimationFilters query={data.query} robots={data.robots} route="/my" showVisibility />

    {#if data.mine.items.length === 0}
      <p class="text-sm text-gray-600 dark:text-gray-400">
        {#if isFiltered(data.query)}
          No animations match these filters.
        {:else}
          No animations saved yet — start one and it will show up here.
        {/if}
      </p>
    {:else}
      <ul class="divide-y divide-gray-200 dark:divide-gray-800">
        {#each data.mine.items as item (item.id)}
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

      <ListPagination
        page={data.mine.page}
        pageCount={data.mine.pageCount}
        total={data.mine.total}
        {hrefForPage}
      />
    {/if}
  </div>
</main>
