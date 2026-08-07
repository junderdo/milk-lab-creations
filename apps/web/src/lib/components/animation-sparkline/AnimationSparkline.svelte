<!--
  An animation's motion at a glance: all channel curves as inline SVG.

  This is what a card shows instead of a live 3D viewer — a list is precisely
  where you'd exhaust the browser's ~8–16 WebGL contexts, and it would cost
  battery for a thumbnail. The curves come from the same interpolator that poses
  the model (`$lib/animation/sparkline`), so they can't disagree with the motion,
  and they rhyme with the graph editor's identity.

  Cheap and DOM-only: safe to render many of, safe to render during SSR.
-->
<script lang="ts">
  import { styleFor } from "$lib/animation/channels";
  import type { Keyframe } from "$lib/animation/interpolator";
  import { channelPaths } from "$lib/animation/sparkline";

  interface Props {
    keyframes: Keyframe[];
    /** Extra classes for the svg — sizing is the caller's job. */
    class?: string;
    /** Announce the curves; without one they're decorative and hidden. */
    label?: string;
  }

  let { keyframes, class: className = "", label }: Props = $props();

  // Path coordinates are unitless: the viewBox is stretched to whatever box the
  // caller sizes us into, and non-scaling strokes keep the lines even after it.
  const BOX = { width: 100, height: 100 };

  const paths = $derived(channelPaths(keyframes, BOX));
</script>

{#if paths.length > 0}
  <svg
    viewBox="0 0 {BOX.width} {BOX.height}"
    preserveAspectRatio="none"
    role={label ? "img" : "presentation"}
    aria-label={label}
    aria-hidden={label ? undefined : "true"}
    class={className}
  >
    {#each paths as d, channel (channel)}
      <path
        {d}
        fill="none"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
        class={styleFor(channel).stroke}
      />
    {/each}
  </svg>
{/if}
