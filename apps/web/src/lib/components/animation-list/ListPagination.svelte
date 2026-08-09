<!--
  Page navigation under an animation list.

  Prev/next are real links so a page is bookmarkable, opens in a new tab, and
  works before hydration; at either end the link becomes plain text rather than
  a dead anchor.
-->
<script lang="ts">
  // The hrefs come from listHref, which resolves the route before appending the
  // list's filter params — something the rule cannot see through.
  /* eslint-disable svelte/no-navigation-without-resolve */
  import { ChevronLeft, ChevronRight } from "@lucide/svelte";

  interface Props {
    page: number;
    pageCount: number;
    /** How many animations match — the filtered total, not the page's length. */
    total: number;
    hrefForPage: (page: number) => string;
  }

  let { page, pageCount, total, hrefForPage }: Props = $props();

  const stepClasses =
    "inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1.5 dark:border-gray-700";
  const linkClasses = `${stepClasses} text-gray-900 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-900`;
  const endClasses = `${stepClasses} text-gray-400 dark:text-gray-600`;
</script>

<nav class="flex items-center justify-between gap-3 text-sm" aria-label="Pagination">
  <p class="tabular-nums text-gray-600 dark:text-gray-400">
    Page {page} of {pageCount} · {total}
    {total === 1 ? "animation" : "animations"}
  </p>
  <div class="flex items-center gap-2">
    {#if page > 1}
      <a href={hrefForPage(page - 1)} class={linkClasses} rel="prev">
        <ChevronLeft class="h-4 w-4" />
        Previous
      </a>
    {:else}
      <span class={endClasses} aria-disabled="true">
        <ChevronLeft class="h-4 w-4" />
        Previous
      </span>
    {/if}
    {#if page < pageCount}
      <a href={hrefForPage(page + 1)} class={linkClasses} rel="next">
        Next
        <ChevronRight class="h-4 w-4" />
      </a>
    {:else}
      <span class={endClasses} aria-disabled="true">
        Next
        <ChevronRight class="h-4 w-4" />
      </span>
    {/if}
  </div>
</nav>
