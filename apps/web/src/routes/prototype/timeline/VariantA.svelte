<script lang="ts">
	// Variant A — "Lanes + Inspector": dope-sheet style. Four stacked lanes show
	// each channel's value curve; keyframes are diamonds. Dragging a diamond
	// moves angle (vertical, this channel) and time (horizontal, whole column).
	// Ease and precise numbers live in a right-hand inspector panel.
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

	let laneW = $state(600);
	const LANE_H = 84;

	const x = (t: number) => (t / proto.viewMs) * laneW;
	const y = (a: number) => LANE_H - 8 - (a / 180) * (LANE_H - 16);

	function scrub(e: PointerEvent) {
		const rect = (e.currentTarget as Element).getBoundingClientRect();
		drag(e, (ev) => proto.setPlayhead(((ev.clientX - rect.left) / rect.width) * proto.viewMs));
	}

	function dragKf(e: PointerEvent, i: number, ch: number) {
		e.stopPropagation();
		proto.sel = i;
		const lane = (e.currentTarget as Element).closest('[data-lane]')!.getBoundingClientRect();
		drag(e, (ev) => {
			proto.setTime(i, ((ev.clientX - lane.left) / lane.width) * proto.viewMs);
			proto.setAngle(i, ch, ((LANE_H - 8 - (ev.clientY - lane.top)) / (LANE_H - 16)) * 180);
		});
	}

	const ticks = $derived.by(() => {
		const step = proto.viewMs > 4000 ? 1000 : 500;
		const out: number[] = [];
		for (let t = 0; t <= proto.viewMs; t += step) out.push(t);
		return out;
	});
</script>

<div class="flex gap-4">
	<div class="min-w-0 flex-1 space-y-2">
		<!-- transport -->
		<div class="flex items-center gap-3 text-sm">
			<button
				class="rounded-md bg-gray-900 px-3 py-1 text-white dark:bg-white dark:text-gray-900"
				onclick={() => proto.toggle()}>{proto.playing ? 'Pause' : 'Play'}</button
			>
			<span class="tabular-nums text-gray-700 dark:text-gray-300">{fmtMs(proto.playheadMs)}</span>
			<button
				class="rounded-md border border-gray-300 px-2 py-1 text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300"
				disabled={proto.kfs.length >= MAX_KEYFRAMES}
				onclick={() => proto.addAtPlayhead()}>+ keyframe at playhead</button
			>
			<span class="ml-auto text-xs text-gray-500">{proto.kfs.length}/{MAX_KEYFRAMES} keyframes</span>
		</div>

		<!-- ruler -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="relative h-7 cursor-ew-resize touch-none rounded-t-md bg-gray-100 dark:bg-gray-900"
			onpointerdown={scrub}
			bind:clientWidth={laneW}
		>
			{#each ticks as t (t)}
				<span
					class="absolute top-1 border-l border-gray-300 pl-1 text-[10px] text-gray-500 dark:border-gray-700"
					style="left:{x(t)}px">{t / 1000}s</span
				>
			{/each}
		</div>

		<!-- lanes -->
		<div class="relative">
			{#each CHANNELS as chan, ch (chan.key)}
				<div
					data-lane
					class="relative border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50"
					style="height:{LANE_H}px"
				>
					<span
						class="pointer-events-none absolute top-1 left-2 z-10 text-[11px] font-semibold"
						style="color:{chan.color}">{chan.key}</span
					>
					<svg class="absolute inset-0 h-full w-full">
						<line x1="0" y1={y(90)} x2={laneW} y2={y(90)} class="stroke-gray-200 dark:stroke-gray-800" stroke-dasharray="2 4" />
						<path d={channelPath(proto.kfs, ch, proto.viewMs, laneW, 1)} fill="none" stroke={chan.color} stroke-opacity="0.5" transform="translate(0,{y(180)}) scale(1,{(LANE_H - 16) / 1})" vector-effect="non-scaling-stroke" stroke-width="1.5" />
						{#each proto.kfs as k, i (i)}
							<line x1={x(k.timeMs)} y1="0" x2={x(k.timeMs)} y2={LANE_H} class={proto.sel === i ? 'stroke-gray-400 dark:stroke-gray-500' : 'stroke-gray-200 dark:stroke-gray-800'} />
						{/each}
					</svg>
					{#each proto.kfs as k, i (i)}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-move touch-none rotate-45 border"
							class:!bg-white={proto.sel === i}
							style="left:{x(k.timeMs)}px; top:{y(k.angles[ch]!)}px; background:{proto.sel === i ? 'white' : chan.color}; border-color:{chan.color}"
							onpointerdown={(e) => dragKf(e, i, ch)}
						></div>
					{/each}
				</div>
			{/each}
			<!-- playhead -->
			<div class="pointer-events-none absolute inset-y-0 w-px bg-red-500" style="left:{x(proto.playheadMs)}px"></div>
		</div>

		<!-- live pose readout -->
		<div class="flex gap-4 text-xs tabular-nums text-gray-600 dark:text-gray-400">
			{#each CHANNELS as chan, ch (chan.key)}
				<span><span style="color:{chan.color}">{chan.key}</span> {proto.pose[ch]!.toFixed(0)}°</span>
			{/each}
		</div>
	</div>

	<!-- inspector -->
	<aside class="w-64 shrink-0 space-y-3 rounded-md border border-gray-200 p-3 text-sm dark:border-gray-800">
		{#if proto.selectedKf && proto.sel !== null}
			{@const k = proto.selectedKf}
			{@const i = proto.sel}
			<div class="flex items-center justify-between">
				<h3 class="font-semibold text-gray-900 dark:text-white">Keyframe {i + 1}</h3>
				<button class="text-xs text-red-600 hover:underline" onclick={() => proto.remove(i)}>delete</button>
			</div>
			<label class="block text-xs text-gray-500"
				>Time (ms)
				<input
					type="number"
					class="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
					value={k.timeMs}
					onchange={(e) => proto.setTime(i, +e.currentTarget.value)}
				/></label
			>
			{#each CHANNELS as chan, ch (chan.key)}
				<label class="flex items-center gap-2 text-xs" style="color:{chan.color}"
					>{chan.key}
					<input
						type="number"
						min="0"
						max="180"
						class="w-16 rounded border border-gray-300 px-2 py-0.5 text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
						value={k.angles[ch]}
						onchange={(e) => proto.setAngle(i, ch, +e.currentTarget.value)}
					/>°</label
				>
			{/each}
			<p class="text-[11px] leading-snug text-gray-400">Ease is shared by the whole column (all 4 channels).</p>
			<fieldset disabled={i === proto.kfs.length - 1} class="space-y-1 disabled:opacity-40">
				<span class="text-xs text-gray-500">Ease out (departing){i === proto.kfs.length - 1 ? ' — unused on last' : ''}</span>
				<div class="flex gap-1">
					{#each EASE_NAMES as name, t (name)}
						<button
							class="rounded border px-1.5 py-0.5 text-[11px] {k.easeOutType === t ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900' : 'border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-400'}"
							onclick={() => proto.setEase(i, { easeOutType: t as EaseType })}>{name}</button
						>
					{/each}
				</div>
				<label class="block text-xs text-gray-500"
					>window (ms)
					<input type="number" min="0" class="mt-0.5 w-24 rounded border border-gray-300 px-2 py-0.5 dark:border-gray-700 dark:bg-gray-900 dark:text-white" value={k.easeOutMs} onchange={(e) => proto.setEase(i, { easeOutMs: Math.max(0, +e.currentTarget.value) })} /></label
				>
			</fieldset>
			<fieldset disabled={i === 0} class="space-y-1 disabled:opacity-40">
				<span class="text-xs text-gray-500">Ease in (arriving){i === 0 ? ' — unused on first' : ''}</span>
				<div class="flex gap-1">
					{#each EASE_NAMES as name, t (name)}
						<button
							class="rounded border px-1.5 py-0.5 text-[11px] {k.easeInType === t ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900' : 'border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-400'}"
							onclick={() => proto.setEase(i, { easeInType: t as EaseType })}>{name}</button
						>
					{/each}
				</div>
				<label class="block text-xs text-gray-500"
					>window (ms)
					<input type="number" min="0" class="mt-0.5 w-24 rounded border border-gray-300 px-2 py-0.5 dark:border-gray-700 dark:bg-gray-900 dark:text-white" value={k.easeInMs} onchange={(e) => proto.setEase(i, { easeInMs: Math.max(0, +e.currentTarget.value) })} /></label
				>
			</fieldset>
		{:else}
			<p class="text-xs text-gray-500">Select a keyframe (click a diamond) to edit time, angles and easing.</p>
		{/if}
	</aside>
</div>
