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

  Two presentations, one component: below ~640 px there is no room beside a
  column, so the same controls arrive as a bottom sheet. Deliberately not modal
  — the canvas stays live above it, so an ease change can be felt by scrubbing
  without dismissing anything.
-->
<script lang="ts">
  import type { EaseType, Keyframe } from "$lib/animation/interpolator";
  import type { EasePatch } from "$lib/editor/document";

  interface Props {
    keyframe: Keyframe;
    index: number;
    /** Where the column sits on the canvas, in px. Ignored by the sheet. */
    columnX: number;
    canvasWidth: number;
    presentation: "popover" | "sheet";
    /** Stays interactive under the sheet, and pressing it never dismisses it. */
    liveSurface?: HTMLElement;
    /** Only the curves this robot's firmware understands. */
    easeTypes: EaseType[];
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
    presentation,
    liveSurface,
    easeTypes,
    isFirst,
    isLast,
    canRemove,
    onpatch,
    onremove,
    onclose,
  }: Props = $props();

  const WIDTH = 256;
  const GAP = 16;

  /** Indexed by ease type — the firmware's own numbering. */
  const EASE_LABELS = ["None", "Sine", "Cubic", "Elastic"];

  function labelOf(type: EaseType): string {
    return EASE_LABELS[type] ?? `Type ${type}`;
  }

  const left = $derived(
    columnX + GAP + WIDTH <= canvasWidth ? columnX + GAP : Math.max(columnX - GAP - WIDTH, 4), // no room on the right: flip, but stay on canvas
  );

  const selectedClasses =
    "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900";
  const unselectedClasses = "border-gray-300 text-gray-500 dark:border-gray-700 dark:text-gray-400";

  function windowMs(value: string): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const isSheet = $derived(presentation === "sheet");

  /** Where the slider's range ends, unless a longer window was typed in. */
  const WINDOW_SLIDER_MAX_MS = 2000;

  /** Never below the current value: a slider cannot silently shorten a window. */
  const sliderMax = $derived(Math.max(WINDOW_SLIDER_MAX_MS, keyframe.easeInMs, keyframe.easeOutMs));

  let sheet: HTMLDivElement | undefined = $state();

  /**
   * Outside means outside the sheet *and* outside `liveSurface`: the canvas
   * stays live underneath, so scrubbing to feel an ease change is not a
   * dismissal and tapping another grip retargets rather than closes.
   */
  function pressedAway(event: PointerEvent) {
    if (!isSheet || sheet === undefined) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (sheet.contains(target) || liveSurface?.contains(target) === true) return;
    onclose();
  }

  /** Swipe the handle down to dismiss — the gesture the shape invites. */
  const SWIPE_DISMISS_PX = 40;

  function swipeHandle(event: PointerEvent & { currentTarget: HTMLElement }) {
    const start = event.clientY;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const move = (moved: Event) => {
      if (moved instanceof PointerEvent && moved.clientY - start > SWIPE_DISMISS_PX) {
        stop();
        onclose();
      }
    };
    const stop = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  }
</script>

<svelte:window onpointerdown={pressedAway} />

<div
  bind:this={sheet}
  class={isSheet
    ? // capped and scrollable so a landscape phone can still reach the last
      // control, and so the canvas above is never fully covered
      "fixed inset-x-0 bottom-0 z-20 max-h-[70dvh] space-y-2 overflow-y-auto rounded-t-xl border-t border-gray-300 bg-white p-4 pb-6 text-xs shadow-[0_-4px_24px_rgba(0,0,0,0.18)] dark:border-gray-700 dark:bg-gray-950"
    : "absolute top-6 z-20 space-y-2 rounded-md border border-gray-300 bg-white p-3 text-xs shadow-lg dark:border-gray-700 dark:bg-gray-950"}
  style={isSheet ? undefined : `left:${left}px; width:${WIDTH}px`}
  role="group"
  aria-label="Easing for keyframe {index + 1}"
>
  {#if isSheet}
    <div
      onpointerdown={swipeHandle}
      class="-mt-1 flex touch-none justify-center pb-1"
      aria-hidden="true"
    >
      <span class="h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-700"></span>
    </div>
  {/if}

  <div class="flex items-center justify-between">
    <b class="text-gray-900 dark:text-white">Keyframe {index + 1} · {keyframe.timeMs} ms</b>
    <span class="flex items-center gap-2">
      {#if canRemove}
        <button
          type="button"
          class="text-red-600 hover:underline dark:text-red-400"
          onclick={onremove}>delete</button
        >
      {/if}
      <button
        type="button"
        class="text-gray-400 dark:text-gray-500"
        onclick={onclose}
        aria-label="Close easing"
      >
        ✕
      </button>
    </span>
  </div>

  {#snippet easeRow(
    side: "out" | "in",
    selectedType: EaseType,
    ms: number,
    unusable: boolean,
    why: string,
    patchType: (type: EaseType) => EasePatch,
    patchMs: (value: number) => EasePatch,
  )}
    <span class="text-gray-500 dark:text-gray-400">{side}</span>
    <div class="flex flex-wrap gap-1">
      {#each easeTypes as ease (ease)}
        <button
          type="button"
          disabled={unusable}
          title={unusable ? why : labelOf(ease)}
          class="rounded border px-1 disabled:opacity-40 {isSheet
            ? 'min-h-11 px-3'
            : 'py-0.5'} {selectedType === ease ? selectedClasses : unselectedClasses}"
          onclick={() => onpatch(patchType(ease))}
        >
          {labelOf(ease)}
        </button>
      {/each}
    </div>
    <input
      type="number"
      min="0"
      value={ms}
      disabled={unusable}
      aria-label="Ease-{side} window in milliseconds"
      class="w-14 rounded border border-gray-300 px-1 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-white {isSheet
        ? 'min-h-11 text-center'
        : ''}"
      onchange={(event) => onpatch(patchMs(windowMs(event.currentTarget.value)))}
    />

    <!-- Coarse-thumb control for the same number the field takes typed, since a
         14-px-wide numeric input is not a phone control. -->
    {#if isSheet}
      <input
        type="range"
        min="0"
        max={sliderMax}
        step="10"
        value={ms}
        disabled={unusable}
        aria-label="Ease-{side} window slider"
        class="col-span-3 h-11 w-full touch-none disabled:opacity-40"
        oninput={(event) => onpatch(patchMs(windowMs(event.currentTarget.value)))}
      />
    {/if}
  {/snippet}

  <div class="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1">
    {@render easeRow(
      "out",
      keyframe.easeOutType,
      keyframe.easeOutMs,
      isLast,
      "The last keyframe has nothing to ease out into",
      (type) => ({ easeOutType: type }),
      (value) => ({ easeOutMs: value }),
    )}
    {@render easeRow(
      "in",
      keyframe.easeInType,
      keyframe.easeInMs,
      isFirst,
      "The first keyframe is taken up instantly",
      (type) => ({ easeInType: type }),
      (value) => ({ easeInMs: value }),
    )}
  </div>

  <p class="text-[10px] leading-snug text-gray-400 dark:text-gray-500">
    Ease is per column — it shapes all {keyframe.angles.length} curves of this transition.
  </p>
</div>
