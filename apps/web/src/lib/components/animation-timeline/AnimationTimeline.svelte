<!--
  The graph timeline: every channel's curve on one 0–180° axis, with the
  keyframes drawn as columns through them.

  Settled as Variant B on `prototype/timeline-editor-ux` and promoted here. The
  model in one line: a keyframe is a column (one time, one ease, four angles),
  so dragging a dot changes an angle and dragging the grip at the top retimes
  the whole column — clamped between its neighbours, which is why the order can
  never invert. The curves come from `channelPaths`, i.e. from the interpolator
  that poses the 3D model, so the shape on screen is the shape the robot moves in
  — including the midpoint hold and elastic overshoot.

  This component owns no document state. It reports edits and lets the editor
  decide; that is what keeps undo, drafts and dirty tracking in one testable
  place instead of scattered through pointer handlers.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { styleFor } from "$lib/animation/channels";
  import { durationMs, sample, type Keyframe } from "$lib/animation/interpolator";
  import type { ChannelLabel } from "$lib/animation/robots";
  import { angleToY, channelPaths } from "$lib/animation/sparkline";
  import { easeTypesFor, type EasePatch, type RobotLimits } from "$lib/editor/document";
  import EasePopover from "./EasePopover.svelte";

  interface Props {
    keyframes: Keyframe[];
    limits: RobotLimits;
    labels: ChannelLabel[];
    playheadMs: number;
    selectedIndex: number | null;
    /** Live counter in the chrome — amber as the robot's ceiling approaches. */
    nearCap: boolean;
    atCap: boolean;
    onangle: (index: number, channel: number, angle: number) => void;
    ontime: (index: number, timeMs: number) => void;
    onease: (index: number, patch: EasePatch) => void;
    onremove: (index: number) => void;
    onadd: (timeMs: number) => void;
  }

  let {
    keyframes,
    limits,
    labels,
    playheadMs = $bindable(0),
    selectedIndex = $bindable(null),
    nearCap,
    atCap,
    onangle,
    ontime,
    onease,
    onremove,
    onadd,
  }: Props = $props();

  const HEIGHT = 340;
  /** Room above the plot for the column grips to sit in. */
  const PAD_TOP = 18;
  const PAD_BOTTOM = 10;
  const PLOT_HEIGHT = HEIGHT - PAD_TOP - PAD_BOTTOM;
  /** Dense enough that a 20 ms elastic wobble is visible at full canvas width. */
  const CURVE_SAMPLES = 240;

  let width = $state(800);
  let canvas: HTMLDivElement | undefined = $state();
  let popoverOpen = $state(false);

  /**
   * Channels are shown unless hidden — tracked as the hidden set rather than a
   * boolean per channel so it needs no initialising from `labels`, and so a
   * robot with a different channel count can't leave a stale flag behind.
   */
  let hidden = $state<number[]>([]);
  const isVisible = (channel: number) => !hidden.includes(channel);

  function toggleChannel(channel: number) {
    hidden = isVisible(channel) ? [...hidden, channel] : hidden.filter((c) => c !== channel);
  }

  const total = $derived(durationMs(keyframes));
  /**
   * The window drawn, always the whole animation (there is no zoom) plus a
   * little headroom so the last column isn't welded to the right edge.
   */
  const viewMs = $derived(Math.max(total, 500) * 1.06);

  const paths = $derived(
    channelPaths(
      keyframes,
      { width, height: PLOT_HEIGHT },
      { overMs: viewMs, samples: CURVE_SAMPLES, maxAngle: limits.maxAngle },
    ),
  );
  const pose = $derived(keyframes.length > 0 ? sample(keyframes, playheadMs) : []);
  const selected = $derived(selectedIndex === null ? null : (keyframes[selectedIndex] ?? null));

  const x = (timeMs: number) => (timeMs / viewMs) * width;
  // the same mapping the curves are drawn with, offset by the grip strip, so a
  // dot always sits on its own line rather than beside it
  const y = (angle: number) => PAD_TOP + angleToY(angle, PLOT_HEIGHT, limits.maxAngle);

  /** Gridlines every quarter of the range: 0, 45, 90, 135, 180 for this rig. */
  const gridAngles = $derived([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * limits.maxAngle)));

  /** ~8 labelled ticks, on a round number of milliseconds. */
  const tickMs = $derived.by(() => {
    const rough = viewMs / 8;
    const steps = [50, 100, 250, 500, 1000, 2000, 5000, 10_000];
    return steps.find((step) => step >= rough) ?? 10_000;
  });
  const ticks = $derived(
    Array.from({ length: Math.floor(viewMs / tickMs) + 1 }, (_unused, n) => n * tickMs),
  );

  function timeAt(clientX: number): number {
    const rect = canvas?.getBoundingClientRect();
    if (rect === undefined || rect.width === 0) return 0;
    return ((clientX - rect.left) / rect.width) * viewMs;
  }

  function angleAt(clientY: number): number {
    const rect = canvas?.getBoundingClientRect();
    if (rect === undefined) return 0;
    return (1 - (clientY - rect.top - PAD_TOP) / PLOT_HEIGHT) * limits.maxAngle; // inverse of y()
  }

  /** Below this, a pointer that moved was a click with a shaky hand. */
  const DRAG_SLOP_PX = 3;

  /**
   * Track one pointer until it is released, telling a drag from a click.
   *
   * `onMove` fires only once the pointer has travelled past the slop, and
   * `onTap` only if it never did. That distinction is the whole reason this
   * helper exists: pressing a grip must select the column and open its easing
   * without retiming it, and pressing a dot must not nudge an angle. Applying
   * the press position immediately — as the prototype did — turns every
   * selection click into an edit, and an edit into unsaved changes.
   *
   * Capture means a drag keeps following the pointer once it leaves the small
   * dot it started on — without it, a fast drag drops the moment the cursor
   * outruns the target.
   */
  function drag(event: PointerEvent, onMove: (event: PointerEvent) => void, onTap?: () => void) {
    const target = event.currentTarget;
    if (!(target instanceof Element)) return;
    target.setPointerCapture(event.pointerId);

    const originX = event.clientX;
    const originY = event.clientY;
    let dragging = false;

    const move = (moved: Event) => {
      if (!(moved instanceof PointerEvent)) return;
      if (
        !dragging &&
        Math.hypot(moved.clientX - originX, moved.clientY - originY) < DRAG_SLOP_PX
      ) {
        return;
      }
      dragging = true;
      onMove(moved);
    };
    const stop = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", stop);
      target.removeEventListener("pointercancel", stop);
      if (!dragging) onTap?.();
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", stop);
    target.addEventListener("pointercancel", stop);
  }

  /**
   * Playback loops the animation, wall-clock driven.
   *
   * The playhead is the shared time source — the 3D preview is bound to it — so
   * pressing play here moves the robot, and scrubbing the ruler poses it. There
   * is one clock in the editor, and this is it.
   */
  let playing = $state(false);
  let frameHandle = 0;

  function pause() {
    playing = false;
    cancelAnimationFrame(frameHandle);
  }

  function play() {
    if (playing) return;
    playing = true;
    let previous = performance.now();
    const step = (now: number) => {
      if (!playing) return;
      const next = playheadMs + (now - previous);
      previous = now;
      playheadMs = next > total ? 0 : next;
      frameHandle = requestAnimationFrame(step);
    };
    frameHandle = requestAnimationFrame(step);
  }

  onDestroy(pause);

  function scrub(event: PointerEvent) {
    pause();
    // the ruler is the one surface where the press itself is the gesture:
    // clicking it means "put the playhead here"
    const toPointer = (moved: PointerEvent) => {
      playheadMs = Math.round(Math.min(Math.max(timeAt(moved.clientX), 0), viewMs));
    };
    toPointer(event);
    drag(event, toPointer);
  }

  function dragGrip(event: PointerEvent, index: number) {
    event.stopPropagation();
    selectedIndex = index;
    drag(
      event,
      (moved) => ontime(index, timeAt(moved.clientX)),
      // clicked, not dragged: select and show the easing, per the settled model
      () => (popoverOpen = true),
    );
  }

  function dragDot(event: PointerEvent, index: number, channel: number) {
    event.stopPropagation();
    selectedIndex = index;
    drag(event, (moved) => onangle(index, channel, angleAt(moved.clientY)));
  }

  function easeFor(patch: EasePatch) {
    if (selectedIndex !== null) onease(selectedIndex, patch);
  }

  function removeSelected() {
    if (selectedIndex === null) return;
    onremove(selectedIndex);
    popoverOpen = false;
    selectedIndex = null;
  }

  const capTooltip = $derived(`This robot supports up to ${limits.maxKeyframes} keyframes`);

  function formatMs(ms: number): string {
    return `${(ms / 1000).toFixed(2)}s`;
  }
</script>

<div class="space-y-2">
  <div class="flex flex-wrap items-center gap-3 text-sm">
    <button
      type="button"
      onclick={() => (playing ? pause() : play())}
      class="rounded-md bg-gray-900 px-3 py-1 text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
    >
      {playing ? "Pause" : "Play"}
    </button>
    <button
      type="button"
      onclick={() => onadd(playheadMs)}
      disabled={atCap}
      title={atCap ? capTooltip : "Insert a keyframe holding the pose at the playhead"}
      class="rounded-md border border-gray-300 px-2 py-1 text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
    >
      + keyframe
    </button>
    <span class="tabular-nums text-gray-700 dark:text-gray-300">{formatMs(playheadMs)}</span>

    <div class="ml-auto flex flex-wrap items-center gap-1">
      {#each labels as label, channel (label.short)}
        <button
          type="button"
          onclick={() => toggleChannel(channel)}
          aria-pressed={isVisible(channel)}
          title="{isVisible(channel) ? 'Hide' : 'Show'} {label.full}"
          class="rounded-full border px-2 py-0.5 text-[11px] transition-opacity {styleFor(channel)
            .border} {styleFor(channel).text}"
          class:opacity-30={!isVisible(channel)}
        >
          {label.short}
        </button>
      {/each}
      <span
        class="ml-2 text-xs tabular-nums"
        class:text-amber-600={nearCap}
        class:dark:text-amber-400={nearCap}
        class:text-gray-500={!nearCap}
        title={atCap ? capTooltip : undefined}
      >
        {keyframes.length} / {limits.maxKeyframes} keyframes
      </span>
    </div>
  </div>

  <!-- Ruler: the scrub surface. svelte-ignore because the strip is a pointer
       affordance for the playhead, which the transport also exposes as buttons. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="relative h-6 cursor-ew-resize touch-none rounded-t-md bg-gray-100 select-none dark:bg-gray-900"
    onpointerdown={scrub}
  >
    {#each ticks as tick (tick)}
      <span
        class="absolute top-0.5 border-l border-gray-300 pl-1 text-[10px] text-gray-500 dark:border-gray-700"
        style="left:{x(tick)}px">{(tick / 1000).toFixed(tickMs < 1000 ? 2 : 1)}s</span
      >
    {/each}
  </div>

  <div
    bind:this={canvas}
    bind:clientWidth={width}
    class="relative touch-none rounded-b-md bg-gray-50 select-none dark:bg-gray-900/50"
    style="height:{HEIGHT}px"
  >
    <svg class="absolute inset-0 h-full w-full" aria-hidden="true">
      {#each gridAngles as angle (angle)}
        <line
          x1="0"
          y1={y(angle)}
          x2={width}
          y2={y(angle)}
          class="stroke-gray-200 dark:stroke-gray-800"
          stroke-dasharray={angle * 2 === limits.maxAngle ? "0" : "2 5"}
        />
        <text x="4" y={y(angle) - 3} class="fill-gray-400 text-[9px]">{angle}°</text>
      {/each}

      <g transform="translate(0,{PAD_TOP})">
        {#each paths as d, channel (channel)}
          {#if isVisible(channel)}
            <path
              {d}
              fill="none"
              stroke-width="1.75"
              stroke-linejoin="round"
              vector-effect="non-scaling-stroke"
              class={styleFor(channel).stroke}
            />
          {/if}
        {/each}
      </g>

      {#each keyframes as frame, index (index)}
        <line
          x1={x(frame.timeMs)}
          y1={PAD_TOP - 6}
          x2={x(frame.timeMs)}
          y2={HEIGHT}
          class={selectedIndex === index
            ? "stroke-gray-500"
            : "stroke-gray-300 dark:stroke-gray-700"}
          stroke-dasharray={selectedIndex === index ? "0" : "3 3"}
        />
      {/each}

      <!-- clamped to the window: deleting the last column shortens the
           animation under a playhead that was past it, and a line drawn off
           the canvas edge reads as no playhead at all -->
      <line
        x1={x(Math.min(playheadMs, viewMs))}
        y1="0"
        x2={x(Math.min(playheadMs, viewMs))}
        y2={HEIGHT}
        class="stroke-red-500"
      />
    </svg>

    {#each keyframes as frame, index (index)}
      <button
        type="button"
        onpointerdown={(event) => dragGrip(event, index)}
        aria-label="Keyframe {index + 1} at {frame.timeMs} ms — drag to retime, click for easing"
        class="absolute top-0 h-4 w-6 -translate-x-1/2 cursor-ew-resize touch-none rounded-sm {selectedIndex ===
        index
          ? 'bg-gray-700 dark:bg-gray-300'
          : 'bg-gray-300 dark:bg-gray-700'}"
        style="left:{x(frame.timeMs)}px"
      ></button>

      {#each labels as label, channel (label.short)}
        {@const angle = frame.angles[channel]}
        {#if isVisible(channel) && angle !== undefined}
          <button
            type="button"
            onpointerdown={(event) => dragDot(event, index, channel)}
            aria-label="{label.full} at keyframe {index + 1}: {angle}° — drag to change"
            class="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize touch-none rounded-full border-2 bg-white dark:bg-gray-950 {styleFor(
              channel,
            ).border}"
            style="left:{x(frame.timeMs)}px; top:{y(angle)}px"
          ></button>
        {/if}
      {/each}
    {/each}

    {#if popoverOpen && selected !== null && selectedIndex !== null}
      <EasePopover
        keyframe={selected}
        index={selectedIndex}
        columnX={x(selected.timeMs)}
        canvasWidth={width}
        easeTypes={easeTypesFor(limits)}
        isFirst={selectedIndex === 0}
        isLast={selectedIndex === keyframes.length - 1}
        canRemove={keyframes.length > 1}
        onpatch={easeFor}
        onremove={removeSelected}
        onclose={() => (popoverOpen = false)}
      />
    {/if}
  </div>

  <div class="flex flex-wrap gap-4 text-xs tabular-nums text-gray-600 dark:text-gray-400">
    {#each labels as label, channel (label.short)}
      {@const angle = pose[channel]}
      {#if angle !== undefined}
        <span>
          <span class={styleFor(channel).text}>{label.short}</span>
          {angle.toFixed(0)}°
        </span>
      {/if}
    {/each}
  </div>
</div>
