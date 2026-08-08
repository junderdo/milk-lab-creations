<!--
  PROTOTYPE — THROWAWAY (branch prototype/ring-gizmos). Do not merge to main.
  Floating bottom-centre bar that cycles ?variant= on the current route.
  Dev-only: renders nothing in production builds.
-->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  interface Props {
    variants: { key: string; name: string }[];
  }

  let { variants }: Props = $props();

  const currentKey = $derived(page.url.searchParams.get("variant") ?? variants[0]?.key ?? "A");
  const currentIndex = $derived(
    Math.max(
      0,
      variants.findIndex((v) => v.key === currentKey),
    ),
  );
  const current = $derived(variants[currentIndex]);

  function cycle(step: number) {
    const next = variants[(currentIndex + step + variants.length) % variants.length];
    if (!next) return;
    const url = new URL(page.url);
    url.searchParams.set("variant", next.key);
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- same route, param-only change
    void goto(url, { replaceState: true, keepFocus: true, noScroll: true });
  }

  $effect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return;
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  });
</script>

{#if import.meta.env.DEV && current}
  <div
    class="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-400 bg-gray-900/90 px-3 py-1.5 text-sm text-white shadow-lg"
  >
    <button
      type="button"
      onclick={() => cycle(-1)}
      aria-label="Previous variant"
      class="rounded-full px-2 py-0.5 hover:bg-white/15"
    >
      ←
    </button>
    <span class="font-mono text-amber-300">{current.key}</span>
    <span class="max-w-64 truncate text-gray-300">{current.name}</span>
    <button
      type="button"
      onclick={() => cycle(1)}
      aria-label="Next variant"
      class="rounded-full px-2 py-0.5 hover:bg-white/15"
    >
      →
    </button>
  </div>
{/if}
