<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { keyframesFromPayload } from "$lib/animation/payload";
  import { modelUrlFor } from "$lib/animation/robots";
  import { limitsFor } from "$lib/editor/document";
  import { ANIMATION_CAP_MESSAGE, atAnimationCap, isAnimationCapError } from "$lib/quota";
  import { trpc } from "$lib/trpc";
  import AnimationSparkline from "$lib/components/animation-sparkline/AnimationSparkline.svelte";
  import type AnimationViewer from "$lib/components/animation-viewer/AnimationViewer.svelte";
  import RemixAttribution from "$lib/components/remix-attribution/RemixAttribution.svelte";
  // PROTOTYPE — throwaway, spike/connect-upload-ux. Remove with the branch.
  import { page } from "$app/state";
  import PrototypeSwitcher from "$lib/components/PROTOTYPE-switcher/PrototypeSwitcher.svelte";
  import VariantA from "./PROTOTYPE-VariantA.svelte";
  import VariantB from "./PROTOTYPE-VariantB.svelte";
  import VariantC from "./PROTOTYPE-VariantC.svelte";

  let { data } = $props();
  const variant = $derived(page.url.searchParams.get("variant") ?? "A");
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

  // Nothing live to look at yet (or ever) — the curves and a message hold the space.
  const showPlaceholder = $derived(!viewerReady || viewerFailed);

  const placeholderMessage = $derived(
    viewerFailed
      ? "Preview unavailable"
      : !previewable
        ? "No preview for this animation"
        : "Loading preview…",
  );

  let remixing = $state(false);
  let remixError: string | null = $state(null);

  const atCap = $derived(data.quota !== null && atAnimationCap(data.quota.count));

  // Viewable is remixable, but only a robot with a validation profile can be
  // edited — so a fork of one without goes to its own page rather than into an
  // editor that would refuse to open.
  const editable = $derived(limitsFor(animation.robot?.slug) !== undefined);

  // Eager fork: the copy happens server-side on click and we land in the editor
  // on it — remixing is a way of starting to create, not a way of collecting.
  async function remix() {
    remixing = true;
    remixError = null;
    try {
      const fork = await trpc().animations.remix.mutate({ id: animation.id });
      await goto(
        editable
          ? resolve("/animations/[id]/edit", { id: fork.id })
          : resolve("/animations/[id]", { id: fork.id }),
      );
    } catch (thrown) {
      // the cap is a real answer, not a glitch: saying "try again" to a user
      // who is out of room sends them round a loop that cannot end
      remixError = isAnimationCapError(thrown)
        ? ANIMATION_CAP_MESSAGE
        : "Could not remix this animation. Please try again.";
      remixing = false;
    }
  }
</script>

<main class="px-4 py-10">
  <div class="mx-auto max-w-3xl space-y-6">
    <header class="space-y-1">
      <div class="flex items-start justify-between gap-4">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{animation.name}</h1>
        <div class="flex shrink-0 items-center gap-2">
          {#if data.me?.id === animation.ownerId}
            <!-- the way into the editor; non-owners get Remix instead -->
            <a
              href={resolve("/animations/[id]/edit", { id: animation.id })}
              class="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Edit
            </a>
          {/if}
          {#if data.me}
            <button
              type="button"
              onclick={remix}
              disabled={remixing || atCap}
              title={atCap ? ANIMATION_CAP_MESSAGE : undefined}
              class="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
            >
              {remixing ? "Remixing…" : "Remix"}
            </button>
          {/if}
        </div>
      </div>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        by {animation.owner?.displayName ?? "unknown"} · {animation.robot?.name} ·
        {(animation.durationMs / 1000).toFixed(1)}s · {animation.keyframeCount} keyframes
      </p>
      <RemixAttribution provenance={animation} />
      {#if animation.description}
        <p class="text-sm text-gray-700 dark:text-gray-300">{animation.description}</p>
      {/if}
      {#if remixError}
        <p class="text-sm text-red-600 dark:text-red-400" role="alert">{remixError}</p>
      {:else if atCap}
        <!-- the disabled button's tooltip never opens on a touch device, so the
             reason it is disabled is on the page too -->
        <p class="text-sm text-amber-700 dark:text-amber-400">
          {ANIMATION_CAP_MESSAGE}
        </p>
      {/if}
    </header>

    <section>
      <!-- Fixed aspect so the viewer arriving causes no layout shift. Until it
           does, the space is held by the animation's own curves. -->
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
        {#if showPlaceholder}
          <!-- the curves sit behind the message: whenever there's no live frame
               to look at, they're what the space is holding -->
          <AnimationSparkline
            {keyframes}
            label="Motion curves for {animation.name}"
            class="absolute inset-0 h-full w-full p-6 opacity-60"
          />
          <div
            class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500"
          >
            {placeholderMessage}
          </div>
        {/if}
      </div>
    </section>

    <!-- PROTOTYPE — throwaway, spike/connect-upload-ux. All three variants sit
         in the same slot so they are judged against the same page density. -->
    <section class={variant === "C" ? "" : "max-w-xs"}>
      {#if variant === "A"}
        <VariantA {animation} keyframeCount={keyframes.length} />
      {:else if variant === "B"}
        <VariantB {animation} keyframeCount={keyframes.length} />
      {:else}
        <VariantC {animation} keyframeCount={keyframes.length} />
      {/if}
    </section>
  </div>

  <PrototypeSwitcher
    variants={["A", "B", "C"]}
    names={{ A: "Slot grid dialog", B: "Device dock", C: "Inline wizard" }}
  />
</main>
