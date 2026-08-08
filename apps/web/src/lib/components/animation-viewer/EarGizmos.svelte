<!--
  In-3D editing for the editor's viewer (spec §3.2): hover an ear and it lights
  in its channels' colours, click to select, and two rotation-ring arcs appear
  — one per channel, spanning exactly the servo's range. Dragging a ring edits
  the document through the `ViewerEditing` seam; this component never touches
  keyframes itself.

  Settled as variant A on `prototype/ring-gizmos`: per-channel emissive tint,
  thin depth-test-off torus arcs with a sphere current-angle marker, a degree
  pill only while dragging. Picking and drag plumbing follow
  docs/research/threlte-picking-gizmos.md and ring-drag-mechanics.md.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { T, useThrelte } from "@threlte/core";
  import { HTML, interactivity, type IntersectionEvent } from "@threlte/extras";
  import * as THREE from "three";
  import { hexFor } from "$lib/animation/channels";
  import {
    arcStartRad,
    arcSweepRad,
    moveRingDrag,
    ringAngleRad,
    startRingDrag,
    type RingDrag,
  } from "$lib/animation/ring-drag";
  import type { ViewerEditing } from "./editing";
  import type { Pivot } from "./pivots";

  interface Props {
    /** The glTF scene root — picking is registered on it, never re-parented. */
    scene: THREE.Object3D;
    pivots: Pivot[];
    editing: ViewerEditing;
    /** Channel angles as posed this frame — markers ride the playing pose. */
    angles: number[];
    /** A ring drag holds the pointer; orbit must sit the gesture out. */
    ondraglock: (locked: boolean) => void;
  }

  let { scene, pivots, editing, angles, ondraglock }: Props = $props();

  const { camera, renderer } = useThrelte();

  const coarsePointer =
    typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const picking = interactivity({ clickDistanceThreshold: coarsePointer ? 16 : 8 });

  let darkTheme = $state(document.documentElement.classList.contains("dark"));
  $effect(() => {
    const observer = new MutationObserver(() => {
      darkTheme = document.documentElement.classList.contains("dark");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  });

  const hueOf = (channel: number) => hexFor(channel, darkTheme);

  // ---------------------------------------------------------------- ears

  interface MeshEntry {
    mesh: THREE.Mesh;
    material: THREE.MeshStandardMaterial;
    /** The servo housing tints in the azimuth colour, the ear shell in the latitude's. */
    channel: number;
  }

  interface Ear {
    azimuth: Pivot;
    latitude: Pivot;
    entries: MeshEntry[];
  }

  // Read once on purpose: the scene remounts per model, so the pivot set is
  // fixed for this component's life.
  const fixedPivots = untrack(() => pivots);
  const pivotByNode = new Map(fixedPivots.map((p) => [p.node, p]));

  function nearestPivot(object: THREE.Object3D): Pivot | null {
    for (let node: THREE.Object3D | null = object; node; node = node.parent) {
      const pivot = pivotByNode.get(node);
      if (pivot) return pivot;
    }
    return null;
  }

  /**
   * An ear is a latitude pivot nested under an azimuth pivot. Materials are
   * cloned per mesh so the hover tint of one ear can't bleed into the other —
   * the glb shares materials across meshes.
   */
  function buildEars(): Ear[] {
    const ears: Ear[] = [];
    for (const latitude of fixedPivots) {
      const azimuth = latitude.node.parent ? nearestPivot(latitude.node.parent) : null;
      if (!azimuth) continue;

      const entries: MeshEntry[] = [];
      azimuth.node.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        // the material is a boundary like userData: a mesh that isn't carrying
        // a single standard material simply doesn't get a tint
        const shared: unknown = node.material;
        if (!(shared instanceof THREE.MeshStandardMaterial)) return;
        const material = shared.clone();
        node.material = material;
        entries.push({ mesh: node, material, channel: nearestPivot(node)?.channel ?? azimuth.channel });
      });
      ears.push({ azimuth, latitude, entries });
    }
    return ears;
  }

  const ears = buildEars();

  // undo the material pokes when the gizmo layer unmounts
  $effect(() => () => {
    for (const ear of ears) {
      for (const entry of ear.entries) entry.material.emissive.set(0x000000);
    }
  });

  function earFromObject(object: THREE.Object3D): Ear | null {
    const pivot = nearestPivot(object);
    if (!pivot) return null;
    return ears.find((e) => e.azimuth === pivot || e.latitude === pivot) ?? null;
  }

  function insideGizmo(object: THREE.Object3D): boolean {
    for (let node: THREE.Object3D | null = object; node; node = node.parent) {
      if (node.userData.gizmo) return true;
    }
    return false;
  }

  // ---------------------------------------------------------- hover/select

  let hovered = $state.raw<Ear | null>(null);
  let selected = $state.raw<Ear | null>(null);
  let ringHover = $state<number | null>(null);

  /**
   * The imperative registry types its events as `unknown`, so the hit object
   * is checked out of them the same way `pivotFrom` checks `userData` — a
   * boundary parse, not a cast.
   */
  function pickedObject(event: unknown): THREE.Object3D | null {
    if (typeof event !== "object" || event === null || !("object" in event)) return null;
    const { object } = event;
    return object instanceof THREE.Object3D ? object : null;
  }

  function pickedEar(event: unknown): Ear | null {
    const object = pickedObject(event);
    if (object === null || insideGizmo(object)) return null;
    return earFromObject(object);
  }

  function onSceneMove(event: unknown) {
    hovered = pickedEar(event);
  }

  function onSceneLeave() {
    hovered = null;
  }

  function onSceneClick(event: unknown) {
    if (insideGizmo(pickedObject(event) ?? scene)) return;
    // the headband maps to no ear, so clicking it deselects like empty space
    selected = pickedEar(event);
  }

  function onPointerMissed() {
    selected = null;
  }

  // A gesture that starts on an ear belongs to the ear, not the camera — even
  // though ears have no drag of their own, orbit sits the gesture out (§3.2
  // orbit priority). Rings lock through their own drag instead.
  function onScenePointerDown(event: unknown) {
    if (pickedEar(event) === null) return;
    ondraglock(true);
    const release = () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      ondraglock(false);
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
  }

  // Registered imperatively, not via a second <T is={scene}>: the scene's <T>
  // stays owned by RobotScene, so no branch swap can ever detach the robot.
  $effect(() => {
    picking.addInteractiveObject(scene, {
      onpointermove: onSceneMove,
      onpointerleave: onSceneLeave,
      onpointerdown: onScenePointerDown,
      onclick: onSceneClick,
      onpointermissed: onPointerMissed,
    });
    return () => picking.removeInteractiveObject(scene);
  });

  $effect(() => {
    editing.onselect(
      selected === null ? null : [selected.azimuth.channel, selected.latitude.channel],
    );
  });

  $effect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") selected = null;
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  });

  $effect(() => {
    renderer.domElement.style.cursor = drag
      ? "grabbing"
      : (ringHover !== null && editing.canEditAngles) || hovered
        ? "grab"
        : "";
    return () => {
      renderer.domElement.style.cursor = "";
    };
  });

  // Emissive is reset-then-apply each run so switching ears or themes can't
  // leave a stale tint behind. Intensity 0.5 hovered, 0.25 merely selected.
  $effect(() => {
    for (const ear of ears) {
      const lit = ear === hovered || ear === selected;
      const hot = ear === hovered;
      for (const entry of ear.entries) {
        entry.material.emissive.set(0x000000);
        if (!lit) continue;
        entry.material.emissive.set(hueOf(entry.channel));
        entry.material.emissiveIntensity = hot ? 0.5 : 0.25;
      }
    }
  });

  // ---------------------------------------------------------------- rings

  interface Ring {
    pivot: Pivot;
    group: THREE.Group;
    radius: number;
  }

  function subtreeRadius(node: THREE.Object3D): number {
    return new THREE.Box3().setFromObject(node).getBoundingSphere(new THREE.Sphere()).radius;
  }

  let rings = $state.raw<Ring[]>([]);

  // The ring group sits beside its pivot node (same parent, same position),
  // z aligned to the rotation axis — so the arc turns with the rest of the
  // rig but not with its own channel's rotation.
  $effect(() => {
    const ear = selected;
    if (!ear) {
      rings = [];
      return;
    }
    const created = [ear.azimuth, ear.latitude].map((pivot) => {
      const group = new THREE.Group();
      group.userData.gizmo = true;
      group.position.copy(pivot.node.position);
      group.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        pivot.axis.clone().normalize(),
      );
      pivot.node.parent?.add(group);
      return { pivot, group, radius: subtreeRadius(pivot.node) * 1.25 };
    });
    rings = created;
    return () => {
      for (const ring of created) ring.group.removeFromParent();
    };
  });

  const sweep = $derived(arcSweepRad(editing.maxAngle));

  const valueOf = (ring: Ring) => angles[ring.pivot.channel] ?? ring.pivot.neutralDeg;
  const thetaOf = (ring: Ring) => ringAngleRad(valueOf(ring), ring.pivot.neutralDeg);

  // ----------------------------------------------------------------- drag

  /** Below this, a press that moved was a tap with a shaky hand — no auto-key. */
  const DRAG_SLOP_PX = 3;

  interface ActiveDrag {
    ring: Ring;
    drag: RingDrag;
    originX: number;
    originY: number;
    /** True once past the slop — only then do edits flow to the editor. */
    engaged: boolean;
  }

  let drag = $state.raw<ActiveDrag | null>(null);

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function pointerRay(event: PointerEvent): THREE.Ray {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera.current);
    return raycaster.ray;
  }

  function startDrag(ring: Ring, event: IntersectionEvent<PointerEvent>) {
    if (!editing.canEditAngles) return; // at the cap a ring is not a handle
    event.stopPropagation();

    const center = ring.group.getWorldPosition(new THREE.Vector3());
    const q = ring.group.getWorldQuaternion(new THREE.Quaternion());
    drag = {
      ring,
      drag: startRingDrag({
        center,
        axis: new THREE.Vector3(0, 0, 1).applyQuaternion(q),
        grabPoint: event.point,
        cameraPosition: camera.current.getWorldPosition(new THREE.Vector3()),
        value: valueOf(ring),
      }),
      originX: event.nativeEvent.clientX,
      originY: event.nativeEvent.clientY,
      engaged: false,
    };

    // paused before the first move, so the auto-key target cannot be moving
    editing.ondragstart();
    ondraglock(true);
    window.addEventListener("pointermove", moveDrag);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  }

  function moveDrag(event: PointerEvent) {
    const active = drag;
    if (!active) return;
    if (
      !active.engaged &&
      Math.hypot(event.clientX - active.originX, event.clientY - active.originY) < DRAG_SLOP_PX
    ) {
      return;
    }
    // re-checked at engagement, not just at grab: the grab may have paused
    // playback, and whether an auto-key is possible belongs to the playhead
    // where it came to rest
    if (!active.engaged && !editing.canEditAngles) return;
    const moved = moveRingDrag(active.drag, pointerRay(event), editing.maxAngle);
    drag = { ...active, drag: moved, engaged: true };
    editing.onangle(active.ring.pivot.channel, moved.value);
  }

  function endDrag() {
    window.removeEventListener("pointermove", moveDrag);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
    const wasEngaged = drag?.engaged ?? false;
    drag = null;
    ondraglock(false);
    if (wasEngaged) editing.oncommit();
  }

  $effect(() => () => endDrag());

  const readoutFor = (ring: Ring) =>
    Math.round(drag?.ring === ring && drag.engaged ? drag.drag.value : valueOf(ring));
</script>

{#each rings as ring (ring.pivot.channel)}
  {@const hue = hueOf(ring.pivot.channel)}
  {@const theta = thetaOf(ring)}
  {@const start = arcStartRad(ring.pivot.neutralDeg)}
  {@const active = drag?.ring === ring || ringHover === ring.pivot.channel}
  <T is={ring.group} attach={false}>
    {#key hue}
      <T.Mesh rotation.z={start} renderOrder={999}>
        <T.TorusGeometry args={[ring.radius, ring.radius * 0.016, 12, 96, sweep]} />
        <T.MeshBasicMaterial color={hue} transparent opacity={active ? 1 : 0.9} depthTest={false} />
      </T.Mesh>
      <T.Mesh
        position={[Math.cos(theta) * ring.radius, Math.sin(theta) * ring.radius, 0]}
        renderOrder={1000}
      >
        <T.SphereGeometry args={[ring.radius * 0.07, 16, 16]} />
        <T.MeshBasicMaterial color={hue} depthTest={false} />
      </T.Mesh>
      {#if drag?.ring === ring && drag.engaged}
        <HTML
          position={[Math.cos(theta) * ring.radius * 1.35, Math.sin(theta) * ring.radius * 1.35, 0]}
          center
        >
          <div
            class="pointer-events-none rounded bg-gray-900/85 px-1.5 py-0.5 text-xs font-medium tabular-nums whitespace-nowrap text-white dark:bg-white/90 dark:text-gray-900"
            style="border-left: 3px solid {hue}; padding-left: 6px"
          >
            {readoutFor(ring)}°
          </div>
        </HTML>
      {/if}

      <!-- invisible fat hit torus — the raycaster ignores visibility -->
      <T.Mesh
        rotation.z={start}
        visible={false}
        onpointerdown={(event: IntersectionEvent<PointerEvent>) => startDrag(ring, event)}
        onpointerenter={() => (ringHover = ring.pivot.channel)}
        onpointerleave={() => (ringHover = ringHover === ring.pivot.channel ? null : ringHover)}
      >
        <T.TorusGeometry
          args={[ring.radius, ring.radius * (coarsePointer ? 0.4 : 0.2), 8, 48, sweep]}
        />
      </T.Mesh>
    {/key}
  </T>
{/each}
