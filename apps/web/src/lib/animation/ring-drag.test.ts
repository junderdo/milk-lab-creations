/**
 * The ring gizmo's pointer→angle mapping as pure geometry: build a drag from a
 * grab, feed it rays, read the servo value. No DOM, no Threlte — the scene
 * component owns raycasting the pointer into a THREE.Ray and nothing else.
 *
 * Expected values are worked examples: a ray straight down the +Z axis onto a
 * ring in the XY plane rotates by the angle it subtends, so the numbers can be
 * checked by hand.
 */

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { arcStartRad, arcSweepRad, ringAngleRad, startRingDrag, moveRingDrag, wrapToPi } from "./ring-drag";

const MAX_ANGLE = 180;

/** A ring in the XY plane at the origin, grabbed while the camera looks straight down +Z. */
function faceOnDrag(grabRingAngleRad = 0, value = 90) {
  return startRingDrag({
    center: new THREE.Vector3(0, 0, 0),
    axis: new THREE.Vector3(0, 0, 1),
    grabPoint: new THREE.Vector3(Math.cos(grabRingAngleRad), Math.sin(grabRingAngleRad), 0),
    cameraPosition: new THREE.Vector3(0, 0, 5),
    value,
  });
}

/** A ray from the face-on camera through the ring point at `ringAngle`. */
function rayAt(ringAngle: number): THREE.Ray {
  return new THREE.Ray(
    new THREE.Vector3(Math.cos(ringAngle), Math.sin(ringAngle), 5),
    new THREE.Vector3(0, 0, -1),
  );
}

const deg = THREE.MathUtils.degToRad;

describe("wrapToPi", () => {
  it("leaves small deltas alone", () => {
    expect(wrapToPi(0)).toBe(0);
    expect(wrapToPi(Math.PI / 4)).toBeCloseTo(Math.PI / 4, 10);
    expect(wrapToPi(-Math.PI / 4)).toBeCloseTo(-Math.PI / 4, 10);
  });

  it("wraps a delta that crossed the atan2 seam back into range", () => {
    expect(wrapToPi(3.5 * Math.PI)).toBeCloseTo(-0.5 * Math.PI, 10);
    expect(wrapToPi(-3.5 * Math.PI)).toBeCloseTo(0.5 * Math.PI, 10);
  });
});

describe("a face-on ring drag", () => {
  it("uses the in-plane mapping when the ring faces the camera", () => {
    expect(faceOnDrag().mode).toBe("plane");
  });

  it("moves the value by the angle the pointer swept, right-handed about the axis", () => {
    const moved = moveRingDrag(faceOnDrag(), rayAt(deg(10)), MAX_ANGLE);
    expect(moved.value).toBeCloseTo(100, 6);
    expect(moveRingDrag(moved, rayAt(deg(-20)), MAX_ANGLE).value).toBeCloseTo(70, 6);
  });

  it("pins at the limit and responds instantly on reversal — no windup", () => {
    // 90 + 120 would be 210: pinned at 180. The overshoot must not bank.
    const pinned = moveRingDrag(faceOnDrag(), rayAt(deg(120)), MAX_ANGLE);
    expect(pinned.value).toBe(180);
    expect(moveRingDrag(pinned, rayAt(deg(110)), MAX_ANGLE).value).toBeCloseTo(170, 6);
  });

  it("crosses the atan2 seam without the value jumping", () => {
    const nearSeam = faceOnDrag(deg(175));
    expect(moveRingDrag(nearSeam, rayAt(deg(185)), MAX_ANGLE).value).toBeCloseTo(100, 6);
  });

  it("ignores a ray that misses the rotation plane", () => {
    const drag = faceOnDrag();
    const parallel = new THREE.Ray(new THREE.Vector3(0, 0, 5), new THREE.Vector3(1, 0, 0));
    expect(moveRingDrag(drag, parallel, MAX_ANGLE)).toBe(drag);
  });
});

describe("an edge-on ring drag", () => {
  // camera on +X, ring still in the XY plane: the axis is perpendicular to the
  // eye, so in-plane angles would be grazing — the whole drag uses the
  // screen-tangent mapping instead
  function edgeOnDrag(value = 90) {
    return startRingDrag({
      center: new THREE.Vector3(0, 0, 0),
      axis: new THREE.Vector3(0, 0, 1),
      grabPoint: new THREE.Vector3(0, 1, 0),
      cameraPosition: new THREE.Vector3(5, 0, 0),
      value,
    });
  }

  /** A ray from the edge-on camera hitting its camera-facing plane at (0, y, 0). */
  function edgeRayAt(y: number): THREE.Ray {
    return new THREE.Ray(new THREE.Vector3(5, y, 0), new THREE.Vector3(-1, 0, 0));
  }

  it("falls back to the tangent mapping near edge-on", () => {
    expect(edgeOnDrag().mode).toBe("tangent");
  });

  it("scales displacement along the screen tangent by 20 / camera distance", () => {
    // eye = (-1,0,0), tangent = axis × eye = (0,-1,0); moving -0.1 along Y is
    // +0.1 along the tangent, × gain 20/5 = 0.4 rad ≈ 22.918°
    const moved = moveRingDrag(edgeOnDrag(), edgeRayAt(0.9), MAX_ANGLE);
    expect(moved.value).toBeCloseTo(90 + THREE.MathUtils.radToDeg(0.4), 4);
  });

  it("measures from the grab, not cumulatively, and still clamps", () => {
    const overshot = moveRingDrag(edgeOnDrag(), edgeRayAt(-5), MAX_ANGLE);
    expect(overshot.value).toBe(180);
    // back to a displacement worth +22.918°: the value follows the pointer home
    const back = moveRingDrag(overshot, edgeRayAt(0.9), MAX_ANGLE);
    expect(back.value).toBeCloseTo(90 + THREE.MathUtils.radToDeg(0.4), 4);
  });
});

describe("arc geometry", () => {
  it("spans the servo range about the neutral pose", () => {
    // servo 0..180 with neutral 90: ring angles -90°..+90°
    expect(arcStartRad(90)).toBeCloseTo(-Math.PI / 2, 10);
    expect(arcSweepRad(180)).toBeCloseTo(Math.PI, 10);
  });

  it("puts the marker at the ring angle of the servo value", () => {
    expect(ringAngleRad(90, 90)).toBe(0);
    expect(ringAngleRad(180, 90)).toBeCloseTo(Math.PI / 2, 10);
    expect(ringAngleRad(0, 90)).toBeCloseTo(-Math.PI / 2, 10);
  });
});
