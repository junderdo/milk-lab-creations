<!--
  Easing for one keyframe column, anchored beside it.

  Beside, never over: the popover sits 16 px to the right of the column and
  flips to its left near the canvas edge, so the keyframes you are comparing
  stay visible while you A/B ease types. That placement is the one thing the
  prototype changed after first contact with the interaction.

  Ease is a property of the column, so it shapes all four curves of the
  transition at once. The first keyframe's ease-in and the last one's ease-out
  are unused by the firmware — they are shown disabled rather than hidden, so
  the column reads the same everywhere.
-->
<script lang="ts">
  import type { EaseType, Keyframe } from "$lib/animation/interpolator";
  import type { EasePatch } from "$lib/editor/document";

  interface Props {
    keyframe: Keyframe;
    index: number;
    /** Where the column sits on the canvas, in px. */
    columnX: number;
    canvasWidth: number;
    isFirst: boolean;
    isLast: boolean;
    canRemove: boolean;
    onpatch: (patch: EasePatch) => void;
    onremove: () => void;
    onclose: () => void;
  }

  let {
    keyframe,
    index,
    columnX,
    canvasWidth,
    isFirst,
    isLast,
    canRemove,
    onpatch,
    onremove,
    onclose,
  }: Props = $props();

  const WIDTH = 256;
  const GAP = 16;

  const EASE_TYPES: { value: EaseType; label: string }[] = [
    { value: 0, label: "None" },
    { value: 1, label: "Sine" },
    { value: 2, label: "Cubic" },
    { value: 3, label: "Elastic" },
  ];

  const left = $derived(
    columnX + GAP + WIDTH <= canvasWidth ? columnX + GAP : Math.max(columnX - GAP - WIDTH, 4), // no room on the right: flip, but stay on canvas
  );

  const selectedClasses =
    "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900";
  const unselectedClasses = "border-gray-300 text-gray-500 dark:border-gray-700";

  function windowMs(value: string): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
</script>

<div
  class="absolute top-6 z-20 space-y-2 rounded-md border border-gray-300 bg-white p-3 text-xs shadow-lg dark:border-gray-700 dark:bg-gray-950"
  style="left:{left}px; width:{WIDTH}px"
  role="group"
  aria-label="Easing for keyframe {index + 1}"
>
  <div class="flex items-center justify-between">
    <b class="text-gray-900 dark:text-white">Keyframe {index + 1} · {keyframe.timeMs} ms</b>
    <span class="flex items-center gap-2">
      {#if canRemove}
        <button type="button" class="text-red-600 hover:underline" onclick={onremove}>delete</button
        >
      {/if}
      <button type="button" class="text-gray-400" onclick={onclose} aria-label="Close easing">
        ✕
      </button>
    </span>
  </div>

  <div class="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1">
    <span class="text-gray-500">out</span>
    <div class="flex gap-1">
      {#each EASE_TYPES as ease (ease.value)}
        <button
          type="button"
          disabled={isLast}
          title={isLast ? "The last keyframe has nothing to ease out into" : ease.label}
          class="rounded border px-1 py-0.5 disabled:opacity-40 {keyframe.easeOutType === ease.value
            ? selectedClasses
            : unselectedClasses}"
          onclick={() => onpatch({ easeOutType: ease.value })}
        >
          {ease.label}
        </button>
      {/each}
    </div>
    <input
      type="number"
      min="0"
      value={keyframe.easeOutMs}
      disabled={isLast}
      aria-label="Ease-out window in milliseconds"
      class="w-14 rounded border border-gray-300 px-1 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
      onchange={(event) => onpatch({ easeOutMs: windowMs(event.currentTarget.value) })}
    />

    <span class="text-gray-500">in</span>
    <div class="flex gap-1">
      {#each EASE_TYPES as ease (ease.value)}
        <button
          type="button"
          disabled={isFirst}
          title={isFirst ? "The first keyframe is taken up instantly" : ease.label}
          class="rounded border px-1 py-0.5 disabled:opacity-40 {keyframe.easeInType === ease.value
            ? selectedClasses
            : unselectedClasses}"
          onclick={() => onpatch({ easeInType: ease.value })}
        >
          {ease.label}
        </button>
      {/each}
    </div>
    <input
      type="number"
      min="0"
      value={keyframe.easeInMs}
      disabled={isFirst}
      aria-label="Ease-in window in milliseconds"
      class="w-14 rounded border border-gray-300 px-1 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
      onchange={(event) => onpatch({ easeInMs: windowMs(event.currentTarget.value) })}
    />
  </div>

  <p class="text-[10px] leading-snug text-gray-400">
    Ease is per column — it shapes all {keyframe.angles.length} curves of this transition.
  </p>
</div>
