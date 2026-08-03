# robo-cat-ears rigged glTF

`apps/web/static/models/robo-cat-ears.glb` — the 3D model the animation editor's
preview drives. Built from the CAD STL exports by
`scripts/build-robo-cat-ears-glb.py` (see its header for the rebuild command).

- Source STLs (not in repo): `C:\Users\jeffu\Projects\cat-ears-3d-print\3d exports for animation editor`
  (5 parts exported in assembled/global coordinates, mm, Z-up).
- glb is Y-up, meters, 5 meshes, 55k triangles total, ~1.32 MB (≈760 kB gzipped).
  Serve lazily; don't bundle.

## Node hierarchy

```
Headband                      (static mesh)
EarL_Azimuth                  (pivot node, channel 0)
├── ServosL                   (mesh: both MG90S glued, swivels with azimuth)
└── EarL_Latitude             (pivot node, channel 1)
    └── EarL                  (mesh)
EarR_Azimuth                  (pivot node, channel 2)
├── ServosR                   (mesh)
└── EarR_Latitude             (pivot node, channel 3)
    └── EarR                  (mesh)
```

## Channel map (firmware `robo-cat-ears/main/servo.h`)

| Channel | Node | Motion | Firmware semantics |
|---|---|---|---|
| 0 | `EarL_Azimuth` | left ear swivel about its mount axis | 40 = leftward/outboard, 90 = center |
| 1 | `EarL_Latitude` | left ear tilt along the band | 80 = up, 90 = center |
| 2 | `EarR_Azimuth` | right ear swivel | 140 = rightward/outboard, 90 = center |
| 3 | `EarR_Latitude` | right ear tilt | 100 = up, 90 = center |

Zero pose: **90 on every channel = the as-modeled pose** (how the meshes sit in
the file with no rotations applied).

## Driving the rig

Each `*_Azimuth` / `*_Latitude` node carries glTF `extras` (surfaced by three.js
as `object.userData`):

```json
{ "channel": 0, "axis": [0.625923, 0.779884, -0.0], "neutralDeg": 90 }
```

`axis` is the rotation axis as a unit vector in the node's **parent** space
(glTF Y-up). Pose a node from a payload angle with:

```ts
node.quaternion.setFromAxisAngle(
  new Vector3(...node.userData.axis),
  THREE.MathUtils.degToRad(angleDeg - node.userData.neutralDeg) * sign,
);
```

**`sign` is unvalidated (+1 as built).** The rig geometry is verified (mirrored
poses render correctly), but whether angle > 90 maps to the same physical
direction as the firmware needs one visual check against the real robot —
scheduled for the "Prototype: Threlte preview driven by the interpolator"
ticket. If a direction is inverted, flip that node's sign in the viewer (or
negate `axis` in the build script and rebuild).

## Provenance of the pivots

The MG90S output shaft is coaxial with the rounded end of its case (r = 6.05 mm).
The build script recovers each shaft axis by cylinder-fitting those case ends
(≥99 % inliers, left/right mirror-match within 1° / 0.3 mm):

- Azimuth axis: ~39° from vertical, pointing up-and-outboard; its line meets the
  headband at the band end tip — the mount.
- Latitude axis: orthogonal, tangent to the band, offset 12.1 mm (one servo
  body width — the two servos are glued back-to-back).
- Pivot points (CAD mm, Z-up): cylinder-fitted to azimuth (±109.2, ~2.9, 43.6)
  and latitude (±109.2, ~15.0, 43.6), then shifted by manual corrections
  dialed in visually against the physical robot in the Threlte preview
  prototype (`AZ_PIVOT_CORRECTION_MM` / `LAT_PIVOT_CORRECTION_MM` in the
  build script): azimuth +9.0 back, +12.5 up; latitude −13.0 forward-along-ear,
  +1.0 up. Final: azimuth (±109.2, ~11.9, 56.1); latitude (±109.2, ~2.0, 44.6).
