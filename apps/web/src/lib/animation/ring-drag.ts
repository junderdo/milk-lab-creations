/**
 * The math of dragging a rotation-ring gizmo, kept away from the scene.
 *
 * Everything here is a pure value transform: a grab builds a `RingDrag`, each
 * pointer move feeds it a ray and gets back the next drag state with the servo
 * value it implies. The scene component owns pointers, raycasting into a
 * `THREE.Ray`, and handing degrees to the editor — this module owns which
 * angle a ray means, so the rules that make a ring feel right (per-move
 * clamping, seam wrapping, the edge-on fallback) are testable in node.
 *
 * The mapping is the one settled in `docs/research/ring-drag-mechanics.md`:
 * incremental angle in the ring's rotation plane with wrapped per-move deltas
 * and a clamp on every move, falling back to TransformControls' screen-tangent
 * mapping for the whole drag when the ring is grabbed near edge-on.
 */

import * as THREE from "three";

/** Wrap into [-π, π): pointer events far outpace a π sweep, so a wrapped delta never spans the arc gap. */
export function wrapToPi(rad: number): number {
  const twoPi = 2 * Math.PI;
  return ((((rad + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
}

/** Ring-local radians of a servo value — ring angle = value − neutral, no sign factor. */
export function ringAngleRad(valueDeg: number, neutralDeg: number): number {
  return THREE.MathUtils.degToRad(valueDeg - neutralDeg);
}

/** Where the drawn arc begins: servo 0, as a ring angle. */
export function arcStartRad(neutralDeg: number): number {
  return ringAngleRad(0, neutralDeg);
}

/** How far the drawn arc sweeps: the servo's whole range. */
export function arcSweepRad(maxAngleDeg: number): number {
  return THREE.MathUtils.degToRad(maxAngleDeg);
}

/** A ring grabbed within ~15° of edge-on: in-plane angles degenerate, fall back. */
export const TANGENT_FALLBACK_DOT = 0.25;

/** TransformControls' rotate gain — radians per world unit, scaled by camera distance. */
const TANGENT_GAIN = 20;

interface DragCommon {
  /** The rotation plane (plane mode) or the camera-facing plane (tangent mode). */
  readonly plane: THREE.Plane;
  /** The servo value this drag currently implies, clamped every move. */
  readonly value: number;
}

interface PlaneDrag extends DragCommon {
  readonly mode: "plane";
  readonly center: THREE.Vector3;
  readonly u: THREE.Vector3;
  readonly v: THREE.Vector3;
  readonly thetaPrev: number;
}

interface TangentDrag extends DragCommon {
  readonly mode: "tangent";
  readonly grabPoint: THREE.Vector3;
  readonly grabValue: number;
  readonly tangent: THREE.Vector3;
  readonly gain: number;
}

export type RingDrag = PlaneDrag | TangentDrag;

export interface RingGrab {
  /** The pivot's world position. */
  center: THREE.Vector3;
  /** The pivot's world-space rotation axis, unit length. */
  axis: THREE.Vector3;
  /** Where on the ring the pointer landed, world space. */
  grabPoint: THREE.Vector3;
  cameraPosition: THREE.Vector3;
  /** The servo value at grab time, degrees. */
  value: number;
}

/**
 * Decide the mapping once — the camera does not move mid-drag, so one gesture
 * keeps one mapping.
 */
export function startRingDrag(grab: RingGrab): RingDrag {
  const eye = grab.center.clone().sub(grab.cameraPosition).normalize();

  if (Math.abs(grab.axis.dot(eye)) < TANGENT_FALLBACK_DOT) {
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(eye, grab.center);
    return {
      mode: "tangent",
      plane,
      value: grab.value,
      grabPoint: plane.projectPoint(grab.grabPoint, new THREE.Vector3()),
      grabValue: grab.value,
      tangent: grab.axis.clone().cross(eye).normalize(),
      gain: TANGENT_GAIN / grab.cameraPosition.distanceTo(grab.center),
    };
  }

  // Any in-plane basis works: only deltas of atan2 are used, so the zero point
  // cancels. v = axis × u makes theta right-handed about the axis, which is
  // what keeps ring angle = servo value − neutral with no sign factor.
  const u = arbitraryPerpendicular(grab.axis);
  const v = grab.axis.clone().cross(u);
  const p = grab.grabPoint.clone().sub(grab.center);
  return {
    mode: "plane",
    plane: new THREE.Plane().setFromNormalAndCoplanarPoint(grab.axis.clone(), grab.center),
    value: grab.value,
    center: grab.center.clone(),
    u,
    v,
    thetaPrev: Math.atan2(p.dot(v), p.dot(u)),
  };
}

/**
 * Feed the drag one pointer ray; get back the drag with the value it implies.
 *
 * The clamp runs on every move — when the pointer sweeps past an arc end the
 * value pins there, and the moment it reverses the value follows immediately
 * instead of unwinding banked overshoot.
 */
export function moveRingDrag(drag: RingDrag, ray: THREE.Ray, maxAngleDeg: number): RingDrag {
  const hit = ray.intersectPlane(drag.plane, new THREE.Vector3());
  if (hit === null) return drag;

  if (drag.mode === "plane") {
    const p = hit.sub(drag.center);
    const theta = Math.atan2(p.dot(drag.v), p.dot(drag.u));
    const delta = wrapToPi(theta - drag.thetaPrev);
    const value = clamp(drag.value + THREE.MathUtils.radToDeg(delta), maxAngleDeg);
    return { ...drag, thetaPrev: theta, value };
  }

  const deltaRad = hit.sub(drag.grabPoint).dot(drag.tangent) * drag.gain;
  const value = clamp(drag.grabValue + THREE.MathUtils.radToDeg(deltaRad), maxAngleDeg);
  return { ...drag, value };
}

function clamp(value: number, maxAngleDeg: number): number {
  return THREE.MathUtils.clamp(value, 0, maxAngleDeg);
}

function arbitraryPerpendicular(axis: THREE.Vector3): THREE.Vector3 {
  // whichever world axis is least aligned gives a stable cross product
  const helper =
    Math.abs(axis.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  return helper.cross(axis).normalize();
}
