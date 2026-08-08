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
  import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
  import { durationMs, sample, type Keyframe } from "$lib/animation/interpolator";
  import RingGizmoPrototype from "./RingGizmoPrototype.svelte";

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
    /** PROTOTYPE (branch prototype/ring-gizmos): ring-gizmo variant to mount. */
    gizmoVariant?: "A" | "B" | "C" | null;
    /** PROTOTYPE: servo range for the ring arcs. */
    gizmoMaxAngle?: number;
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
    gizmoVariant = null,
    gizmoMaxAngle = 180,
    onpose,
    onready,
    onerror,
  }: Props = $props();

  // Read once on purpose: a scene is built for one robot, and AnimationViewer
  // keys on `modelUrl` so switching robots remounts rather than swapping the
  // model out from under the resolved pivots.
  const gltf = useGltf(untrack(() => modelUrl));
  const gltfError = gltf.error;
  const { advance, scene, renderer } = useThrelte();

  /** How much of the shading comes from the environment rather than the lamps. */
  const ENV_INTENSITY = 0.4;

  // Image-based fill, standing in for the bounced light a real room would give.
  // RoomEnvironment is procedural, so this costs no asset fetch — one PMREM
  // convolution at mount and nothing per frame. It replaces an AmbientLight,
  // which adds the same value to every surface regardless of which way it
  // faces and so erases exactly the shape we want to see.
  $effect(() => {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const envMap = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();

    scene.environment = envMap;
    scene.environmentIntensity = ENV_INTENSITY;

    return () => {
      scene.environment = null;
      envMap.dispose();
    };
  });

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

  /** Roughly where the robot sits ahead of the camera, for the lights to aim at. */
  const CAMERA_TO_SUBJECT = 0.35;
  let aim = $state.raw<THREE.Object3D | undefined>(undefined);
  let keyLight = $state.raw<THREE.DirectionalLight | undefined>(undefined);

  // Dense and unordered: `channel` lives on the pivot rather than being its
  // index, so a rig with sparse or unexpected channel numbers can't produce
  // holes that later reads have to guard.
  let pivots = $state.raw<Pivot[]>([]);
  let target = $state.raw<[number, number, number]>([0, 0.05, 0]);
  /** The rig's extent, for sizing the key light's shadow camera. */
  let radius = $state.raw<number | null>(null);
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
      // glTF carries no shadow flags, so every mesh has to opt in here or the
      // ears cannot shade the head.
      if ((node as THREE.Mesh).isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    pivots = found;

    const box = new THREE.Box3().setFromObject(scene);
    const center = box.getCenter(new THREE.Vector3());
    target = [center.x, center.y, center.z];
    radius = box.getBoundingSphere(new THREE.Sphere()).radius;
  });

  // The rig is ~0.2 units across and the default shadow camera spans 10, which
  // would spend the whole shadow map on empty space and return mush. Sized here
  // rather than as props because changing an orthographic camera's frustum does
  // nothing until its projection matrix is rebuilt.
  $effect(() => {
    if (!keyLight || radius === null) return;

    const extent = radius * 1.3;
    const shadow = keyLight.shadow;
    shadow.camera.left = -extent;
    shadow.camera.right = extent;
    shadow.camera.top = extent;
    shadow.camera.bottom = -extent;
    shadow.camera.near = 0.01;
    shadow.camera.far = keyLight.position.length() + radius * 2;
    shadow.camera.updateProjectionMatrix();
    // normalBias over bias: it scales with the surface angle, so the curved
    // shell doesn't need a bias big enough to detach shadows where parts meet.
    shadow.normalBias = radius * 0.06;
  });

  // PROTOTYPE state: drag overrides win over the sampled pose and persist until
  // reload, so a dragged ear holds its pose; the real feature writes keyframes.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- read per frame, never rendered
  const gizmoOverrides = new Map<number, number>();
  let gizmoDragging = $state(false);
  let lastAngles = $state.raw<number[]>([]);

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
      if (gizmoVariant) for (const [channel, deg] of gizmoOverrides) angles[channel] = deg;
      poseFrom(angles);
      if (gizmoVariant) lastAngles = angles;
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
  <!-- Fill and rim hang off the camera so no orbit angle can leave the robot
       an unreadable silhouette. They aim at `aim` rather than at their own
       default target: a DirectionalLight points from its position to
       `light.target`, and that target defaults to an object at the world
       origin — parenting the lights alone would swing them around the robot
       while they kept pointing at the same fixed spot. -->
  <T.Object3D bind:ref={aim} position={[0, 0, -CAMERA_TO_SUBJECT]} />
  {#if aim}
    <T.DirectionalLight position={[-1.2, 0.5, 0.2]} intensity={0.55} target={aim} />
    <T.DirectionalLight position={[0.5, 1, -1.5]} intensity={0.85} target={aim} />
  {/if}

  {#if interactive}
    <!-- clamped so the model can't be orbited under the floor or lost in space -->
    <OrbitControls
      {target}
      enabled={!gizmoDragging}
      enableDamping
      enablePan={false}
      minDistance={0.15}
      maxDistance={0.9}
      minPolarAngle={0.2}
      maxPolarAngle={Math.PI / 2}
    />
  {/if}
</T.PerspectiveCamera>

<!-- The key stays in world space on purpose. If it rode the camera along with
     the other two, the highlights would sit still while the robot turned under
     them, which reads as the model spinning rather than the viewer moving
     around it. Orbiting past a fixed key is the cue that there is a there
     there. -->
<T.DirectionalLight
  bind:ref={keyLight}
  position={[2, 4, 3]}
  intensity={1.2}
  castShadow
  shadow.mapSize.width={1024}
  shadow.mapSize.height={1024}
/>

{#if $gltf}
  <T is={$gltf.scene} />
  <!-- PROTOTYPE: mounted alongside the scene, never in its place — trading
       <T is={scene}> ownership across branches detaches the robot, because the
       outgoing branch's teardown runs after the incoming branch mounts. -->
  {#if gizmoVariant !== null && pivots.length > 0}
    <RingGizmoPrototype
      scene={$gltf.scene}
      {pivots}
      maxAngle={gizmoMaxAngle}
      variant={gizmoVariant}
      angles={lastAngles}
      onoverride={(channel, deg) => gizmoOverrides.set(channel, deg)}
      ondraglock={(locked) => (gizmoDragging = locked)}
    />
  {/if}
{/if}
