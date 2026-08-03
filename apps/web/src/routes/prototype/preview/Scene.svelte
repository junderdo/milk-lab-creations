<!-- PROTOTYPE — Threlte scene: loads the rigged glb and drives its pivot nodes
     from the firmware-faithful interpolator every frame. -->
<script lang="ts">
	import { T, useTask, useThrelte } from '@threlte/core';
	import { OrbitControls, useGltf } from '@threlte/extras';
	import * as THREE from 'three';
	import { sample, durationMs } from './interpolator';
	import { PAYLOADS } from './payloads';
	import { NODE_NAMES, type NodeName, type PlaybackState } from './proto.svelte';

	let { pb }: { pb: PlaybackState } = $props();

	const gltf = useGltf('/models/robo-cat-ears.glb');

	// Cap the render loop at 120fps: renderMode="manual" on the Canvas, and we
	// only advance() when enough time has passed (240Hz displays would
	// otherwise run the loop at full display rate for no visible gain).
	const CAP_FPS = 120;
	const { advance } = useThrelte();
	$effect(() => {
		let raf: number;
		let last = 0;
		const loop = (now: number) => {
			raf = requestAnimationFrame(loop);
			// small tolerance so timing jitter doesn't halve the effective rate
			if (now - last >= 1000 / CAP_FPS - 0.5) {
				last = now;
				advance();
			}
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	});

	// channel -> { node, axis } resolved once from glTF extras (three.js userData)
	type Pivot = { node: THREE.Object3D; axis: THREE.Vector3; name: NodeName };
	let pivots = $state.raw<Pivot[] | null>(null);
	let center = $state<[number, number, number]>([0, 0.05, 0]);
	// rest-pose positions of pivot nodes and their children, for pivot nudging
	const basePos = new Map<THREE.Object3D, THREE.Vector3>();

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
		for (const p of found) {
			if (!p) continue;
			basePos.set(p.node, p.node.position.clone());
			for (const c of p.node.children) basePos.set(c, c.position.clone());
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

	// Pivot nudging: move a pivot node's origin by the offset while keeping the
	// rest pose — children get the inverse offset. Right side mirrors x.
	// EarL/R_Latitude is both a pivot (own offset) and a child of the azimuth
	// pivot (inverse azimuth offset), so deltas accumulate before applying.
	$effect(() => {
		if (!pivots) return;
		const mm = { azimuth: pb.azimuthOffset, latitude: pb.latitudeOffset };
		const deltas = new Map<THREE.Object3D, THREE.Vector3>();
		const bump = (o: THREE.Object3D, v: THREE.Vector3) =>
			(deltas.get(o) ?? deltas.set(o, new THREE.Vector3()).get(o)!).add(v);
		for (const p of pivots) {
			if (!p) continue;
			const src = p.name.includes('Azimuth') ? mm.azimuth : mm.latitude;
			const mirror = p.name.startsWith('EarR') ? -1 : 1;
			const d = new THREE.Vector3((src.x * mirror) / 1000, src.y / 1000, src.z / 1000);
			bump(p.node, d);
			for (const c of p.node.children) bump(c, d.clone().negate());
		}
		for (const [obj, base] of basePos) {
			const d = deltas.get(obj);
			if (d) obj.position.copy(base).add(d);
			else obj.position.copy(base);
		}
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
