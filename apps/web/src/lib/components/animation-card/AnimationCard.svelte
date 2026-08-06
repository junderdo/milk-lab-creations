<!--
  One animation as a list row — the shape shared by the gallery and /my.

  A card is metadata plus the animation's curves; what differs between the two
  lists is only the byline (owner + robot on the gallery, visibility and remix
  badges on /my), which the caller supplies as a snippet. Deliberately no live
  3D: see AnimationSparkline.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { resolve } from "$app/paths";
  import { keyframesFromPayload } from "$lib/animation/payload";
  import AnimationSparkline from "$lib/components/animation-sparkline/AnimationSparkline.svelte";

  interface Props {
    id: string;
    name: string;
    /** Opaque API JSON; parsed at this boundary, never cast. */
    payload: unknown;
    durationMs: number;
    keyframeCount: number;
    /** Sits beside the name — badges, byline, whatever the list wants. */
    byline?: Snippet;
  }

  let { id, name, payload, durationMs, keyframeCount, byline }: Props = $props();

  const keyframes = $derived(keyframesFromPayload(payload));
</script>

<a
  href={resolve("/animations/[id]", { id })}
  class="group flex items-center justify-between gap-4 py-3"
>
  <div class="min-w-0">
    <span class="font-medium text-gray-900 group-hover:underline dark:text-white">{name}</span>
    {@render byline?.()}
    <span class="mt-1 block text-sm tabular-nums text-gray-600 dark:text-gray-400">
      {(durationMs / 1000).toFixed(1)}s · {keyframeCount} keyframes
    </span>
  </div>
  <!-- Fixed size whether or not there are curves to draw, so rows line up -->
  <div class="h-12 w-28 shrink-0 rounded-md bg-gray-100 px-1 py-1.5 dark:bg-gray-900">
    <AnimationSparkline {keyframes} label="Motion curves for {name}" class="h-full w-full" />
  </div>
</a>
