<script lang="ts">
	// Variant B — "Graph editor": one shared canvas, all four eased curves
	// overlaid on a 0–180° axis. Keyframe columns are vertical grips: drag the
	// top handle to retime the column, drag a channel dot to change its angle.
	// Clicking a handle opens an ease popover anchored to the column.
	import {
		CHANNELS,
		EASE_NAMES,
		MAX_KEYFRAMES,
		drag,
		fmtMs,
		type TimelineProto,
	} from './proto.svelte';
	import { channelPath, type EaseType } from './interpolator';

	let { proto }: { proto: TimelineProto } = $props();

	let w = $state(800);
	const H = 340;
	const PAD_T = 18;

	let visible = $state([true, true, true, true]);
	let popover = $state(false);

	const x = (t: number) => (t / proto.viewMs) * w;
	const y = (a: number) => PAD_T + (1 - a / 180) * (H - PAD_T - 10);

	function scrub(e: PointerEvent) {
		const rect = (e.currentTarget as Element).getBoundingClientRect();
		drag(e, (ev) => proto.setPlayhead(((ev.clientX - rect.left) / rect.width) * proto.viewMs));
	}

	function dragHandle(e: PointerEvent, i: number) {
		e.stopPropagation();
		proto.sel = i;
		popover = true;
		const rect = (e.currentTarget as Element).closest('[data-canvas]')!.getBoundingClientRect();
		drag(e, (ev) => proto.setTime(i, ((ev.clientX - rect.left) / rect.width) * proto.viewMs));
	}

	function dragDot(e: PointerEvent, i: number, ch: number) {
		e.stopPropagation();
		proto.sel = i;
		const rect = (e.currentTarget as Element).closest('[data-canvas]')!.getBoundingClientRect();
		drag(e, (ev) =>
			proto.setAngle(i, ch, (1 - (ev.clientY - rect.top - PAD_T) / (H - PAD_T - 10)) * 180),
		);
	}

	const popX = $derived(
		proto.sel === null ? 0 : Math.min(Math.max(x(proto.kfs[proto.sel]!.timeMs) - 130, 4), w - 264),
	);
</script>

<div class="space-y-2">
	<!-- transport + channel toggles -->
	<div class="flex flex-wrap items-center gap-3 text-sm">
		<button
			class="rounded-md bg-gray-900 px-3 py-1 text-white dark:bg-white dark:text-gray-900"
			onclick={() => proto.toggle()}>{proto.playing ? 'Pause' : 'Play'}</button
		>
		<span class="tabular-nums text-gray-700 dark:text-gray-300">{fmtMs(proto.playheadMs)}</span>
		<button
			class="rounded-md border border-gray-300 px-2 py-1 text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300"
			disabled={proto.kfs.length >= MAX_KEYFRAMES}
			onclick={() => proto.addAtPlayhead()}>+ keyframe</button
		>
		<div class="ml-auto flex gap-1">
			{#each CHANNELS as chan, ch (chan.key)}
				<button
					class="rounded-full border px-2 py-0.5 text-[11px] transition-opacity"
					class:opacity-30={!visible[ch]}
					style="border-color:{chan.color}; color:{chan.color}"
					onclick={() => (visible[ch] = !visible[ch])}>{chan.key}</button
				>
			{/each}
			<span class="ml-2 self-center text-xs text-gray-500">{proto.kfs.length}/{MAX_KEYFRAMES}</span>
		</div>
	</div>

	<!-- ruler -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="relative h-6 cursor-ew-resize touch-none rounded-t-md bg-gray-100 dark:bg-gray-900" onpointerdown={scrub}>
		{#each { length: Math.ceil(proto.viewMs / 500) + 1 } as _, n (n)}
			<span class="absolute top-0.5 border-l border-gray-300 pl-1 text-[10px] text-gray-500 dark:border-gray-700" style="left:{x(n * 500)}px">{(n * 500) / 1000}s</span>
		{/each}
	</div>

	<!-- canvas -->
	<div data-canvas class="relative rounded-b-md bg-gray-50 dark:bg-gray-900/50" bind:clientWidth={w} style="height:{H}px">
		<svg class="absolute inset-0 h-full w-full">
			{#each [0, 45, 90, 135, 180] as a (a)}
				<line x1="0" y1={y(a)} x2={w} y2={y(a)} class="stroke-gray-200 dark:stroke-gray-800" stroke-dasharray={a === 90 ? '0' : '2 5'} />
				<text x="4" y={y(a) - 3} class="fill-gray-400 text-[9px]">{a}°</text>
			{/each}
			{#each CHANNELS as chan, ch (chan.key)}
				{#if visible[ch]}
					<path d={channelPath(proto.kfs, ch, proto.viewMs, w, 1)} fill="none" stroke={chan.color} stroke-width="1.75" transform="translate(0,{y(180)}) scale(1,{H - PAD_T - 10})" vector-effect="non-scaling-stroke" />
				{/if}
			{/each}
			{#each proto.kfs as k, i (i)}
				<line x1={x(k.timeMs)} y1={PAD_T - 6} x2={x(k.timeMs)} y2={H} class={proto.sel === i ? 'stroke-gray-500' : 'stroke-gray-300 dark:stroke-gray-700'} stroke-dasharray={proto.sel === i ? '0' : '3 3'} />
			{/each}
			<line x1={x(proto.playheadMs)} y1="0" x2={x(proto.playheadMs)} y2={H} class="stroke-red-500" />
		</svg>

		{#each proto.kfs as k, i (i)}
			<!-- column grip -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="absolute top-0 h-4 w-6 -translate-x-1/2 cursor-ew-resize touch-none rounded-sm {proto.sel === i ? 'bg-gray-700 dark:bg-gray-300' : 'bg-gray-300 dark:bg-gray-700'}"
				style="left:{x(k.timeMs)}px"
				onpointerdown={(e) => dragHandle(e, i)}
			></div>
			{#each CHANNELS as chan, ch (chan.key)}
				{#if visible[ch]}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize touch-none rounded-full border-2 bg-white dark:bg-gray-950"
						style="left:{x(k.timeMs)}px; top:{y(k.angles[ch]!)}px; border-color:{chan.color}"
						onpointerdown={(e) => dragDot(e, i, ch)}
					></div>
				{/if}
			{/each}
		{/each}

		<!-- ease popover anchored to the selected column -->
		{#if popover && proto.sel !== null && proto.selectedKf}
			{@const k = proto.selectedKf}
			{@const i = proto.sel}
			<div class="absolute top-6 z-20 w-64 space-y-2 rounded-md border border-gray-300 bg-white p-3 text-xs shadow-lg dark:border-gray-700 dark:bg-gray-950" style="left:{popX}px">
				<div class="flex items-center justify-between">
					<b class="text-gray-900 dark:text-white">Keyframe {i + 1} · {k.timeMs}ms</b>
					<span>
						<button class="mr-2 text-red-600 hover:underline" onclick={() => { proto.remove(i); popover = false; }}>delete</button>
						<button class="text-gray-400" onclick={() => (popover = false)}>✕</button>
					</span>
				</div>
				<div class="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1">
					<span class="text-gray-500">out</span>
					<div class="flex gap-1">
						{#each EASE_NAMES as name, t (name)}
							<button class="rounded border px-1 py-0.5 {k.easeOutType === t ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900' : 'border-gray-300 text-gray-500 dark:border-gray-700'}" disabled={i === proto.kfs.length - 1} onclick={() => proto.setEase(i, { easeOutType: t as EaseType })}>{name}</button>
						{/each}
					</div>
					<input type="number" class="w-14 rounded border border-gray-300 px-1 dark:border-gray-700 dark:bg-gray-900 dark:text-white" value={k.easeOutMs} onchange={(e) => proto.setEase(i, { easeOutMs: Math.max(0, +e.currentTarget.value) })} />
					<span class="text-gray-500">in</span>
					<div class="flex gap-1">
						{#each EASE_NAMES as name, t (name)}
							<button class="rounded border px-1 py-0.5 {k.easeInType === t ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900' : 'border-gray-300 text-gray-500 dark:border-gray-700'}" disabled={i === 0} onclick={() => proto.setEase(i, { easeInType: t as EaseType })}>{name}</button>
						{/each}
					</div>
					<input type="number" class="w-14 rounded border border-gray-300 px-1 dark:border-gray-700 dark:bg-gray-900 dark:text-white" value={k.easeInMs} onchange={(e) => proto.setEase(i, { easeInMs: Math.max(0, +e.currentTarget.value) })} />
				</div>
				<p class="text-[10px] leading-snug text-gray-400">Ease is per column — it shapes all four curves of this transition.</p>
			</div>
		{/if}
	</div>

	<!-- live pose readout -->
	<div class="flex gap-4 text-xs tabular-nums text-gray-600 dark:text-gray-400">
		{#each CHANNELS as chan, ch (chan.key)}
			<span><span style="color:{chan.color}">{chan.key}</span> {proto.pose[ch]!.toFixed(0)}°</span>
		{/each}
	</div>
</div>
