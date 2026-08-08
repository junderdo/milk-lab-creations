/**
 * The rig contract carried in the glb: pivot nodes with `{ channel, axis,
 * neutralDeg }` extras. Posing and picking both resolve meshes against this
 * one validation, so what lights up on hover is exactly what a drag would turn.
 */

import * as THREE from "three";

/** A rig joint: which channel drives it, and the axis it turns about. */
export interface Pivot {
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
export function pivotFrom(node: THREE.Object3D): Pivot | null {
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
