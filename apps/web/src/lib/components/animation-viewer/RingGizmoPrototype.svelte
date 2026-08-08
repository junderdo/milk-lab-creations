<!--
  PROTOTYPE — THROWAWAY (branch prototype/ring-gizmos). Do not merge to main.

  Three variants of hover highlight + rotation-ring gizmos for the editor's 3D
  view, switchable via ?variant= on the editor route:

    A — per-channel emissive tint on hover (servo housing lights in the azimuth
        colour, the ear in the latitude colour); thin crisp always-on-top ring
        arcs; degree readout pill while dragging.
    B — neutral back-face outline shell on hover; fat translucent depth-tested
        ribbon rings with end-stop ticks; no readout.
    C — base-colour lerp toward the channel hue on hover; translucent sector
        fans with a radial current-angle needle; always-on degree HUD for the
        selected ear.

  Shared plumbing (not under evaluation, shapes from the two research docs):
  interactivity() picking with parent walk-up, orbit suppression during a drag,
  incremental ray→rotation-plane angle with wrapped deltas and clamp-per-move,
  tangent-mapping fallback near edge-on, invisible fat torus hit meshes.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { T, useThrelte } from "@threlte/core";
  import { HTML, interactivity } from "@threlte/extras";
  import * as THREE from "three";

  interface Pivot {
    channel: number;
    node: THREE.Object3D;
    axis: THREE.Vector3;
    neutralDeg: number;
  }

  interface Props {
    scene: THREE.Object3D;
    pivots: Pivot[];
    maxAngle: number;
    variant: "A" | "B" | "C";
    /** Channel angles as posed this frame (drag overrides applied). */
    angles: number[];
    onoverride: (channel: number, deg: number) => void;
    ondraglock: (locked: boolean) => void;
  }

  let { scene, pivots, maxAngle, variant, angles, onoverride, ondraglock }: Props = $props();

  const { camera, renderer } = useThrelte();

  const coarsePointer =
    typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  interactivity({ clickDistanceThreshold: coarsePointer ? 16 : 8 });

  // CHANNEL_STYLES hues (sky/violet/amber/emerald), as hex for three.js
  // materials — 600s on the light canvas, 400s on the dark one.
  const LIGHT_HUES = ["#0284c7", "#7c3aed", "#d97706", "#059669"];
  const DARK_HUES = ["#38bdf8", "#a78bfa", "#fbbf24", "#34d399"];

  let darkTheme = $state(document.documentElement.classList.contains("dark"));
  $effect(() => {
    const observer = new MutationObserver(() => {
      darkTheme = document.documentElement.classList.contains("dark");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  });

  const hues = $derived(darkTheme ? DARK_HUES : LIGHT_HUES);
  const hueOf = (channel: number) => hues[channel % hues.length] ?? "#888888";

  // ---------------------------------------------------------------- ears

  interface MeshEntry {
    mesh: THREE.Mesh;
    material: THREE.MeshStandardMaterial;
    baseColor: THREE.Color;
    channel: number;
    outline: THREE.Mesh;
    outlineMaterial: THREE.MeshBasicMaterial;
  }

  interface Ear {
    azimuth: Pivot;
    latitude: Pivot;
    entries: MeshEntry[];
  }

  // Read once on purpose: the scene remounts per model, and the gizmo is keyed
  // on the variant, so the pivot set is fixed for this component's life.
  const fixedPivots = untrack(() => pivots);
  const pivotByNode = new Map(fixedPivots.map((p) => [p.node, p]));

  function nearestPivot(object: THREE.Object3D): Pivot | null {
    for (let node: THREE.Object3D | null = object; node; node = node.parent) {
      const pivot = pivotByNode.get(node);
      if (pivot) return pivot;
    }
    return null;
  }

  function buildEars(): Ear[] {
    const ears: Ear[] = [];
    for (const latitude of fixedPivots) {
      const azimuth = latitude.node.parent ? nearestPivot(latitude.node.parent) : null;
      if (!azimuth) continue;

      const entries: MeshEntry[] = [];
      azimuth.node.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh || mesh.userData.gizmo) return;
        const material = (mesh.material as THREE.MeshStandardMaterial).clone();
        mesh.material = material;

        const outlineMaterial = new THREE.MeshBasicMaterial({
          side: THREE.BackSide,
          transparent: true,
          opacity: 0.9,
        });
        const outline = new THREE.Mesh(mesh.geometry, outlineMaterial);
        outline.scale.setScalar(1.035);
        outline.visible = false;
        outline.userData.gizmo = true;
        mesh.add(outline);

        entries.push({
          mesh,
          material,
          baseColor: material.color.clone(),
          channel: nearestPivot(mesh)?.channel ?? azimuth.channel,
          outline,
          outlineMaterial,
        });
      });
      ears.push({ azimuth, latitude, entries });
    }
    return ears;
  }

  const ears = buildEars();

  // Undo the material pokes when the variant remounts or the gizmo unmounts.
  $effect(() => () => {
    for (const ear of ears) {
      for (const entry of ear.entries) {
        entry.mesh.remove(entry.outline);
        entry.outlineMaterial.dispose();
        entry.material.emissive.set(0x000000);
        entry.material.color.copy(entry.baseColor);
      }
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type PickEvent = any; // threlte intersection event; prototype-loose

  function onSceneMove(event: PickEvent) {
    hovered = insideGizmo(event.object) ? null : earFromObject(event.object);
  }

  function onSceneLeave() {
    hovered = null;
  }

  function onSceneClick(event: PickEvent) {
    if (insideGizmo(event.object)) return;
    selected = earFromObject(event.object);
  }

  function onPointerMissed() {
    selected = null;
  }

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
      : ringHover !== null
        ? "grab"
        : hovered
          ? "pointer"
          : "";
    return () => {
      renderer.domElement.style.cursor = "";
    };
  });

  // Variant treatments are imperative material pokes; reset-then-apply each run
  // keeps switching variants/themes/selection from leaking state.
  $effect(() => {
    for (const ear of ears) {
      const lit = ear === hovered || ear === selected;
      const hot = ear === hovered;
      for (const entry of ear.entries) {
        entry.material.emissive.set(0x000000);
        entry.material.emissiveIntensity = 1;
        entry.material.color.copy(entry.baseColor);
        entry.outline.visible = false;

        if (!lit) continue;
        if (variant === "A") {
          entry.material.emissive.set(hueOf(entry.channel));
          entry.material.emissiveIntensity = hot ? 0.5 : 0.25;
        } else if (variant === "B") {
          entry.outline.visible = true;
          entry.outlineMaterial.color.set(darkTheme ? "#f9fafb" : "#111827");
          entry.outlineMaterial.opacity = hot ? 0.95 : 0.55;
        } else {
          entry.material.color.copy(entry.baseColor).lerp(
            new THREE.Color(hueOf(entry.channel)),
            hot ? 0.5 : 0.3,
          );
        }
      }
    }
  });

  // ---------------------------------------------------------------- rings

  interface Ring {
    pivot: Pivot;
    role: "azimuth" | "latitude";
    group: THREE.Group;
    radius: number;
  }

  function subtreeRadius(node: THREE.Object3D): number {
    const sphere = new THREE.Box3().setFromObject(node).getBoundingSphere(new THREE.Sphere());
    return sphere.radius;
  }

  let rings = $state.raw<Ring[]>([]);

  $effect(() => {
    const ear = selected;
    if (!ear) {
      rings = [];
      return;
    }
    const created = (
      [
        { pivot: ear.azimuth, role: "azimuth" },
        { pivot: ear.latitude, role: "latitude" },
      ] as const
    ).map(({ pivot, role }) => {
      const group = new THREE.Group();
      group.userData.gizmo = true;
      group.position.copy(pivot.node.position);
      group.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        pivot.axis.clone().normalize(),
      );
      pivot.node.parent?.add(group);
      return { pivot, role, group, radius: subtreeRadius(pivot.node) * 1.25 };
    });
    rings = created;
    return () => {
      for (const ring of created) ring.group.removeFromParent();
    };
  });

  const sweep = $derived(THREE.MathUtils.degToRad(maxAngle));

  function thetaOf(ring: Ring): number {
    const value = angles[ring.pivot.channel] ?? ring.pivot.neutralDeg;
    return THREE.MathUtils.degToRad(value - ring.pivot.neutralDeg);
  }

  // The arc spans servo 0..maxAngle, i.e. ring angles (0-neutral)..(max-neutral).
  function arcStart(ring: Ring): number {
    return THREE.MathUtils.degToRad(0 - ring.pivot.neutralDeg);
  }

  // ----------------------------------------------------------------- drag

  interface Drag {
    ring: Ring;
    mode: "plane" | "tangent";
    plane: THREE.Plane;
    center: THREE.Vector3;
    u: THREE.Vector3;
    v: THREE.Vector3;
    thetaPrev: number;
    grabPoint: THREE.Vector3;
    grabValue: number;
    tangent: THREE.Vector3;
    gain: number;
    value: number;
  }

  let drag = $state.raw<Drag | null>(null);

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function pointerRay(event: PointerEvent): THREE.Ray {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera.current as THREE.PerspectiveCamera);
    return raycaster.ray;
  }

  function wrapToPi(rad: number): number {
    return ((((rad + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  }

  function startDrag(ring: Ring, event: PickEvent) {
    event.stopPropagation();

    const center = ring.group.getWorldPosition(new THREE.Vector3());
    const q = ring.group.getWorldQuaternion(new THREE.Quaternion());
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const u = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const v = new THREE.Vector3(0, 1, 0).applyQuaternion(q);

    const camPos = (camera.current as THREE.Object3D).getWorldPosition(new THREE.Vector3());
    const eye = center.clone().sub(camPos).normalize();
    const grabValue = angles[ring.pivot.channel] ?? ring.pivot.neutralDeg;

    if (Math.abs(n.dot(eye)) < 0.25) {
      // near edge-on: TransformControls' screen-tangent mapping for this drag
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(eye, center);
      const grabPoint = plane.projectPoint(event.point as THREE.Vector3, new THREE.Vector3());
      drag = {
        ring,
        mode: "tangent",
        plane,
        center,
        u,
        v,
        thetaPrev: 0,
        grabPoint,
        grabValue,
        tangent: n.clone().cross(eye).normalize(),
        gain: 20 / camPos.distanceTo(center),
        value: grabValue,
      };
    } else {
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, center);
      const p = (event.point as THREE.Vector3).clone().sub(center);
      drag = {
        ring,
        mode: "plane",
        plane,
        center,
        u,
        v,
        thetaPrev: Math.atan2(p.dot(v), p.dot(u)),
        grabPoint: new THREE.Vector3(),
        grabValue,
        tangent: new THREE.Vector3(),
        gain: 0,
        value: grabValue,
      };
    }

    ondraglock(true);
    window.addEventListener("pointermove", moveDrag);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  }

  const hitPoint = new THREE.Vector3();

  function moveDrag(event: PointerEvent) {
    const active = drag;
    if (!active) return;
    if (pointerRay(event).intersectPlane(active.plane, hitPoint) === null) return;

    let value: number;
    if (active.mode === "plane") {
      const p = hitPoint.clone().sub(active.center);
      const theta = Math.atan2(p.dot(active.v), p.dot(active.u));
      const delta = wrapToPi(theta - active.thetaPrev);
      value = THREE.MathUtils.clamp(
        active.value + THREE.MathUtils.radToDeg(delta),
        0,
        maxAngle,
      );
      drag = { ...active, thetaPrev: theta, value };
    } else {
      const deltaRad =
        hitPoint.clone().sub(active.grabPoint).dot(active.tangent) * active.gain;
      value = THREE.MathUtils.clamp(
        active.grabValue + THREE.MathUtils.radToDeg(deltaRad),
        0,
        maxAngle,
      );
      drag = { ...active, value };
    }
    onoverride(active.ring.pivot.channel, value);
  }

  function endDrag() {
    window.removeEventListener("pointermove", moveDrag);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
    drag = null;
    ondraglock(false);
  }

  $effect(() => () => endDrag());

  const readoutFor = (ring: Ring) =>
    Math.round(drag?.ring === ring ? drag.value : (angles[ring.pivot.channel] ?? 0));
</script>

<T
  is={scene}
  dispose={false}
  onpointermove={onSceneMove}
  onpointerleave={onSceneLeave}
  onclick={onSceneClick}
  onpointermissed={onPointerMissed}
/>

{#each rings as ring (ring.pivot.channel)}
  {@const hue = hueOf(ring.pivot.channel)}
  {@const theta = thetaOf(ring)}
  {@const start = arcStart(ring)}
  {@const active = drag?.ring === ring || ringHover === ring.pivot.channel}
  <T is={ring.group} attach={false}>
    {#key variant + hue}
      {#if variant === "A"}
        <T.Mesh rotation.z={start} renderOrder={999}>
          <T.TorusGeometry args={[ring.radius, ring.radius * 0.016, 12, 96, sweep]} />
          <T.MeshBasicMaterial
            color={hue}
            transparent
            opacity={active ? 1 : 0.9}
            depthTest={false}
          />
        </T.Mesh>
        <T.Mesh
          position={[
            Math.cos(theta) * ring.radius,
            Math.sin(theta) * ring.radius,
            0,
          ]}
          renderOrder={1000}
        >
          <T.SphereGeometry args={[ring.radius * 0.07, 16, 16]} />
          <T.MeshBasicMaterial color={hue} depthTest={false} />
        </T.Mesh>
        {#if drag?.ring === ring}
          <HTML
            position={[
              Math.cos(theta) * ring.radius * 1.35,
              Math.sin(theta) * ring.radius * 1.35,
              0,
            ]}
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
      {:else if variant === "B"}
        <T.Mesh rotation.z={start}>
          <T.TorusGeometry args={[ring.radius, ring.radius * 0.05, 12, 96, sweep]} />
          <T.MeshBasicMaterial color={hue} transparent opacity={active ? 0.85 : 0.35} />
        </T.Mesh>
        {#each [start, start + sweep] as end (end)}
          <T.Mesh
            position={[Math.cos(end) * ring.radius, Math.sin(end) * ring.radius, 0]}
            rotation.z={end}
          >
            <T.BoxGeometry
              args={[ring.radius * 0.22, ring.radius * 0.035, ring.radius * 0.035]}
            />
            <T.MeshBasicMaterial color={hue} transparent opacity={0.85} />
          </T.Mesh>
        {/each}
        <T.Mesh
          position={[Math.cos(theta) * ring.radius, Math.sin(theta) * ring.radius, 0]}
          rotation.z={theta}
        >
          <T.BoxGeometry args={[ring.radius * 0.3, ring.radius * 0.06, ring.radius * 0.11]} />
          <T.MeshBasicMaterial color={hue} />
        </T.Mesh>
      {:else}
        <T.Mesh renderOrder={998}>
          <T.CircleGeometry args={[ring.radius, 64, start, sweep]} />
          <T.MeshBasicMaterial
            color={hue}
            transparent
            opacity={active ? 0.25 : 0.13}
            side={THREE.DoubleSide}
            depthTest={false}
            depthWrite={false}
          />
        </T.Mesh>
        <T.Mesh rotation.z={start} renderOrder={999}>
          <T.TorusGeometry args={[ring.radius, ring.radius * 0.012, 8, 96, sweep]} />
          <T.MeshBasicMaterial color={hue} transparent opacity={0.7} depthTest={false} />
        </T.Mesh>
        <T.Mesh
          position={[
            (Math.cos(theta) * ring.radius) / 2,
            (Math.sin(theta) * ring.radius) / 2,
            0,
          ]}
          rotation.z={theta}
          renderOrder={1000}
        >
          <T.BoxGeometry args={[ring.radius, ring.radius * 0.025, ring.radius * 0.025]} />
          <T.MeshBasicMaterial color={hue} depthTest={false} />
        </T.Mesh>
        {#if ring.role === "azimuth"}
          <HTML position={[0, 0, ring.radius * 1.7]} center>
            <div
              class="pointer-events-none rounded-md bg-gray-900/85 px-2 py-1 text-xs font-medium tabular-nums whitespace-nowrap text-white dark:bg-white/90 dark:text-gray-900"
            >
              {#each rings as r (r.pivot.channel)}
                <span style="color: {hueOf(r.pivot.channel)}" class="mr-1 ml-1">
                  {r.role === "azimuth" ? "Az" : "Lat"}
                  {readoutFor(r)}°
                </span>
              {/each}
            </div>
          </HTML>
        {/if}
      {/if}

      <!-- invisible fat hit torus — the raycaster ignores visibility -->
      <T.Mesh
        rotation.z={start}
        visible={false}
        onpointerdown={(event: PickEvent) => startDrag(ring, event)}
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
