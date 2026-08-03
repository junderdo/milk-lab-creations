<!-- PROTOTYPE — Threlte preview driven by the firmware-faithful interpolator.
     Wayfinder ticket: "Prototype: Threlte preview driven by the interpolator".
     Question: does payload -> interpolator -> Threlte scene hold up (fidelity,
     frame pacing), and are the rig's rotation signs correct? -->
<script lang="ts">
	import Viewer from './Viewer.svelte';
	import { durationMs } from './interpolator';
	import { PAYLOADS } from './payloads';
	import { NODE_NAMES, PlaybackState } from './proto.svelte';

	import { page } from '$app/state';

	const pb = new PlaybackState();
	// seed pose from URL for sharing/screenshots: ?payload=elastic&t=1200
	const qp = page.url.searchParams;
	if (qp.has('payload') && PAYLOADS[qp.get('payload')!]) pb.payloadKey = qp.get('payload')!;
	if (qp.has('t')) pb.t = Number(qp.get('t'));
	const CHANNEL_LABELS = ['L azimuth', 'L latitude', 'R azimuth', 'R latitude'];

	const dur = $derived(durationMs(PAYLOADS[pb.payloadKey].payload));

	function selectPayload(key: string) {
		pb.payloadKey = key;
		pb.t = 0;
	}
</script>

<svelte:head><title>PROTOTYPE: Threlte preview</title></svelte:head>

<div class="flex h-screen flex-col bg-zinc-950 text-zinc-100">
	<header class="flex items-center gap-3 border-b border-zinc-800 px-4 py-2 text-sm">
		<span class="rounded bg-amber-500/20 px-2 py-0.5 font-mono text-xs text-amber-400"
			>PROTOTYPE</span
		>
		<span class="font-medium">Threlte preview × firmware interpolator</span>
		<span class="ml-auto font-mono text-xs text-zinc-400">
			{pb.modelStatus} · {pb.fps} fps · worst frame {pb.worstFrameMs} ms
		</span>
	</header>

	<div class="min-h-0 flex-1"><Viewer {pb} /></div>

	<footer class="space-y-3 border-t border-zinc-800 p-4">
		<!-- transport -->
		<div class="flex items-center gap-3">
			<button
				class="w-20 rounded bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900"
				onclick={() => {
					if (!pb.playing && pb.t >= dur) pb.t = 0;
					pb.playing = !pb.playing;
				}}
			>
				{pb.playing ? 'Pause' : 'Play'}
			</button>
			<input
				type="range"
				class="flex-1"
				min="0"
				max={dur}
				step="1"
				value={pb.t}
				oninput={(e) => {
					pb.playing = false;
					pb.t = Number(e.currentTarget.value);
				}}
			/>
			<span class="w-28 text-right font-mono text-xs text-zinc-400">
				{Math.round(pb.t)} / {dur} ms
			</span>
			<label class="flex items-center gap-1 text-xs text-zinc-400">
				<input type="checkbox" bind:checked={pb.loop} /> loop
			</label>
			<select bind:value={pb.speed} class="rounded bg-zinc-800 px-2 py-1 text-xs">
				<option value={0.25}>0.25×</option>
				<option value={0.5}>0.5×</option>
				<option value={1}>1×</option>
			</select>
		</div>

		<div class="flex flex-wrap items-start gap-6 text-xs">
			<!-- payload picker -->
			<div class="space-y-1">
				<div class="text-zinc-500">Payload</div>
				{#each Object.entries(PAYLOADS) as [key, { label }] (key)}
					<label class="flex items-center gap-2">
						<input
							type="radio"
							name="payload"
							checked={pb.payloadKey === key}
							onchange={() => selectPayload(key)}
						/>
						{label}
					</label>
				{/each}
			</div>

			<!-- live channel readout -->
			<div class="space-y-1">
				<div class="text-zinc-500">Channels (0–180°)</div>
				{#each CHANNEL_LABELS as label, ch (label)}
					<div class="flex items-center gap-2 font-mono">
						<span class="w-20 text-zinc-400">ch{ch} {label}</span>
						<span class="w-12 text-right">{pb.angles[ch].toFixed(1)}°</span>
						<meter class="w-32" min="0" max="180" value={pb.angles[ch]}></meter>
					</div>
				{/each}
			</div>

			<!-- sign flips: THE open question from the glb task -->
			<div class="space-y-1">
				<div class="text-zinc-500">Rotation sign (unvalidated — flip if inverted vs. robot)</div>
				{#each NODE_NAMES as name (name)}
					<label class="flex items-center gap-2 font-mono">
						<input
							type="checkbox"
							checked={pb.signs[name] === -1}
							onchange={() => (pb.signs[name] = pb.signs[name] === 1 ? -1 : 1)}
						/>
						flip {name} <span class="text-zinc-500">({pb.signs[name] > 0 ? '+1' : '−1'})</span>
					</label>
				{/each}
			</div>
		</div>
	</footer>
</div>
