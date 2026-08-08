<!--
  The one shared 3D viewer: a robot playing an animation.

  The seam is the time source. Left alone it runs its own transport (autoplay,
  loop, play/pause, scrub) — that's the detail page. Bind `currentTimeMs` and
  pass `transport={false}` and the caller owns the playhead instead — that's the
  editor. The scene layer underneath is identical either way, which is the whole
  point of there being one component.

  Import this lazily; it pulls in three.js.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { Canvas } from "@threlte/core";
  import { durationMs, type Keyframe } from "$lib/animation/interpolator";
  import type { ViewerEditing } from "./editing";
  import RobotScene from "./RobotScene.svelte";

  interface Props {
    keyframes: Keyframe[];
    modelUrl: string;
    /** Playhead in ms — bind it to drive the viewer from outside. */
    currentTimeMs?: number;
    /** Built-in play/pause/scrub UI. Off when the caller drives the playhead. */
    transport?: boolean;
    /** Orbit + zoom. */
    interactive?: boolean;
    /** In-3D editing gizmos (spec §3.2). Only the editor passes it. */
    editing?: ViewerEditing;
    onpose?: (angles: number[]) => void;
    /** Fired once the rig has been posed for the first time. */
    onready?: () => void;
    /** The model failed to load — the caller decides what to show instead. */
    onerror?: () => void;
  }

  let {
    keyframes,
    modelUrl,
    currentTimeMs = $bindable(0),
    transport = true,
    interactive = true,
    editing,
    onpose,
    onready,
    onerror,
  }: Props = $props();

  const total = $derived(durationMs(keyframes));

  // prefers-reduced-motion: start paused at the neutral pose rather than
  // autoplaying. The user can still press play — the preference sets the
  // starting state, it doesn't remove the capability.
  const prefersReducedMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Starting state only — the transport controls own it afterwards, so the
  // initial read of `transport` is the intended one.
  let playing = $state(untrack(() => transport) && !prefersReducedMotion);
  // Not conditioned on `transport`: the preference is about motion, not about
  // which control surface is driving. Cleared by the first play or scrub, after
  // which the viewer behaves normally.
  let neutral = $state(prefersReducedMotion);

  function togglePlay() {
    neutral = false;
    if (!playing && currentTimeMs >= total) currentTimeMs = 0; // replay from the top
    playing = !playing;
  }

  function scrubTo(value: string) {
    neutral = false;
    playing = false;
    currentTimeMs = Number(value);
  }

  // A ring drag edits the pose at the playhead, so it ends the reduced-motion
  // neutral hold the same way a play or scrub does — otherwise the document
  // would move while the robot visibly didn't.
  const sceneEditing = $derived(
    editing === undefined
      ? undefined
      : {
          ...editing,
          ondragstart: () => {
            neutral = false;
            editing.ondragstart();
          },
        },
  );
</script>

<div class="flex h-full w-full flex-col">
  <!-- touch-action off while gizmos are live, set here rather than trusting
       OrbitControls' side effect: a ring drag must not become a page scroll -->
  <div class="min-h-0 flex-1 {editing === undefined ? '' : 'touch-none'}">
    <Canvas renderMode="manual">
      {#key modelUrl}
        <RobotScene
          {keyframes}
          {modelUrl}
          bind:currentTimeMs
          {playing}
          loop={transport}
          {neutral}
          {interactive}
          editing={sceneEditing}
          {onpose}
          {onready}
          {onerror}
        />
      {/key}
    </Canvas>
  </div>

  {#if transport}
    <div class="flex items-center gap-3 px-3 py-2">
      <button
        type="button"
        onclick={togglePlay}
        aria-label={playing ? "Pause" : "Play"}
        class="rounded-md bg-gray-900 px-3 py-1 text-sm text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
      >
        {playing ? "Pause" : "Play"}
      </button>
      <input
        type="range"
        min="0"
        max={total}
        step="1"
        value={neutral ? 0 : currentTimeMs}
        oninput={(e) => scrubTo(e.currentTarget.value)}
        aria-label="Scrub animation"
        class="min-w-0 flex-1 accent-gray-900 dark:accent-white"
      />
      <span class="w-16 shrink-0 text-right text-xs tabular-nums text-gray-600 dark:text-gray-400">
        {((neutral ? 0 : currentTimeMs) / 1000).toFixed(1)}s / {(total / 1000).toFixed(1)}s
      </span>
    </div>
  {/if}
</div>
