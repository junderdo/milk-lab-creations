<!--
  The scene layer of AnimationViewer: loads the rigged glb, resolves its pivot
  nodes, and poses them from the firmware-faithful interpolator every frame.
  Must live inside a <Canvas> — Threlte's hooks require that context.

  This component owns no playback policy. It advances `currentTimeMs` when told
  to play and reports the pose it rendered; whether time comes from a built-in
  transport or an editor playhead is the parent's business.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { T, useTask, useThrelte } from "@threlte/core";
  import { OrbitControls, useGltf } from "@threlte/extras";
  import * as THREE from "three";
  import { durationMs, sample, type Keyframe } from "$lib/animation/interpolator";

  interface Props {
    keyframes: Keyframe[];
    modelUrl: string;
    /** Playhead in ms. Bound, so a parent transport or editor can drive it. */
    currentTimeMs: number;
    playing: boolean;
    loop: boolean;
    /** Show the rig's as-modelled rest pose instead of sampling the animation. */
    neutral: boolean;
    /** Orbit + zoom, clamped. Off for the editor's fixed camera. */
    interactive: boolean;
    onpose?: (angles: number[]) => void;
    onready?: () => void;
  }

  let {
    keyframes,
    modelUrl,
    currentTimeMs = $bindable(0),
    playing,
    loop,
    neutral,
    interactive,
    onpose,
    onready,
  }: Props = $props();

  // Read once on purpose: a scene is built for one robot, and AnimationViewer
  // keys on `modelUrl` so switching robots remounts rather than swapping the
  // model out from under the resolved pivots.
  const gltf = useGltf(untrack(() => modelUrl));
  const { advance } = useThrelte();

  // Cap the render loop at 120fps: the Canvas is in manual render mode, and we
  // only advance() once enough time has passed. A 240Hz display would otherwise
  // run the loop at full rate for no visible gain.
  const CAP_FPS = 120;
  $effect(() => {
    let raf = 0;
    let last = 0;
    const loopFrame = (now: number) => {
      raf = requestAnimationFrame(loopFrame);
      // small tolerance so timing jitter doesn't halve the effective rate
      if (now - last >= 1000 / CAP_FPS - 0.5) {
        last = now;
        advance();
      }
    };
    raf = requestAnimationFrame(loopFrame);
    return () => cancelAnimationFrame(raf);
  });

  /** A rig joint: which channel drives it, and the axis it turns about. */
  interface Pivot {
    node: THREE.Object3D;
    axis: THREE.Vector3;
    neutralDeg: number;
  }

  let pivots = $state.raw<Pivot[]>([]);
  let target = $state.raw<[number, number, number]>([0, 0.05, 0]);

  // Pivots are resolved by traversal, not by a hardcoded name list: the glb's
  // extras are the contract, so a new robot rig needs no code change here.
  // Rotation sense is baked into the axis vectors — no runtime sign factor.
  $effect(() => {
    const scene = $gltf?.scene;
    if (!scene || pivots.length > 0) return;

    const found: Pivot[] = [];
    scene.traverse((node) => {
      const { channel, axis, neutralDeg } = node.userData;
      if (typeof channel !== "number" || !Array.isArray(axis)) return;
      found[channel] = {
        node,
        axis: new THREE.Vector3(...(axis as [number, number, number])),
        neutralDeg: typeof neutralDeg === "number" ? neutralDeg : 90,
      };
    });
    pivots = found;

    const center = new THREE.Box3().setFromObject(scene).getCenter(new THREE.Vector3());
    target = [center.x, center.y, center.z];
    onready?.();
  });

  function poseTo(angles: number[]) {
    for (let ch = 0; ch < pivots.length; ch++) {
      const pivot = pivots[ch];
      const angle = angles[ch];
      if (pivot === undefined || angle === undefined) continue;
      pivot.node.quaternion.setFromAxisAngle(
        pivot.axis,
        THREE.MathUtils.degToRad(angle - pivot.neutralDeg),
      );
    }
  }

  useTask((delta) => {
    if (pivots.length === 0) return;

    if (neutral) {
      poseTo(pivots.map((p) => p.neutralDeg));
      return;
    }

    const total = durationMs(keyframes);
    if (playing) {
      currentTimeMs += delta * 1000;
      if (currentTimeMs >= total) {
        if (loop) currentTimeMs = total > 0 ? currentTimeMs % total : 0;
        else currentTimeMs = total;
      }
    }

    const angles = sample(keyframes, currentTimeMs);
    poseTo(angles);
    onpose?.(angles);
  });
</script>

<T.PerspectiveCamera makeDefault position={[0.25, 0.18, 0.3]} fov={40}>
  {#if interactive}
    <!-- clamped so the model can't be orbited under the floor or lost in space -->
    <OrbitControls
      {target}
      enableDamping
      enablePan={false}
      minDistance={0.15}
      maxDistance={0.9}
      minPolarAngle={0.2}
      maxPolarAngle={Math.PI / 2}
    />
  {/if}
</T.PerspectiveCamera>

<T.AmbientLight intensity={0.6} />
<T.DirectionalLight position={[2, 4, 3]} intensity={1.6} />
<T.DirectionalLight position={[-3, 2, -2]} intensity={0.5} />

{#if $gltf}
  <T is={$gltf.scene} />
{/if}
