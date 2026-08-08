# Research: Threlte picking, hover, and orbit-vs-gizmo plumbing

Date: 2026-08-08. Sources: threlte.xyz docs and the installed package sources —
`@threlte/extras@9.21.0`, `@threlte/core@8.5.16`, `three@0.185.1` in this repo's
`node_modules` (paths below are relative to `node_modules/`). Verified against the actual
`robo-cat-ears.glb` bytes, not just its docs.

## 1. `interactivity()` plugin vs. a manual Raycaster

### How the plugin works

`interactivity()` (`@threlte/extras/dist/interactivity/index.js`) does three things:

1. **One shared context** (`context.js`): a single `THREE.Raycaster`, a registry of
   interactive objects, and options — `target` (defaults to the canvas wrapper via
   `useDOM().dom`), `compute`, `filter`, `enabled`, `clickDistanceThreshold` (default
   **8 px**), `clickTimeThreshold` (default Infinity), `eventOptions`.
2. **A `<T>` plugin** (`plugin.svelte.js`): any `<T>` component that passes one of the
   event props (`onclick`, `ondblclick`, `onwheel`, `onpointerdown/up/move`,
   `onpointerenter/leave/over/out`, `oncontextmenu`, `onpointermissed`) gets its ref
   registered as an interactive object.
3. **DOM listeners on the target element** (`setupInteractivity.svelte.js`): on each
   pointer/mouse/wheel event it computes NDC coordinates, runs
   `raycaster.intersectObjects(interactiveObjects, true)` (recursive), and dispatches.
   Notable behavior, all verified in source:
   - **Events bubble up the three.js parent chain**: for every hit, it walks
     `hit.object.parent` upward and fires the handlers of every registered ancestor.
     `event.object` is the mesh actually hit; `event.eventObject` is the object the
     handler was registered on. Registering a single handler on the glTF scene root is
     enough to catch clicks on any mesh inside it.
   - **Click = tap, not drag**: `click`/`dblclick`/`contextmenu` only fire if the pointer
     moved ≤ `clickDistanceThreshold` px since `pointerdown` (and within
     `clickTimeThreshold`). An orbit drag that starts on the robot therefore does not
     produce a stray select — this is the tap-vs-drag disambiguation, built in.
   - **Hover bookkeeping**: `pointerenter`/`pointerleave` are derived from `pointermove`
     hits with stable per-object IDs (no flicker when the hit face changes), and DOM
     `pointerleave`/`pointercancel` on the canvas clear all hover state.
   - **`pointermove` is rAF-coalesced** and sub-pixel jitter is dropped, so raycast cost
     is bounded at one-to-two casts per frame while hovering.
   - `stopPropagation()` stops the 3D bubbling; `stopImmediatePropagation()` delegates to
     the native event, "blocking any further DOM listeners (e.g. OrbitControls)"
     (`types.d.ts`, verbatim).

### Interplay with `renderMode="manual"`

- The plugin raycasts on DOM events directly — it needs no render to pick, so manual
  render mode does not affect picking at all.
- The plugin **never calls `invalidate()` or `advance()`** (no reference anywhere in
  `dist/interactivity/`). Visual reactions to hover/click must cause a render themselves.
- Ground truth in `@threlte/core@8.5.16` (`dist/context/fragments/scheduler.svelte.js`):
  `invalidate()` and `advance()` are literally the same operation (both set
  `frameInvalidated = true`), and in `manual` mode the render stage runs whenever
  `frameInvalidated` is set. The only thing `manual` disables versus `on-demand` is
  `useTask`'s `autoInvalidate`. (Older docs phrased manual mode as "invalidate has no
  effect"; the installed source says otherwise — cite the source, not memory.)
- **In `RobotScene.svelte` this is moot anyway**: the scene calls `advance()` from its
  own rAF loop at up to 120 fps continuously, so any hover-highlight state change is
  rendered on the next frame with no extra plumbing.

### Recommendation: use the plugin

A manual Raycaster would re-implement exactly what the plugin ships: NDC computation
against the observed canvas size, hover-set diffing for enter/leave, click-vs-drag delta
tracking, rAF coalescing, and parent-chain dispatch. The plugin costs one raycast per
pointer event over only the registered subtrees (the robot is 5 meshes / 55k triangles —
trivial), and its event objects hand over `intersection.object` which is precisely what
the channel mapping needs. One structural note: `interactivity()` must be called in a
component **inside** `<Canvas>` (it uses Svelte context + `useThrelte`), e.g. at the top
of `RobotScene.svelte`, and only when the editor wants picking.

## 2. Suppressing OrbitControls during a gizmo drag

### What `<OrbitControls>` from @threlte/extras exposes

`dist/components/controls/OrbitControls/OrbitControls.svelte` + `types.d.ts`:

- Its props type is `Props<OrbitControls>` — every property of the three.js
  `OrbitControls` instance can be set as a reactive prop, including **`enabled`**. So
  `<OrbitControls enabled={activeDrag === null} …/>` is the whole API.
- `bind:ref` yields the raw three.js `OrbitControls` instance.
- Sibling/parent components can grab the instance without a ref via the
  **`useOrbitControls()`** hook (`useOrbitControls.js`), backed by the internal
  `useControlsContext` registry that every controls component registers into.
- The component calls `invalidate()` on the controls' `change` event, so orbit updates
  render even in manual mode (see §1).

Three.js `OrbitControls` itself guards every handler with
`if (this.enabled === false) return;` (`three/examples/jsm/controls/OrbitControls.js`),
so flipping `enabled` mid-gesture is safe — the in-flight orbit gesture simply stops.

### The precedent, in both layers

- **three.js**: `TransformControls` maintains a `dragging` flag and dispatches a
  `dragging-changed` event (via its `defineProperty` helper, which emits
  `'<prop>-changed'` on every property write). The canonical three.js pattern is
  `transformControls.addEventListener('dragging-changed', (e) => orbit.enabled = !e.value)`.
- **@threlte/extras**: its own `<TransformControls>` wrapper
  (`dist/components/controls/TransformControls/TransformControls.svelte`) derives an
  `isDragging` state from the controls' change events and runs
  `orbitControls.enabled = !(isDragging && shouldPause)` against the instance from
  `useControlsContext`, restoring `enabled = true` on cleanup — the `autoPauseControls`
  prop. This is exactly the shape our custom ring gizmos should copy: one
  `activeDrag` piece of state, orbit `enabled` derived from it.

For our own gizmos the flow is: ring `onpointerdown` → record the drag (and
`event.stopPropagation()` so the robot underneath doesn't also react) → orbit is disabled
by the derived `enabled` prop → drive the drag from `pointermove` → release on
`pointerup`/`pointercancel`. Two hardening details, both lifted from the three.js
controls sources:

- **Pointer capture**: both `OrbitControls` and `TransformControls` call
  `domElement.setPointerCapture(event.pointerId)` on pointerdown so the gesture survives
  leaving the canvas. Do the same from the ring handler via
  `event.nativeEvent.target.setPointerCapture(event.nativeEvent.pointerId)`, or listen on
  `window` for move/up during a drag.
- Don't rely on `stopImmediatePropagation()` to starve OrbitControls: both listen on the
  same wrapper element and DOM dispatch order follows registration order, which depends
  on mount order. The `enabled` flip is deterministic; use it.

## 3. Hover cursor, highlight, and mesh→channel mapping

### `useCursor`

`dist/hooks/useCursor.svelte.js` returns `{ onPointerEnter, onPointerLeave, hovering }`.
Wire the two callbacks to the interactivity props and read `hovering` for the highlight:

```svelte
const { onPointerEnter, onPointerLeave, hovering } = useCursor('grab')

<T is={someMesh} onpointerenter={onPointerEnter} onpointerleave={onPointerLeave} />
```

It stacks cursors app-wide (last hover wins, restores the previous on leave) and cleans
up on unmount. For the highlight itself, drive an emissive/material tweak from `hovering`
(or our own selected-channel state) — the scene's continuous `advance()` loop renders it
without extra invalidation.

### Mesh→channel mapping — confirmed against the glb

Hierarchy read straight out of `apps/web/static/models/robo-cat-ears.glb`'s JSON chunk
(matches `docs/models/robo-cat-ears-gltf.md`):

```
Headband                              (mesh, no extras)
EarL_Azimuth   {channel: 0, axis, neutralDeg}
├── ServosL    (mesh)
└── EarL_Latitude  {channel: 1, axis, neutralDeg}
    └── EarL   (mesh)
EarR_Azimuth   {channel: 2, …}
├── ServosR    (mesh)
└── EarR_Latitude  {channel: 3, …}
    └── EarR   (mesh)
```

So walking `intersection.object.parent` upward to the nearest node whose `userData`
passes the existing `pivotFrom` validation (`RobotScene.svelte`) yields:

| Hit mesh | Nearest valid pivot | Channel |
| -------- | ------------------- | ------- |
| `EarL`   | `EarL_Latitude`     | 1       |
| `ServosL`| `EarL_Azimuth`      | 0       |
| `EarR`   | `EarR_Latitude`     | 3       |
| `ServosR`| `EarR_Azimuth`      | 2       |
| `Headband` | none → not selectable | — |

Register one handler on the scene root (`<T is={$gltf.scene} onclick={…}>`) — the
plugin's bubbling delivers every mesh hit there with `event.object` set to the mesh, and
the walk-up starts from `event.object` (not `eventObject`). Reuse `pivotFrom` as the
validity test so mapping and posing share one contract. (GLTFLoader may or may not make a
single-primitive node the `Mesh` itself; the walk-up is agnostic to that.)

## 4. Touch and coarse pointers

- The plugin listens to **Pointer Events only** (`pointerdown/up/move/enter/leave/cancel`
  plus `click`/`dblclick`/`contextmenu`/`wheel`), so touch input arrives through the same
  handlers. A tap produces `pointerdown` → `pointerup` → `click`; there is no persistent
  hover on touch, and `pointercancel` (e.g. the browser stealing the gesture) clears all
  hover state.
- **Tap vs. drag**: already handled by `clickDistanceThreshold` (8 px default) — an orbit
  swipe never fires `click`. For coarse pointers a larger threshold can be passed:
  `interactivity({ clickDistanceThreshold: matchMedia('(pointer: coarse)').matches ? 16 : 8 })`.
- The Threlte docs warn the browser may cancel `pointermove` mid-gesture on touch; set
  **`touch-action: none`** on the canvas container. (three.js controls do this themselves:
  `OrbitControls`/`TransformControls` set `domElement.style.touchAction = 'none'` in
  `connect()` — so once `<OrbitControls>` is mounted this is already in effect on the
  wrapper, but the editor should not depend on a side effect of a sibling.)
- **Widened hit targets**: `raycaster.params` thresholds exist only for `Line` and
  `Points` (`three/src/core/Raycaster.js`) — there is no "fatness" knob for meshes. The
  right tool is **invisible fat hit geometry**, and three.js `TransformControls` is the
  precedent: each gizmo has a hidden `picker` group (`picker.visible = false`, never
  rendered) with oversized geometry — the rotate picker is a torus with tube radius 0.1
  vs. 0.0075 for the visible ring (13×) — raycast explicitly. This works because
  `Raycaster.intersectObjects` **does not test visibility** (verified in
  `Raycaster.js` `intersect()`), and Threlte's `getHits` adds no visibility filter
  either. In Threlte terms: give each ring an invisible child mesh
  (`<T.Mesh visible={false}>` with a fat `TorusGeometry`) carrying the pointer handlers.
- Overlapping fat targets (both ears' rings under one thumb) are resolved by the
  raycaster's near-to-far ordering by default; if that ever picks wrong, the
  `interactivity({ filter })` option is the 3D analog of the repo's 2D nearest-centre
  policy in `apps/web/src/lib/animation/hit-test.ts` — one central place that reorders or
  drops hits, instead of per-object fights.

## Recommendation

Use **`interactivity()` from @threlte/extras**, called at the top of the scene component
when the editor needs picking — not a manual Raycaster. Register a single handler set on
the glTF scene root and map `event.object` → channel by walking `.parent` to the nearest
`pivotFrom`-valid node (confirmed correct against the glb: EarL→1, ServosL→0, EarR→3,
ServosR→2, Headband→none). Manual render mode is a non-issue: picking is event-driven,
and this scene already advances every frame.

For the gizmos, copy the extras `<TransformControls>` pattern rather than adopting the
component: one `activeDrag` state, `<OrbitControls enabled={activeDrag === null}>` (its
props map 1:1 onto the three.js instance; `bind:ref` / `useOrbitControls()` for
imperative access), `stopPropagation()` + `setPointerCapture` on ring pointerdown, and
release on `pointerup`/`pointercancel`. Hover = `useCursor('grab')` wired to
`onpointerenter`/`onpointerleave` plus an emissive highlight driven by its `hovering`
store. For touch, put `touch-action: none` on the canvas container, widen
`clickDistanceThreshold` on coarse pointers, and give each ring an invisible fat torus
child as its real hit target — the TransformControls picker trick, which the raycaster
supports because it ignores visibility.

## Source links

- `node_modules/@threlte/extras/dist/interactivity/{index,context,setupInteractivity.svelte,plugin.svelte,defaults.svelte}.js`, `types.d.ts` (v9.21.0)
- `node_modules/@threlte/extras/dist/hooks/useCursor.svelte.js` (v9.21.0)
- `node_modules/@threlte/extras/dist/components/controls/{OrbitControls/OrbitControls.svelte,OrbitControls/useOrbitControls.js,TransformControls/TransformControls.svelte,useControlsContext.js}` (v9.21.0)
- `node_modules/@threlte/core/dist/context/fragments/{scheduler.svelte,renderer.svelte}.js` (v8.5.16)
- `node_modules/three/examples/jsm/controls/{OrbitControls,TransformControls}.js`, `node_modules/three/src/core/Raycaster.js` (v0.185.1)
- https://threlte.xyz/docs/reference/extras/interactivity
- https://threlte.xyz/docs/reference/extras/use-cursor
- `apps/web/static/models/robo-cat-ears.glb` (JSON chunk parsed directly), `docs/models/robo-cat-ears-gltf.md`, `apps/web/src/lib/components/animation-viewer/RobotScene.svelte`, `apps/web/src/lib/animation/hit-test.ts`
