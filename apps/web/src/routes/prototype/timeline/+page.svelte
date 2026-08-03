<script lang="ts">
	// PROTOTYPE — throwaway route. Three variants of the 4-track timeline
	// editor, switchable via ?variant=, on /prototype/timeline. Not for prod.
	import { dev } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { TimelineProto } from './proto.svelte';
	import VariantA from './VariantA.svelte';
	import VariantB from './VariantB.svelte';
	import VariantC from './VariantC.svelte';

	const VARIANTS = [
		{ key: 'a', name: 'Lanes + Inspector' },
		{ key: 'b', name: 'Graph editor' },
		{ key: 'c', name: 'Step table' },
	];

	const proto = new TimelineProto();

	const current = $derived(page.url.searchParams.get('variant') ?? 'a');
	const idx = $derived(Math.max(0, VARIANTS.findIndex((v) => v.key === current)));

	function cycle(delta: number) {
		const next = VARIANTS[(idx + delta + VARIANTS.length) % VARIANTS.length]!.key;
		goto(`?variant=${next}`, { replaceState: true, keepFocus: true, noScroll: true });
	}

	function onKey(e: KeyboardEvent) {
		const t = e.target as HTMLElement;
		if (t.closest('input, textarea, select, [contenteditable]')) return;
		if (e.key === 'ArrowLeft') cycle(-1);
		if (e.key === 'ArrowRight') cycle(1);
	}
</script>

<svelte:window onkeydown={onKey} />

<main class="px-4 py-8">
	<div class="mx-auto max-w-6xl space-y-4">
		<header>
			<h1 class="text-xl font-bold text-gray-900 dark:text-white">
				Timeline editor prototype <span class="align-middle rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200">THROWAWAY</span>
			</h1>
			<p class="text-sm text-gray-600 dark:text-gray-400">
				robo-cat-ears · 4 channels · a keyframe is one column (shared time + ease across channels)
				· ≤64 keyframes · 0–180° int · ease 0–3 with in/out windows · firmware-faithful curves
			</p>
		</header>

		{#if idx === 0}
			<VariantA {proto} />
		{:else if idx === 1}
			<VariantB {proto} />
		{:else}
			<VariantC {proto} />
		{/if}
	</div>
</main>

{#if dev}
	<div class="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-gray-300 bg-white/95 px-4 py-2 text-sm shadow-lg dark:border-gray-600 dark:bg-gray-900/95">
		<button class="text-gray-700 hover:text-black dark:text-gray-300 dark:hover:text-white" onclick={() => cycle(-1)} aria-label="previous variant">←</button>
		<span class="font-medium text-gray-900 tabular-nums dark:text-white">
			{VARIANTS[idx]!.key.toUpperCase()} — {VARIANTS[idx]!.name}
		</span>
		<button class="text-gray-700 hover:text-black dark:text-gray-300 dark:hover:text-white" onclick={() => cycle(1)} aria-label="next variant">→</button>
	</div>
{/if}
