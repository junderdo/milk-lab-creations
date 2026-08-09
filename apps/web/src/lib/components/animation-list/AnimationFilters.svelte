<!--
  The filter and sort bar above an animation list.

  Every control writes the URL rather than local state, so the list a reader is
  looking at is the list they can link to, and the page load is the single
  place that turns a query into results.
-->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { listHref, type ListRoute } from "$lib/animation/list-href";
  import {
    LIST_SORTS,
    listSortOf,
    visibilityFilterOf,
    type ListQuery,
    type ListSort,
  } from "$lib/animation/list-query";
  import { VISIBILITY_OPTIONS } from "$lib/editor/visibility";

  interface Props {
    query: ListQuery;
    robots: readonly { slug: string; name: string }[];
    /** Where the controls navigate — the list's own route. */
    route: ListRoute;
    /** Only `/my` shows unpublished work, so only `/my` can filter by visibility. */
    showVisibility?: boolean;
  }

  let { query, robots, route, showVisibility = false }: Props = $props();

  const SORT_LABELS: Record<ListSort, string> = {
    newest: "Newest first",
    oldest: "Oldest first",
    name: "Name A–Z",
    longest: "Longest first",
  };

  // uncontrolled, read on submit: the box holds what the reader is typing, and
  // the URL re-seeds it whenever navigation changes the applied search
  let searchInput: HTMLInputElement | undefined = $state();

  function apply(changes: Partial<ListQuery>) {
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- listHref resolves the route; the rule can't see through the query string it appends
    void goto(listHref(route, query, changes), { keepFocus: true, noScroll: true });
  }

  const fieldClasses =
    "rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white";
  const labelClasses = "flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400";
</script>

<div class="flex flex-wrap items-end gap-3">
  <form
    class="flex items-center gap-2"
    onsubmit={(event) => {
      event.preventDefault();
      apply({ search: searchInput?.value ?? "" });
    }}
  >
    <label class={labelClasses}>
      <span class="sr-only">Search animations</span>
      <input
        type="search"
        bind:this={searchInput}
        value={query.search}
        placeholder="Search names and descriptions"
        class="{fieldClasses} w-44"
      />
    </label>
    <button type="submit" class="{fieldClasses} hover:bg-gray-100 dark:hover:bg-gray-900">
      Search
    </button>
  </form>

  <label class={labelClasses}>
    Robot
    <select
      class={fieldClasses}
      value={query.robotSlug}
      onchange={(event) => apply({ robotSlug: event.currentTarget.value })}
    >
      <option value="">All robots</option>
      {#each robots as robot (robot.slug)}
        <option value={robot.slug}>{robot.name}</option>
      {/each}
    </select>
  </label>

  {#if showVisibility}
    <label class={labelClasses}>
      Visibility
      <select
        class={fieldClasses}
        value={query.visibility}
        onchange={(event) => apply({ visibility: visibilityFilterOf(event.currentTarget.value) })}
      >
        <option value="">Any visibility</option>
        {#each VISIBILITY_OPTIONS as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </label>
  {/if}

  <label class={labelClasses}>
    Sort
    <select
      class={fieldClasses}
      value={query.sort}
      onchange={(event) => apply({ sort: listSortOf(event.currentTarget.value) })}
    >
      {#each LIST_SORTS as value (value)}
        <option {value}>{SORT_LABELS[value]}</option>
      {/each}
    </select>
  </label>
</div>
