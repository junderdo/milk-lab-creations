<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { keyframesFromPayload } from "$lib/animation/payload";
  import { modelUrlFor } from "$lib/animation/robots";
  import { trpc } from "$lib/trpc";
  import type AnimationViewer from "$lib/components/animation-viewer/AnimationViewer.svelte";

  let { data } = $props();
  const animation = $derived(data.animation);
  const keyframes = $derived(keyframesFromPayload(animation.payload));
  const modelUrl = $derived(animation.robot ? modelUrlFor(animation.robot.slug) : null);
  const previewable = $derived(keyframes.length > 0 && modelUrl !== null);

  // The viewer pulls in three.js (~150-200 kB gzip), so it is its own chunk,
  // imported eagerly on mount rather than scroll-gated — it is the page's point.
  let Viewer: typeof AnimationViewer | null = $state(null);
  let viewerReady = $state(false);
  let viewerFailed = $state(false);

  onMount(async () => {
    try {
      const module = await import("$lib/components/animation-viewer/AnimationViewer.svelte");
      Viewer = module.default;
    } catch {
      viewerFailed = true;
    }
  });

  const placeholderMessage = $derived(
    viewerFailed
      ? "Preview unavailable"
      : !previewable
        ? "No preview for this animation"
        : "Loading preview…",
  );

  let remixing = $state(false);
  let remixError: string | null = $state(null);

  // Eager fork: the copy happens server-side on click and we land on the new
  // animation. ("Remix flows into the editor" retargets this to the editor.)
  async function remix() {
    remixing = true;
    remixError = null;
    try {
      const fork = await trpc().animations.remix.mutate({ id: animation.id });
      await goto(resolve("/animations/[id]", { id: fork.id }));
    } catch {
      remixError = "Could not remix this animation. Please try again.";
      remixing = false;
    }
  }
</script>

<main class="px-4 py-10">
  <div class="mx-auto max-w-3xl space-y-6">
    <header class="space-y-1">
      <div class="flex items-start justify-between gap-4">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{animation.name}</h1>
        {#if data.me}
          <button
            type="button"
            onclick={remix}
            disabled={remixing}
            class="shrink-0 rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
          >
            {remixing ? "Remixing…" : "Remix"}
          </button>
        {/if}
      </div>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        by {animation.owner?.displayName ?? "unknown"} · {animation.robot?.name} ·
        {(animation.durationMs / 1000).toFixed(1)}s · {animation.keyframeCount} keyframes
      </p>
      {#if animation.remixedFromId}
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Remixed from
          {#if animation.remixedFrom}
            <a
              href={resolve("/animations/[id]", { id: animation.remixedFrom.id })}
              class="underline">{animation.remixedFrom.name}</a
            >
          {:else}
            <!-- deleted or since made private — deliberately indistinguishable -->
            <span class="italic">an original that is no longer available</span>
          {/if}
        </p>
      {/if}
      {#if animation.description}
        <p class="text-sm text-gray-700 dark:text-gray-300">{animation.description}</p>
      {/if}
      {#if remixError}
        <p class="text-sm text-red-600 dark:text-red-400" role="alert">{remixError}</p>
      {/if}
    </header>

    <section>
      <!-- Fixed aspect so the viewer arriving causes no layout shift. The
           placeholder becomes the animation's sparkline in a later ticket. -->
      <div
        class="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-gray-100 dark:bg-gray-900"
      >
        {#if Viewer && modelUrl && previewable && !viewerFailed}
          <Viewer
            {keyframes}
            {modelUrl}
            onready={() => (viewerReady = true)}
            onerror={() => (viewerFailed = true)}
          />
        {/if}
        {#if !viewerReady || viewerFailed}
          <div
            class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400 dark:text-gray-600"
          >
            {placeholderMessage}
          </div>
        {/if}
      </div>
    </section>
  </div>
</main>
