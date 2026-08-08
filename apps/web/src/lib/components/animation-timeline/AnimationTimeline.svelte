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

  Touch is the same editor, not a lesser one. A coarse pointer gets hit areas
  big enough for a finger, which makes them overlap — so the canvas resolves
  presses itself (`$lib/animation/hit-test`) instead of letting whichever
  element is on top win, and every drag floats a readout above the finger that
  is covering the value.
-->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { styleFor } from "$lib/animation/channels";
  import { hitTest, type HitAreas, type HitCandidates } from "$lib/animation/hit-test";
  import { durationMs, sample, type Keyframe } from "$lib/animation/interpolator";
  import type { ChannelLabel } from "$lib/animation/robots";
  import { angleToY, channelPaths } from "$lib/animation/sparkline";
  import { beginGripDrag, restingViewMs, type GripDrag } from "$lib/animation/view-window";
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
    /**
     * Graph height in px, applied only where the editor is an app shell (`lg`
     * and up) and its divider has a fixed height to split. `null` leaves the
     * responsive default, which is what every other caller wants.
     */
    graphHeight?: number | null;
    onangle: (index: number, channel: number, angle: number) => void;
    ontime: (index: number, timeMs: number) => void;
    onease: (index: number, patch: EasePatch) => void;
    onremove: (index: number) => void;
    onadd: (timeMs: number) => void;
    /** A drag finished: whatever it built up is one undo step. */
    oncommit: () => void;
  }

  let {
    keyframes,
    limits,
    labels,
    playheadMs = $bindable(0),
    selectedIndex = $bindable(null),
    nearCap,
    atCap,
    graphHeight = null,
    onangle,
    ontime,
    onease,
    onremove,
    onadd,
    oncommit,
  }: Props = $props();

  // Both measured: the canvas is sized in CSS (a share of the viewport, so the
  // 3D preview above keeps the rest), and every mapping below reads the result.
  let width = $state(800);
  let height = $state(340);

  /** Room above the plot for the column grips to sit in. */
  const PAD_TOP = 18;
  /** Middle of the drawn grip — where a press is measured from. */
  const GRIP_CENTRE_Y = 8;
  const PAD_BOTTOM = 10;
  const PLOT_HEIGHT = $derived(height - PAD_TOP - PAD_BOTTOM);
  /** Dense enough that a 20 ms elastic wobble is visible at full canvas width. */
  const CURVE_SAMPLES = 240;

  let canvas: HTMLDivElement | undefined = $state();
  let popoverOpen = $state(false);

  /**
   * The two adaptations, each on its own axis: a finger needs bigger targets,
   * a narrow viewport needs the ease controls somewhere other than beside a
   * column. A touch tablet is coarse but wide, and gets exactly one of them.
   */
  let coarse = $state(false);
  let narrow = $state(false);

  onMount(() => {
    const queries = [
      { query: globalThis.matchMedia("(pointer: coarse)"), set: (on: boolean) => (coarse = on) },
      { query: globalThis.matchMedia("(max-width: 40rem)"), set: (on: boolean) => (narrow = on) },
    ];
    const unsubscribes = queries.map(({ query, set }) => {
      set(query.matches);
      const onChange = (event: MediaQueryListEvent) => set(event.matches);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    });
    return () => unsubscribes.forEach((off) => off());
  });

  /** Non-null exactly while a column grip is held. */
  let gripDrag = $state<GripDrag | null>(null);

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
   * little headroom so the last column isn't welded to the right edge — except
   * while a grip is held, when it is whatever that gesture froze. Dragging the
   * last column writes `total`, so a live window here rescales the canvas under
   * the cursor and the grip stops tracking the pointer entirely; see
   * `view-window.ts`.
   */
  const viewMs = $derived(gripDrag?.viewMs ?? restingViewMs(total));

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
   *
   * `onEnd` fires once on release, and only for a real drag. That is the signal
   * undo needs: the editor sees a stream of angles and cannot tell where one
   * gesture stops and the next begins, so the release has to say so.
   *
   * One pointer at a time, by id. A second finger is not a second edit: it
   * neither starts a gesture of its own nor steers or ends the one in progress,
   * which is the difference between an ignored finger and a torn drag.
   */
  let gesturePointerId: number | null = null;

  function drag(
    event: PointerEvent,
    onMove: (event: PointerEvent) => void,
    onEnd?: () => void,
    onTap?: () => void,
  ) {
    const target = event.currentTarget;
    if (gesturePointerId !== null || !(target instanceof Element)) return;
    gesturePointerId = event.pointerId;
    target.setPointerCapture(event.pointerId);

    const originX = event.clientX;
    const originY = event.clientY;
    let dragging = false;

    const move = (moved: Event) => {
      if (!(moved instanceof PointerEvent) || moved.pointerId !== gesturePointerId) return;
      if (
        !dragging &&
        Math.hypot(moved.clientX - originX, moved.clientY - originY) < DRAG_SLOP_PX
      ) {
        return;
      }
      dragging = true;
      onMove(moved);
    };
    const stop = (ended: Event) => {
      if (!(ended instanceof PointerEvent) || ended.pointerId !== gesturePointerId) return;
      gesturePointerId = null;
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", stop);
      target.removeEventListener("pointercancel", stop);
      if (dragging) onEnd?.();
      else onTap?.();
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
    if (gesturePointerId !== null) return;
    pause();
    // the ruler is the one surface where the press itself is the gesture:
    // clicking it means "put the playhead here"
    const toPointer = (moved: PointerEvent) => {
      playheadMs = clampedTime(timeAt(moved.clientX));
      showReadout(moved, formatMs(playheadMs));
    };
    toPointer(event);
    drag(event, toPointer, hideReadout, hideReadout);
  }

  function dragGrip(event: PointerEvent, index: number) {
    event.stopPropagation();
    if (gesturePointerId !== null) return; // an extra finger selects nothing either
    selectedIndex = index;
    // Taken once, before the first move: from here on `timeAt` divides by a
    // window this gesture cannot change, which is what lets the last column be
    // dragged out to lengthen the animation at all.
    gripDrag = beginGripDrag(total, index, keyframes.length, limits.maxTimeMs);
    drag(
      event,
      (moved) => {
        const timeMs = timeAt(moved.clientX);
        ontime(index, timeMs);
        showReadout(moved, `column @ ${formatMs(clampedTime(timeMs))}`);
      },
      hidingReadout(() => {
        gripDrag = null;
        oncommit();
      }),
      // tapped, not dragged: select and show the easing, per the settled model.
      // Tapping another grip while the sheet is open is how it retargets.
      () => {
        hideReadout();
        gripDrag = null;
        popoverOpen = true;
      },
    );
  }

  function dragDot(event: PointerEvent, index: number, channel: number) {
    event.stopPropagation();
    if (gesturePointerId !== null) return;
    selectedIndex = index;
    drag(
      event,
      (moved) => {
        const angle = angleAt(moved.clientY);
        onangle(index, channel, angle);
        showReadout(
          moved,
          `${labels[channel]?.full ?? `Channel ${channel}`} · ${clampedAngle(angle)}°`,
        );
      },
      hidingReadout(oncommit),
      hideReadout,
    );
  }

  // --- Touch ------------------------------------------------------------------

  /** A finger's worth of target, per the 44 px guidance. */
  const TOUCH_RADIUS_PX = 22;
  const TOUCH_GRIP_BAND_PX = 44;

  const TOUCH_HIT_AREAS: HitAreas = {
    radiusPx: TOUCH_RADIUS_PX,
    gripBandBottomPx: TOUCH_GRIP_BAND_PX,
  };

  const candidates = $derived<HitCandidates>({
    grips: keyframes.map((frame, index) => ({ index, x: x(frame.timeMs), y: GRIP_CENTRE_Y })),
    dots: keyframes.flatMap((frame, index) =>
      frame.angles.flatMap((angle, channel) =>
        isVisible(channel) ? [{ index, channel, x: x(frame.timeMs), y: y(angle) }] : [],
      ),
    ),
  });

  /**
   * Every press inside the canvas is an editor gesture, decided here.
   *
   * Only on a coarse pointer: a mouse hits the dot and grip elements directly
   * and precisely, and resolving its clicks by proximity would make a
   * deliberate press on empty canvas grab the nearest dot instead.
   */
  function pressCanvas(event: PointerEvent) {
    if (!coarse) return;
    const rect = canvas?.getBoundingClientRect();
    if (rect === undefined) return;

    const target = hitTest(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      candidates,
      TOUCH_HIT_AREAS,
    );
    if (target.kind === "dot") dragDot(event, target.index, target.channel);
    else if (target.kind === "grip") dragGrip(event, target.index);
    else scrub(event);
  }

  /** Offset above the finger, so the value is not under the thing reading it. */
  const READOUT_LIFT_PX = 44;

  let readout = $state<{ x: number; y: number; text: string } | null>(null);

  function showReadout(event: PointerEvent, text: string) {
    if (!coarse) return;
    const rect = canvas?.getBoundingClientRect();
    if (rect === undefined) return;
    readout = { x: event.clientX - rect.left, y: event.clientY - rect.top - READOUT_LIFT_PX, text };
  }

  const hideReadout = () => (readout = null);

  const hidingReadout = (then: () => void) => () => {
    hideReadout();
    then();
  };

  const clampedAngle = (angle: number) => Math.round(Math.min(Math.max(angle, 0), limits.maxAngle));
  const clampedTime = (timeMs: number) => Math.round(Math.min(Math.max(timeMs, 0), viewMs));

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
  <!-- Two mount points, one body: the chips belong beside the transport where
       there is room for them, and directly under the canvas in the portrait
       stack. Only ever one of the two is displayed. -->
  {#snippet channelChips()}
    {#each labels as label, channel (label.short)}
      <button
        type="button"
        onclick={() => toggleChannel(channel)}
        aria-pressed={isVisible(channel)}
        title="{isVisible(channel) ? 'Hide' : 'Show'} {label.full}"
        class="rounded-full border text-[11px] transition-opacity {coarse
          ? 'min-h-11 px-3'
          : 'px-2 py-0.5'} {styleFor(channel).border} {styleFor(channel).text}"
        class:opacity-30={!isVisible(channel)}
      >
        {label.short}
      </button>
    {/each}
  {/snippet}

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
      <span class="hidden flex-wrap items-center gap-1 sm:flex">
        {@render channelChips()}
      </span>
      <span
        class="ml-2 text-xs tabular-nums"
        class:text-amber-600={nearCap}
        class:dark:text-amber-400={nearCap}
        class:text-gray-500={!nearCap}
        class:dark:text-gray-400={!nearCap}
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
        class="absolute top-0.5 border-l border-gray-300 pl-1 text-[10px] text-gray-500 dark:border-gray-700 dark:text-gray-400"
        style="left:{x(tick)}px">{(tick / 1000).toFixed(tickMs < 1000 ? 2 : 1)}s</span
      >
    {/each}

    <!-- The grabbable end of the playhead. Drawn only: the ruler under it is
         already the scrub surface, so the handle says "drag me" without
         needing a gesture of its own. -->
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-y-0 z-10 -translate-x-1/2"
      style="left:{x(Math.min(playheadMs, viewMs))}px"
    >
      <div
        class="h-full bg-red-500 [clip-path:polygon(0_0,100%_0,100%_55%,50%_100%,0_55%)] {coarse
          ? 'w-4'
          : 'w-2.5'}"
      ></div>
    </div>
  </div>

  <!-- The ease editor is a sibling of the canvas, not a child: `touch-none`
       applies down the whole subtree, so a sheet inside it could not be
       panned. The wrapper is the canvas's own box, so the popover still
       positions against exactly what it did before. -->
  <div class="relative">
    <!-- A no-scroll zone: `touch-none` means every touch that starts here is an
       editor gesture, and the page still scrolls from the chrome around it.
       45dvh with a 240 px floor is the small-screen geometry; above `lg` the
       divider's height wins. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      bind:this={canvas}
      bind:clientWidth={width}
      bind:clientHeight={height}
      onpointerdown={pressCanvas}
      class="relative h-[45dvh] min-h-60 touch-none rounded-b-md bg-gray-50 select-none dark:bg-gray-900/50 {graphHeight ===
      null
        ? 'lg:h-[34dvh] lg:max-h-[340px]'
        : 'lg:h-[var(--graph-height)] lg:min-h-0'}"
      style={graphHeight === null ? undefined : `--graph-height:${graphHeight}px`}
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
          <text x="4" y={y(angle) - 3} class="fill-gray-400 text-[9px] dark:fill-gray-500"
            >{angle}°</text
          >
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
            y2={height}
            class={selectedIndex === index
              ? "stroke-gray-500 dark:stroke-gray-400"
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
          y2={height}
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
            : 'bg-gray-300 dark:bg-gray-700'} {coarse ? 'pointer-events-none' : ''}"
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
              ).border} {coarse ? 'pointer-events-none' : ''}"
              style="left:{x(frame.timeMs)}px; top:{y(angle)}px"
            ></button>
          {/if}
        {/each}
      {/each}

      <!-- Above the finger, because the finger is on top of the value it just
         set. Doubles as the alarm for a wrong grab, which is one undo away. -->
      {#if readout !== null}
        <div
          aria-hidden="true"
          class="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-full rounded-md bg-gray-900 px-2 py-1 text-xs whitespace-nowrap text-white tabular-nums dark:bg-white dark:text-gray-900"
          style="left:{readout.x}px; top:{readout.y}px"
        >
          {readout.text}
        </div>
      {/if}
    </div>

    {#if popoverOpen && selected !== null && selectedIndex !== null}
      <EasePopover
        keyframe={selected}
        index={selectedIndex}
        columnX={x(selected.timeMs)}
        canvasWidth={width}
        presentation={narrow ? "sheet" : "popover"}
        liveSurface={canvas}
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

  <!-- The last band of the portrait stack. Also the precision tool on a coarse
       pointer, since a hidden channel's dots are not hit-tested. -->
  <div class="flex flex-wrap items-center gap-1 sm:hidden">
    {@render channelChips()}
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
