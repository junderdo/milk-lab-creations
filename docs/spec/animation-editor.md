# Animation Editor — Build-Ready Spec

Destination artifact of the [3D Animation Editor Spec wayfinder map](https://trello.com/c/MnE5dwlb/35-wayfinder-map-3d-animation-editor-spec).
Every decision below was settled in a resolved ticket (grilling, research, prototype, or task card — full
resolutions live as comments on the Done cards of the Milk Lab Creations Trello board). This document is
self-contained: implementation should not need to reopen any question answered here.

**Scope:** the in-browser editor for robot keyframe animations — editing surface, editor state and
persistence, 3D preview architecture, gallery/detail integration, and the remix flow.

**Out of scope (explicitly decided):**

- Sending animations from the browser to the physical robot (transport, pairing UX).
- Autosave-to-server and versioned saves — rejected in favor of explicit save + local draft.
- Remix counts / browse-remixes-of-this-animation UI.
- Timeline zoom/pan — the full duration is always in view. A zoom feature would be its own future ticket.
- Diff/merge conflict resolution — conflicts resolve by overwrite-or-reload only.

---

## 1. Foundations (already on `main`)

- **Payload contract** — `apps/api/src/payload.ts`. The payload is canonical JSON mirroring the firmware
  keyframe struct: `{ schemaVersion: 1, keyframes: [{ timeMs, angles[4], easeInType, easeOutType,
  easeInMs, easeOutMs }] }`, validated per robot profile (`robo-cat-ears`: 4 channels, angles 0–180 int,
  ease types 0–3, 1–64 keyframes, uint16 ms, non-decreasing times, 32 KB serialized ceiling). The binary
  wire format is derived on demand (`packWireFormat`), never stored. The payload is the single source of
  truth — no second stored format.
- **Firmware easing semantics** — researched from the robo-cat-ears firmware and written up with
  per-type formulas plus a reference TypeScript interpolator in `docs/research/firmware-easing.md`
  (branch `research/firmware-easing`; merge with the editor work). Gist: 0=linear, 1=sine, 2=cubic,
  3=elastic (easings.net formulas); a segment is departure window (progress 0→0.5, shaped by the
  previous keyframe's `easeOutType`) + hold at exactly 0.5 + arrival window (0.5→1, shaped by the next
  keyframe's `easeInType`); over-length windows scale down proportionally; per-channel lerp clamped to
  [0,180] *after* interpolation (elastic overshoots by design); first keyframe applies instantly; last
  keyframe's ease-out and first keyframe's ease-in are unused.
- **Rigged model asset** — `apps/web/static/models/robo-cat-ears.glb` (55k tris, ~760 kB gzipped; serve
  lazily, immutable-cached). Pivot nodes `EarL/R_Azimuth` and `EarL/R_Latitude` carry glTF extras
  `{ channel, axis, neutralDeg: 90 }`; pose = `setFromAxisAngle(axis, deg(angle − 90))`. Rotation sense
  is fully encoded in the baked axis vectors — **no runtime sign factor**. Channel map: 0 = EarL_Azimuth,
  1 = EarL_Latitude, 2 = EarR_Azimuth, 3 = EarR_Latitude; 90 on every channel = as-modeled neutral pose;
  sides are mirrored. Rebuild via `scripts/build-robo-cat-ears-glb.py`; full doc in
  `docs/models/robo-cat-ears-gltf.md`.
- **3D stack** — Threlte 8 (the Svelte 5 generation): `@threlte/core` ^8.5 + `@threlte/extras` ^9.21 +
  `three` ^0.185. `useGltf` resolves the named pivot nodes; drive rotations imperatively in `useTask`
  (`useFrame` no longer exists). Vite needs `ssr: { noExternal: ['three'] }`; browser-gate the Canvas
  (`{#if browser}`). ~150–200 kB gzip added, dominated by three.js — lazy-load the viewer. Full
  write-up: `docs/research/threlte-gltf.md` (branch `research/threlte-gltf`; merge with the editor work).
- **API surface** — `apps/api/src/router.ts`: `animations.list / gallery / mine / byId / wireById /
  create / update / setVisibility / delete`. `create`/`update` validate the payload per robot profile and
  derive `durationMs` / `keyframeCount` server-side. DSQL serialization conflicts retry via
  `apps/api/src/occ.ts` (infrastructure retry — **not** lost-update detection; that guard is new work,
  §5.5). Name: 1–100 chars trimmed; description: ≤1000 chars.
- **Validated pipeline** — the payload → firmware-faithful interpolator → Threlte pose pipeline was
  prototyped end-to-end and judged nearly identical to the physical robot side-by-side (branch
  `prototype/threlte-preview`). The graph-editor timeline interaction model was prototyped and settled
  (branch `prototype/timeline-editor-ux`).

## 2. Preview architecture

One shared **`AnimationViewer`** component in `$lib` (grown from the prototype's `Scene.svelte` +
`interpolator.ts`):

- **Scene layer exists exactly once:** glb load via `useGltf`, pivot resolution from extras, the
  interpolator, and a 120 fps-capped render loop (manual render mode + gated rAF).
- **The seam is the time source:** detail page uses the built-in transport (autoplay + loop, play/pause,
  scrub bar); the editor binds a `currentTimeMs` playhead instead.
- **The interpolator is a pure importable module** — the graph editor draws its curves from the same
  code that poses the 3D model, so what you see in the curves is what the robot does.
- `prefers-reduced-motion`: start paused at the neutral pose.
- Detail viewer gets orbit + zoom (clamped). The raw JSON keyframe dump on the detail page is removed
  once the viewer lands.

**Loading:** viewer chunk lazy-imported eagerly on detail-page mount (not scroll-gated — it is the
page's point). The glb is served per robot from `/models/<robot>.glb` with immutable cache headers. A
fixed-aspect placeholder showing the animation's sparkline holds the space until first frame — no layout
shift, no spinner. (`modulepreload` from gallery cards is a later optimization, not spec-required.)

**Gallery/list cards (`/my`, future public gallery): no live 3D.** Each card renders a payload-derived
curve sparkline (inline SVG drawn from the payload already present in the list query). This avoids WebGL
context limits (~8–16 per page), battery drain, and a thumbnail pipeline — and visually rhymes with the
graph-editor identity.

## 3. Editing surface — the graph timeline

Settled interaction model (prototype Variant B, "Graph editor"):

- **One shared canvas:** all 4 channel curves overlaid on a single 0–180° axis, rendered by the
  firmware-faithful interpolator (midpoint-hold, window scaling, and elastic overshoot visible as
  authored). The full duration always fits the width.
- **Keyframe = column:** shared `timeMs` + ease across all 4 channels, drawn as a vertical line with a
  grip at the top.
- **Drag a channel dot vertically** → set that channel's angle (int, clamped 0–180).
- **Drag the column grip horizontally** → retime the whole column, clamped between neighbor columns
  (order never changes).
- **Click/tap a grip** → select the column and open the **ease popover** beside it (16 px to the right,
  flipping left near the canvas edge — never covering keyframes). Contents: ease out/in type
  (None/Sine/Cubic/Elastic), window ms, delete. First keyframe's ease-in and last keyframe's ease-out
  are disabled as unused.
- **Channel chips** toggle per-curve visibility. **Ruler strip** scrubs. **Play** loops with a live
  4-channel pose readout. **"+ keyframe"** inserts the pose sampled at the playhead.
- Spec note carried from the prototype: C-style numeric inputs for precision entry may be considered
  later — not part of the settled model.

### 3.1 Touch and small screens

**Full editing everywhere.** Touch and viewport size are independent axes and neither removes
capability: touch adapts interaction, narrow viewports adapt layout. No view/scrub-only tier. Accepted
trade: phone-portrait editing is cramped but capable.

- **Gesture ownership:** the canvas is a no-scroll zone (`touch-action: none`); every touch starting
  inside it is an editor gesture. Disambiguation at touchstart by what the finger lands on: dot →
  vertical angle drag; grip → horizontal retime; empty canvas → scrub the playhead (the whole canvas is
  a scrub surface on touch, not just the ruler). No long-press, no tap-then-drag. Multi-touch beyond the
  first finger is ignored; no pinch-zoom.
- **Hit targets:** on coarse pointers (`pointer: coarse` media query), dots get ≥44×44 px hit areas and
  grips ≥44 px-wide strips — enlarged hit areas, near-desktop visuals. Overlapping candidates resolve
  nearest-center-wins; dots beat grips beat scrub when genuinely ambiguous. Hidden channels are excluded
  from hit testing, which makes the channel chips the precision tool for stacked dots. Every touch drag
  shows a floating readout offset above the finger (e.g. "EarL azimuth · 117°", "column @ 840 ms") —
  occlusion fix and wrong-grab alarm in one; wrong grabs are one undo step. Accepted worst case: at high
  column density on a phone, grabbing a specific grip may take a couple of tries — no dedicated density
  mechanism.
- **Ease popover → bottom sheet under ~640 px viewport width** (breakpoint chosen so landscape phones
  also get the sheet). One component, two presentations. Wide viewports — including touch tablets —
  keep the settled popover. Narrow: tap grip → column selected and highlighted → bottom sheet with the
  same contents. The canvas stays live above the sheet (scrub/play without dismissing). Dismissal: tap
  outside, swipe down, or tap another grip to retarget. Window-ms in the sheet: slider + tap-to-type
  numeric value.
- **Canvas geometry on small screens:** full viewport width at ~40–45% viewport height with a ~240 px
  floor (usable drag resolution; guarantees scrollable page chrome around the no-scroll zone). Portrait
  stack: collapsible 3D preview → transport + ruler → canvas → channel chips (≥44 px tall, wrapping,
  adjacent to the canvas). Both orientations supported; landscape may be passively hinted, never a
  blocking rotate screen. Grips stay at the column top.

## 4. Editor state

- **The document is `{ name, description, payload }`** — exactly what `animations.update` accepts. All
  three are buffered in editor state, undoable, drafted, and committed together by one explicit **Save**.
- **Visibility is out-of-band:** a control that fires `animations.setVisibility` immediately with its
  own confirmation — not buffered, not undoable, not drafted. Publishing is consequential and
  non-editorial; Ctrl+Z must never silently unpublish. Accepted, documented inconsistency: everything
  buffers except visibility.

### 4.1 Undo/redo

- **Granularity:** a drag is one step, committed on pointerup (intermediate frames are previews).
  Typing coalesces by pause: one step per burst, new step after ~500 ms idle or on blur. Ease edits step
  individually (type change = 1 step, window-ms drag = 1 step on release) — users A/B ease types via
  undo. View state (playhead, selection, channel show/hide, play/pause) is **never** undoable, though
  undo may move playhead/selection as a side effect to reveal the affected keyframe.
- **Mechanics:** linear history — redo clears on a new edit after undo. Depth cap 100; oldest steps drop
  silently. Shortcuts: Cmd+Z / Shift+Cmd+Z (macOS), Ctrl+Z / Ctrl+Y and Ctrl+Shift+Z (Windows/Linux).
- **Save is not an undo barrier:** the stack survives Save; undoing past a save point simply makes the
  document dirty again.

### 4.2 localStorage drafts

- **Keys:** `milklab:editor-draft:<animationId>`; `milklab:editor-draft:new` for a not-yet-created
  animation (single `new` slot — two tabs composing new animations race it; accepted).
- **Envelope:** `{ draftVersion: 1, document, baseUpdatedAt, savedAt }`. `baseUpdatedAt` is the server
  `updatedAt` the draft was edited on top of (`null` for new). The undo stack is **not** stored.
- **Cadence:** debounced ~1 s after the last document change; flushed immediately on
  `visibilitychange`/`pagehide`. Writes wrapped in try/catch and silently degraded — drafts are a
  convenience layer; explicit Save is the persistence.
- **Lifecycle:** no time-based expiry. A draft is deleted only on successful save or explicit discard.

### 4.3 Draft restore

On editor entry: a draft identical to the server copy — or unparseable, or wrong `draftVersion` — is
deleted silently, no prompt. Otherwise a **blocking dialog before editing begins**: "You have unsaved
changes from ⟨savedAt, humanized⟩" — **Restore draft** / **Discard draft**. No third "keep both" option.
If `baseUpdatedAt` ≠ the server's current `updatedAt`, same two options with escalated copy warning that
the draft predates newer changes; the actual collision is adjudicated at save time (§4.5).

### 4.4 Dirty tracking and navigation guard

- **Dirty = deep-equality comparison** of the current document against the last-saved snapshot (server
  state as of load, refreshed on each successful save) — so undoing back to the save point is clean. A
  brand-new untouched editor is clean.
- Guards: SvelteKit `beforeNavigate` (custom dialog: "You have unsaved changes (kept as a draft on this
  device). **Stay** / **Leave**") and `beforeunload` (native prompt). The durable draft softens the
  dialog copy, not the guard — the draft is device-local best-effort, not a save.

### 4.5 Save and conflict handling

- `animations.update` gains an **optional `expectedUpdatedAt`** input: when present and it does not
  match the row's current `updatedAt`, the mutation rejects with a `CONFLICT` error carrying the current
  server record — no write, no second round-trip needed by the client. The editor always sends it (from
  its last-saved snapshot). Optional, so other callers are unaffected.
- **Conflict UI:** a two-choice dialog — "This animation was changed elsewhere — probably another tab or
  device": **Overwrite** (resend without the guard; my version wins) or **Discard mine, load newest**
  (adopt the server record from the error payload, clear dirty; the surviving undo stack makes even this
  recoverable). No diff/merge. Realistic blast radius is one person in two tabs or on two devices.

### 4.6 Validation UX

Principle: **invalid states are unrepresentable in the editor** — drags clamp live to angle/time bounds,
column order is preserved by construction, the ease popover offers only the 4 valid types, name and
description enforce their length limits at the input (`maxlength`, counter on description). There is no
"invalid document" state to message.

- **Keyframe ceiling:** live counter ("37 / 64 keyframes") in the timeline chrome, sourced per robot
  from `ROBOT_PROFILES` — never hardcoded. Amber styling at ≥87% (56 for robo-cat-ears); at the cap, the
  add-keyframe affordances disable with a tooltip ("This robot supports up to 64 keyframes"). No modal,
  no toast.
- **Empty name blocks Save** with an inline hint (not clampable).
- The 32 KB serialized ceiling is unreachable in practice (64 maxed keyframes ≈ 10 KB); if it ever
  fires, the generic save-error toast covers it.

## 5. Remix flow

Decided in full; **entirely unbuilt** (no `remixedFromId` column, no `animations.remix` mutation on
`main` as of this writing).

- **Rule: viewable = remixable.** Public, unlisted-via-link, and your own (remixing your own doubles as
  duplicate). Same visibility check `byId` already performs.
- **The fork:** full copy of payload, robot, description; default name "Remix of ⟨source name⟩"
  (editable); visibility resets to private; provenance recorded in a new nullable `remixedFromId` column
  (no FK — dangles if the source is deleted; UI shows "original deleted").
- **API:** new authed mutation `animations.remix({ id, name? })` — server verifies viewability, copies
  server-side (payload never round-trips the client), sets `remixedFromId` (unforgeable), enforces
  `MAX_ANIMATIONS_PER_USER`, wrapped in the OCC retry. Eager fork on Remix click; the editor opens the
  new animation. `byId` gains a resolved `remixedFrom { id, name }` when the source is viewable.
- **UI:** detail page and editor header show a "Remixed from ⟨source⟩" link with deleted/private
  fallback; my-animations shows a remix badge; gallery unchanged.

## 6. Routes

Existing: `/` , `/my`, `/animations/[id]`, `/auth/*`. New:

- **`/animations/new`** — editor with an empty/default document; `animations.create` on first Save,
  then replace-state to the edit route. Draft key `milklab:editor-draft:new`.
- **`/animations/[id]/edit`** — editor for an existing animation (owner-only; non-owners are redirected
  to the detail page, where Remix is their edit path).

Both are client-rendered (the editor is interactive; the canvas and viewer are browser-only).

## 7. Implementation work items

Decided here, to be built (roughly dependency-ordered):

1. **API — conflict guard:** optional `expectedUpdatedAt` on `animations.update`; mismatch →
   `CONFLICT` error carrying the current record (§4.5).
2. **API + schema — remix:** `remixedFromId` column (nullable, no FK) + migration; `animations.remix`
   mutation; `remixedFrom` resolution in `byId` (§5).
3. **Merge the research branches** so `docs/research/firmware-easing.md` and
   `docs/research/threlte-gltf.md` land on `main` alongside this spec.
4. **`AnimationViewer` + interpolator in `$lib`**, promoted from the `prototype/threlte-preview`
   branch's `Scene.svelte` / `interpolator.ts` (§2); detail page integration (viewer replaces the JSON
   dump; sparkline placeholder; lazy chunk); sparkline component on `/my` cards.
5. **Editor routes** (§6) with the graph timeline (promoted from `prototype/timeline-editor-ux`),
   editor-bound `AnimationViewer`, editor state per §4 (undo, drafts, dirty guard, save/conflict UI),
   validation UX per §4.6, and touch/small-screen behavior per §3.1.
6. **Remix UI** (§5) and visibility control (§4, out-of-band `setVisibility`).

Building these is a separate effort from this map — items above become their own tickets/cards when
work starts.
