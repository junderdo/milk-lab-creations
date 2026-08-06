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
    /** Fired once the rig has been posed for the first time. */
    onready?: () => void;
    onerror?: () => void;
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
    onerror,
  }: Props = $props();

  // Read once on purpose: a scene is built for one robot, and AnimationViewer
  // keys on `modelUrl` so switching robots remounts rather than swapping the
  // model out from under the resolved pivots.
  const gltf = useGltf(untrack(() => modelUrl));
  const gltfError = gltf.error;
  const { advance } = useThrelte();

  $effect(() => {
    if ($gltfError) onerror?.();
  });

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
    channel: number;
    node: THREE.Object3D;
    axis: THREE.Vector3;
    neutralDeg: number;
  }

  /**
   * glTF extras are a boundary: three.js types `userData` as `Record<string, any>`,
   * so the rig contract is checked here rather than trusted. A node that doesn't
   * carry a well-formed `{ channel, axis }` simply isn't a pivot.
   */
  function pivotFrom(node: THREE.Object3D): Pivot | null {
    const { channel, axis, neutralDeg } = node.userData;
    if (typeof channel !== "number" || !Number.isInteger(channel) || channel < 0) return null;
    if (!Array.isArray(axis) || axis.length !== 3) return null;
    const [x, y, z] = axis;
    if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") return null;

    return {
      channel,
      node,
      // rotation sense is baked into the axis vector — no runtime sign factor
      axis: new THREE.Vector3(x, y, z),
      neutralDeg: typeof neutralDeg === "number" ? neutralDeg : 90,
    };
  }

  // Dense and unordered: `channel` lives on the pivot rather than being its
  // index, so a rig with sparse or unexpected channel numbers can't produce
  // holes that later reads have to guard.
  let pivots = $state.raw<Pivot[]>([]);
  let target = $state.raw<[number, number, number]>([0, 0.05, 0]);
  let posed = false;

  // Pivots are found by traversal, not a hardcoded name list: the glb's extras
  // are the contract, so a new robot rig needs no code change here.
  $effect(() => {
    const scene = $gltf?.scene;
    if (!scene || pivots.length > 0) return;

    const found: Pivot[] = [];
    scene.traverse((node) => {
      const pivot = pivotFrom(node);
      if (pivot !== null) found.push(pivot);
    });
    pivots = found;

    const center = new THREE.Box3().setFromObject(scene).getCenter(new THREE.Vector3());
    target = [center.x, center.y, center.z];
  });

  /** Rest pose: every pivot at its own neutral angle, i.e. no rotation at all. */
  function poseNeutral() {
    for (const pivot of pivots) pivot.node.quaternion.identity();
  }

  function poseFrom(angles: number[]) {
    for (const pivot of pivots) {
      const angle = angles[pivot.channel];
      if (angle === undefined) continue;
      pivot.node.quaternion.setFromAxisAngle(
        pivot.axis,
        THREE.MathUtils.degToRad(angle - pivot.neutralDeg),
      );
    }
  }

  useTask((delta) => {
    if (pivots.length === 0) return;

    if (neutral) {
      poseNeutral();
    } else {
      const total = durationMs(keyframes);
      if (playing) {
        currentTimeMs += delta * 1000;
        if (currentTimeMs >= total) {
          if (loop) currentTimeMs = total > 0 ? currentTimeMs % total : 0;
          else currentTimeMs = total;
        }
      }
      const angles = sample(keyframes, currentTimeMs);
      poseFrom(angles);
      onpose?.(angles);
    }

    // "ready" means posed, not merely parsed — the placeholder is holding space
    // for a rendered frame, so it should not be pulled before there is one.
    if (!posed) {
      posed = true;
      onready?.();
    }
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
