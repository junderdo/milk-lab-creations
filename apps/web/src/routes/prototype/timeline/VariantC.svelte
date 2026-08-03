<script lang="ts">
	// Variant C — "Step table": numeric-first. Keyframes are rows in a table
	// (time, four angle sliders, ease pickers inline); a compact curve strip on
	// top gives orientation and scrubbing. No canvas dragging at all.
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
	const H = 96;

	const x = (t: number) => (t / proto.viewMs) * w;

	function scrub(e: PointerEvent) {
		const rect = (e.currentTarget as Element).getBoundingClientRect();
		drag(e, (ev) => proto.setPlayhead(((ev.clientX - rect.left) / rect.width) * proto.viewMs));
	}
</script>

<div class="space-y-3">
	<!-- curve strip + transport -->
	<div class="flex items-center gap-3 text-sm">
		<button
			class="rounded-md bg-gray-900 px-3 py-1 text-white dark:bg-white dark:text-gray-900"
			onclick={() => proto.toggle()}>{proto.playing ? 'Pause' : 'Play'}</button
		>
		<span class="tabular-nums text-gray-700 dark:text-gray-300">{fmtMs(proto.playheadMs)}</span>
		<button
			class="rounded-md border border-gray-300 px-2 py-1 text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300"
			disabled={proto.kfs.length >= MAX_KEYFRAMES}
			onclick={() => proto.addAtPlayhead()}>+ row at playhead (sampled pose)</button
		>
		<span class="ml-auto text-xs text-gray-500">{proto.kfs.length}/{MAX_KEYFRAMES} keyframes</span>
	</div>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="relative cursor-ew-resize touch-none overflow-hidden rounded-md bg-gray-50 dark:bg-gray-900/50" style="height:{H}px" bind:clientWidth={w} onpointerdown={scrub}>
		<svg class="absolute inset-0 h-full w-full">
			{#each CHANNELS as chan, ch (chan.key)}
				<path d={channelPath(proto.kfs, ch, proto.viewMs, w, H - 8)} fill="none" stroke={chan.color} stroke-width="1.25" transform="translate(0,4)" />
			{/each}
			{#each proto.kfs as k, i (i)}
				<line x1={x(k.timeMs)} y1="0" x2={x(k.timeMs)} y2={H} class={proto.sel === i ? 'stroke-gray-500' : 'stroke-gray-300 dark:stroke-gray-700'} />
			{/each}
			<line x1={x(proto.playheadMs)} y1="0" x2={x(proto.playheadMs)} y2={H} class="stroke-red-500" stroke-width="1.5" />
		</svg>
	</div>

	<!-- table -->
	<div class="overflow-x-auto">
		<table class="w-full border-collapse text-xs">
			<thead>
				<tr class="text-left text-gray-500">
					<th class="p-1.5">#</th>
					<th class="p-1.5">time ms</th>
					{#each CHANNELS as chan (chan.key)}
						<th class="p-1.5" style="color:{chan.color}">{chan.key}</th>
					{/each}
					<th class="p-1.5">ease out (depart)</th>
					<th class="p-1.5">ease in (arrive)</th>
					<th class="p-1.5"></th>
				</tr>
			</thead>
			<tbody>
				{#each proto.kfs as k, i (i)}
					<tr
						class="border-t border-gray-200 align-middle dark:border-gray-800 {proto.sel === i ? 'bg-gray-100 dark:bg-gray-900' : ''}"
						onclick={() => {
							proto.sel = i;
							proto.setPlayhead(k.timeMs);
						}}
					>
						<td class="p-1.5 text-gray-400">{i + 1}</td>
						<td class="p-1.5">
							<input type="number" class="w-20 rounded border border-gray-300 px-1.5 py-0.5 tabular-nums dark:border-gray-700 dark:bg-gray-900 dark:text-white" value={k.timeMs} onchange={(e) => proto.setTime(i, +e.currentTarget.value)} />
						</td>
						{#each CHANNELS as chan, ch (chan.key)}
							<td class="p-1.5">
								<div class="flex items-center gap-1.5">
									<input type="range" min="0" max="180" class="w-20" style="accent-color:{chan.color}" value={k.angles[ch]} oninput={(e) => proto.setAngle(i, ch, +e.currentTarget.value)} />
									<span class="w-8 tabular-nums text-gray-700 dark:text-gray-300">{k.angles[ch]}°</span>
								</div>
							</td>
						{/each}
						<td class="p-1.5">
							<div class="flex items-center gap-1" class:opacity-40={i === proto.kfs.length - 1}>
								<select class="rounded border border-gray-300 px-1 py-0.5 dark:border-gray-700 dark:bg-gray-900 dark:text-white" disabled={i === proto.kfs.length - 1} value={k.easeOutType} onchange={(e) => proto.setEase(i, { easeOutType: +e.currentTarget.value as EaseType })}>
									{#each EASE_NAMES as name, t (name)}<option value={t}>{name}</option>{/each}
								</select>
								<input type="number" class="w-14 rounded border border-gray-300 px-1 py-0.5 dark:border-gray-700 dark:bg-gray-900 dark:text-white" disabled={i === proto.kfs.length - 1} value={k.easeOutMs} onchange={(e) => proto.setEase(i, { easeOutMs: Math.max(0, +e.currentTarget.value) })} />
							</div>
						</td>
						<td class="p-1.5">
							<div class="flex items-center gap-1" class:opacity-40={i === 0}>
								<select class="rounded border border-gray-300 px-1 py-0.5 dark:border-gray-700 dark:bg-gray-900 dark:text-white" disabled={i === 0} value={k.easeInType} onchange={(e) => proto.setEase(i, { easeInType: +e.currentTarget.value as EaseType })}>
									{#each EASE_NAMES as name, t (name)}<option value={t}>{name}</option>{/each}
								</select>
								<input type="number" class="w-14 rounded border border-gray-300 px-1 py-0.5 dark:border-gray-700 dark:bg-gray-900 dark:text-white" disabled={i === 0} value={k.easeInMs} onchange={(e) => proto.setEase(i, { easeInMs: Math.max(0, +e.currentTarget.value) })} />
							</div>
						</td>
						<td class="p-1.5">
							<button class="text-red-600 hover:underline disabled:opacity-30" disabled={proto.kfs.length <= 1} onclick={(e) => { e.stopPropagation(); proto.remove(i); }}>✕</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="flex gap-4 text-xs tabular-nums text-gray-600 dark:text-gray-400">
		{#each CHANNELS as chan, ch (chan.key)}
			<span><span style="color:{chan.color}">{chan.key}</span> {proto.pose[ch]!.toFixed(0)}°</span>
		{/each}
	</div>
</div>
