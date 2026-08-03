<!-- PROTOTYPE — Threlte scene: loads the rigged glb and drives its pivot nodes
     from the firmware-faithful interpolator every frame. -->
<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import { OrbitControls, useGltf } from '@threlte/extras';
	import * as THREE from 'three';
	import { sample, durationMs } from './interpolator';
	import { PAYLOADS } from './payloads';
	import { NODE_NAMES, type NodeName, type PlaybackState } from './proto.svelte';

	let { pb }: { pb: PlaybackState } = $props();

	const gltf = useGltf('/models/robo-cat-ears.glb');

	// channel -> { node, axis } resolved once from glTF extras (three.js userData)
	type Pivot = { node: THREE.Object3D; axis: THREE.Vector3; name: NodeName };
	let pivots: Pivot[] | null = null;
	let center = $state<[number, number, number]>([0, 0.05, 0]);

	$effect(() => {
		if (!$gltf || pivots) return;
		const found: Pivot[] = [];
		for (const name of NODE_NAMES) {
			const node = $gltf.scene.getObjectByName(name);
			if (!node || node.userData.axis == null) continue;
			found[node.userData.channel as number] = {
				node,
				axis: new THREE.Vector3(...(node.userData.axis as [number, number, number])),
				name
			};
		}
		pivots = found;
		const box = new THREE.Box3().setFromObject($gltf.scene);
		const c = box.getCenter(new THREE.Vector3());
		center = [c.x, c.y, c.z];
		pb.modelStatus =
			found.filter(Boolean).length === 4
				? `loaded — 4 pivot nodes resolved`
				: `PROBLEM: only ${found.filter(Boolean).length}/4 pivot nodes found`;
	});

	// fps instrumentation: EMA + worst frame over a rolling 1s window
	let fpsEma = 0;
	let windowWorst = 0;
	let windowElapsed = 0;

	useTask((delta) => {
		const payload = PAYLOADS[pb.payloadKey].payload;
		const dur = durationMs(payload);

		if (pb.playing) {
			pb.t += delta * 1000 * pb.speed;
			if (pb.t >= dur) {
				if (pb.loop) pb.t = dur > 0 ? pb.t % dur : 0;
				else {
					pb.t = dur;
					pb.playing = false;
				}
			}
		}

		const angles = sample(payload.keyframes, pb.t);
		pb.angles = angles;

		if (pivots) {
			for (let ch = 0; ch < 4; ch++) {
				const p = pivots[ch];
				if (!p) continue;
				p.node.quaternion.setFromAxisAngle(
					p.axis,
					THREE.MathUtils.degToRad(angles[ch] - 90) * pb.signs[p.name]
				);
			}
		}

		fpsEma = fpsEma === 0 ? 1 / delta : fpsEma * 0.95 + (1 / delta) * 0.05;
		windowWorst = Math.max(windowWorst, delta * 1000);
		windowElapsed += delta;
		if (windowElapsed >= 1) {
			pb.fps = Math.round(fpsEma);
			pb.worstFrameMs = Math.round(windowWorst * 10) / 10;
			windowWorst = 0;
			windowElapsed = 0;
		}
	});
</script>

<T.PerspectiveCamera makeDefault position={[0.25, 0.18, 0.3]} fov={40}>
	<OrbitControls target={center} enableDamping />
</T.PerspectiveCamera>

<T.AmbientLight intensity={0.6} />
<T.DirectionalLight position={[2, 4, 3]} intensity={1.6} />
<T.DirectionalLight position={[-3, 2, -2]} intensity={0.5} />

{#if $gltf}
	<T is={$gltf.scene} />
{/if}
