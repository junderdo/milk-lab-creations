# Ring-drag math and auto-key undo mechanics

Research ticket: pin down the pointer→angle mapping for rotation-ring gizmos on
the robot's ear pivots, the clamping rule against `RobotLimits`, and how a drag
that auto-inserts a keyframe at the playhead closes as one undo step with the
existing `editor/` state machinery.

## Sources

- three.js `0.185.1` (installed): `node_modules/three/examples/jsm/controls/TransformControls.js`
  (pnpm store path `node_modules/.pnpm/three@0.185.1/node_modules/three/examples/jsm/controls/TransformControls.js`).
  Same file upstream: https://github.com/mrdoob/three.js/blob/r185/examples/jsm/controls/TransformControls.js
- This repo:
  - `apps/web/src/lib/editor/document.ts` — `setAngle`, `addKeyframeAt`, `RobotLimits`
  - `apps/web/src/lib/editor/history.ts` — `DocumentHistory`, `EditIntent`
  - `apps/web/src/lib/editor/editor-state.ts` — `AnimationEditor`
  - `apps/web/src/lib/components/animation-timeline/AnimationTimeline.svelte` — the `drag()` helper
  - `apps/web/src/lib/components/animation-viewer/RobotScene.svelte` — pivot posing
  - `docs/models/robo-cat-ears-gltf.md` — pivot `userData` contract

## How TransformControls maps a rotate drag (r185)

Three moving parts, all in `TransformControls.js`:

**The interaction plane is camera-facing, not the rotation plane.** In rotate
mode `TransformControlsPlane.updateMatrixWorld` takes the "special case for
rotate" branch (`_dirVector.set(0,0,0)`, ~line 1979) and orients the invisible
picking plane parallel to the camera (`this.quaternion.copy(this.cameraQuaternion)`,
~line 1990). Every pointer sample is a raycast into *that* plane;
`pointStart`/`pointEnd` are the intersection points minus the gizmo's world
position (`pointerDown` ~line 500, `pointerMove` ~line 535). Because the plane
always faces the camera, the raycast never degenerates no matter how the ring
is oriented — this is the load-bearing trick.

**Per-axis rings (X/Y/Z) use a linear tangent projection, not an angle.**
In `pointerMove`'s rotate branch (lines 695–765):

```js
this._offset.copy( this.pointEnd ).sub( this.pointStart );
const ROTATION_SPEED = 20 / this.worldPosition.distanceTo( camera position );
// axis 'X' | 'Y' | 'Z':
_tempVector.copy( _unit[ axis ] );              // world-space if space === 'local'
_tempVector.cross( this.eye );                  // screen-space tangent of the ring
this.rotationAngle = this._offset.dot( _tempVector.normalize() ) * ROTATION_SPEED;
```

So the rotation angle is the **accumulated pointer displacement projected onto
the ring's screen-space tangent direction (`axis × eye`), scaled linearly** by
`20 / cameraDistance` radians per world unit. It is *relative* — the pointer
does not stay glued to the point on the ring it grabbed — and the gain is a
tuning constant, not geometry.

**Edge-on vs. face-on.** `axis × eye` has *maximum* length when the ring is
edge-on (axis perpendicular to the view), so the tangent mapping is perfectly
stable exactly where an angle-in-the-rotation-plane projection would blow up
(grazing ray–plane intersections, wild angle swings). The degenerate case is
the opposite one — ring **face-on**, axis parallel to the eye, cross product
zero (checked at line 723) — and then it falls back to true in-plane rotation,
the same math the screen-space `E` ring uses (lines 736–746):

```js
this.rotationAngle = this.pointEnd.angleTo( this.pointStart );
this.rotationAngle *= ( this._endNorm.cross( this._startNorm ).dot( this.eye ) < 0 ? 1 : - 1 );
```

i.e. the signed angle between the grab vector and the current vector around the
eye axis — an absolute mapping, but only used when the ring's plane coincides
with the picking plane, where it is exact.

### Ray-plane projection vs. screen-space delta, for a limited arc

| | Ray→rotation-plane angle | Tangent / screen-space delta (TransformControls) |
| --- | --- | --- |
| Pointer↔handle correspondence | Absolute — pointer tracks the grabbed point on the ring | Relative — gain constant, handle drifts from pointer |
| Face-on ring | Exact and ideal | Degenerate (needs the in-plane fallback) |
| Edge-on ring | Unusable — grazing intersection, huge unstable angles | Stable, this is its best case |
| Clamping to an arc | Natural: angle is absolute, clamp is pure | Needs an accumulator; clamp the accumulator |
| Arc-gap discontinuity | Must be handled (atan2 seam, gap crossing) | Never crossed — deltas are small and continuous |

For our rings the arc is *limited* (servo range 0–180° → at most a half-circle
of ring, `ROBOT_PROFILES["robo-cat-ears"].maxAngle = 180` in
`apps/api/src/limits.ts:19`) and drags clamp, so absolute correspondence
matters less than continuity: what must never happen is the value jumping
between min and max because the pointer wandered across the arc's gap.

**Recommendation: incremental angle in the rotation plane, accumulated as
deltas and clamped every move, with TransformControls' tangent mapping as the
edge-on fallback.** Concretely, per drag:

1. **Grab** (`pointerdown` on the ring): raycast onto the ring's rotation plane
   (plane through the pivot's world position, normal = the pivot's world-space
   `axis` from `userData` — `RobotScene.svelte:116-127`). Build a fixed
   in-plane basis `(u, v = axis × u)` and take
   `θ = atan2(p·v, p·u)` for the intersection `p` relative to the pivot.
   Right-handed about `axis` matches `quaternion.setFromAxisAngle(axis,
   deg2rad(value − neutralDeg))` (`RobotScene.svelte:200-203`), so ring angle
   and servo value share a sign with no per-node factor. Record `θ_prev = θ`
   and seed the working value from the document.
2. **Move**: recompute `θ`, take `Δ = wrapToPi(θ − θ_prev)`, `θ_prev = θ`,
   and apply `value = clamp(value + rad2deg(Δ), 0, maxAngle)` (the clamp is
   `setAngle`'s, see below). Wrapping each delta into `(−π, π]` makes the atan2
   seam invisible; pointer events arrive far more often than the pointer can
   sweep π, so a single delta never spans the arc gap.
3. **Edge-on guard**: at `pointerdown`, if `|axis · eye| < 0.25` (ring within
   ~15° of edge-on), use the TransformControls tangent mapping for the whole
   drag instead: raycast the camera-facing plane through the pivot, and per
   move `Δ = ((p − p_grab) · normalize(axis × eye)) × 20 / cameraDistance`
   applied to the grab-time value, then clamped. Deciding once per drag keeps
   one mapping per gesture; the camera doesn't move mid-drag.

Incremental-with-wrap keeps the absolute-mapping feel where the ring is
readable (the value under the pointer is where the pointer is, modulo clamping)
while inheriting the delta scheme's immunity to the gap discontinuity.

## Clamping rule

Two layers, and only one of them is new:

- **Value clamp** — already exists. `setAngle` clamps to
  `[0, limits.maxAngle]` and rounds to integer degrees
  (`apps/web/src/lib/editor/document.ts:206-219`). The ring hands it raw
  degrees; validity by construction, per the module's contract.
- **Accumulator clamp** — the ring's own working value clamps *every move*
  (step 2 above), not just at hand-off. This is the anti-windup rule: when the
  pointer sweeps past an arc end, the value pins at that end, and the moment
  the pointer reverses the value moves again immediately. Without it the
  accumulator keeps winding past the limit and the user has to unwind dead
  travel before the ring responds.

The arc-gap case falls out for free: because only wrapped per-move deltas are
applied and each is far smaller than the gap, there is no path from max to min
that doesn't pass back through the arc — the value can never jump ends. (The
alternative — absolute angle snapped to the nearest arc end when the pointer
is in the gap, split at the gap's midpoint — is only needed by absolute
mappings, and its midpoint split is exactly the discontinuity we avoid.)

Render the arc itself from the same numbers: sweep
`deg2rad(0 − neutralDeg) … deg2rad(maxAngle − neutralDeg)` about `axis`, so the
drawn arc, the clamp, and the pose math can't disagree.

## Auto-key + drag as one undo step

How the pieces work today:

- `DocumentHistory.record` pushes the *before* document once when a step opens,
  then only moves the current document while `extendsStep` says the incoming
  `EditIntent` extends the pending one (`history.ts:92-105`). Two `gesture`
  intents extend iff their `id`s match; an `immediate` intent never extends
  anything and nothing extends it (`history.ts:56-63`).
- `AnimationEditor.setAngle` records a gesture with id
  `` `angle:${index}:${channel}` `` (`editor-state.ts:286-291`);
  `AnimationEditor.addKeyframeAt` hard-codes `{ kind: "immediate" }`
  (`editor-state.ts:305-307`).
- The timeline's `drag()` helper (`AnimationTimeline.svelte:208-246`) tracks one
  pointer by id, suppresses sub-slop movement, and calls `onEnd` once on
  release; `dragDot` feeds `setAngle` per move and `oncommit` on release, which
  the screen wires to `editor.editCommitted()`
  (`AnimationEditorScreen.svelte:755,760`). That is the existing
  one-drag-one-step pattern the ring should mirror.

**Verdict: the sequence "auto-insert at playhead, then setAngle per move,
commit on release" does NOT collapse to one step as-is.** The insert records an
`immediate` step; the first `setAngle` then opens a *second* (gesture) step,
because `extendsStep(immediate, gesture)` is false. Undo would take two
Ctrl+Zs: first back to the freshly inserted (interpolated, untouched) keyframe,
then back to no keyframe.

**Smallest extension: one optional parameter on one method.** Change
`AnimationEditor.addKeyframeAt` (`editor-state.ts:305`) to

```ts
addKeyframeAt(timeMs: number, intent: EditIntent = { kind: "immediate" }): AnimationEditor
```

and have the ring drag pass the same gesture id its `setAngle` calls will use:
`{ kind: "gesture", id: `angle:${index}:${channel}` }`, with
`index = insertionIndexFor(keyframes, playheadMs)` (`document.ts:270-273`)
computed before the insert. Then `record` pushes the pre-insert document as the
step's *before*, every subsequent `setAngle` with the matching id extends the
same pending step, and `editCommitted()` on release closes it — one undo step
that removes both the angle change and the auto-keyed frame. No changes to
`history.ts` or `document.ts`; the existing add-keyframe button keeps its
default `immediate` behavior.

Composition details that already behave correctly:

- **Drag ends where it started**: `DocumentHistory.committed` drops a step only
  when the current document equals the pushed *before* (`history.ts:114-119`).
  With an auto-key the documents differ (the keyframe exists), so the insert
  survives as one undoable step even if the angle returns to its seed — right,
  since a keyframe was in fact created.
- **Seeded from the interpolated pose**: `addKeyframeAt` samples the pose at
  `timeMs` (`document.ts:312-327`), so until the first `setAngle` lands the
  motion is unchanged — the auto-key is a place to edit, not an edit.
- **Keyframe cap**: at `maxKeyframes` the insert returns the document unchanged
  and `edited()` short-circuits on identity (`editor-state.ts:174-182`); the
  ring should disable auto-key drags at the cap the same way the timeline
  disables its affordance.
- **Tap ≠ auto-key**: perform the insert lazily in the first `onMove` (the
  `drag()` helper already withholds `onMove` until the slop is crossed), so a
  tap on a ring inserts nothing.
- **Index stability**: nothing retimes during a ring drag, so the inserted
  index — and with it the gesture id — is stable for the gesture's lifetime.

## Decisions

- **Pointer→angle algorithm**: raycast the ring's rotation plane; per-move
  incremental angle `Δ = wrapToPi(θ − θ_prev)` from `atan2` in a fixed in-plane
  basis, right-handed about the pivot's `axis` so ring angle = servo value −
  `neutralDeg` with no sign factor. When `|axis · eye| < 0.25` at grab time,
  fall back for the whole drag to TransformControls' mapping: displacement in a
  camera-facing plane projected onto `normalize(axis × eye)`, scaled by
  `20 / cameraDistance`.
- **Clamping rule**: clamp the accumulated value to `[0, maxAngle]` on every
  move (no windup — reversal responds instantly), then hand raw degrees to
  `setAngle`, whose own clamp+round is the document invariant. Wrapped per-move
  deltas make a min↔max jump across the arc gap impossible by construction.
- **Undo/auto-key composition**: not one step with today's code — the fix is an
  optional `intent` parameter on `AnimationEditor.addKeyframeAt`, passed as the
  same `gesture` id the drag's `setAngle` calls use; commit with
  `editCommitted()` on release. One Ctrl+Z then removes the drag and the
  auto-keyed frame together.
