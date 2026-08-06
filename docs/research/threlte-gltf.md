# Research: Threlte + Svelte 5 + glTF pipeline fitness

Date: 2026-08-03. Sources: threlte.xyz docs, npm registry, bundlephobia. Verified against
live registry data (`npm view`) on this date — not answered from memory.

## 1. Packages and versions (Svelte 5 / SvelteKit 2 compatible)

Threlte 8 is the Svelte 5 generation of Threlte (rewritten around runes, events replaced by
callback props). Current published versions as of 2026-08-03:

| Package           | Version   | Peer deps                    | Notes                                   |
| ----------------- | --------- | ---------------------------- | --------------------------------------- |
| `@threlte/core`   | `8.5.16`  | `svelte >=5`, `three >=0.160` | Last modified 2026-05-25                |
| `@threlte/extras` | `9.21.0`  | `svelte >=5`, `three >=0.160` | `useGltf`, loaders, helpers             |
| `three`           | `0.185.1` | —                            | `@types/three` is `0.185.3`             |

Install for `apps/web`:

```bash
pnpm --filter @milklab/web add three @threlte/core @threlte/extras
pnpm --filter @milklab/web add -D @types/three
```

Optional: `@threlte/gltf` is a CLI (giulio-derived `gltfjsx` port) that converts a `.glb`
into a typed Threlte component — useful once the model is stable, not required.

## 2. Loading a rigged glTF and driving named node rotations per frame

- Loader hook: `useGltf` from `@threlte/extras` — returns a store exposing `nodes`
  (all named objects, **including bones/armature nodes of a rigged model**) and `materials`.
- Per-frame hook: `useTask` from `@threlte/core`. This is Threlte 8's replacement for the
  old `useFrame` — `useFrame` no longer exists in v8. Signature: `useTask((delta) => {...})`,
  with optional key/stage/ordering options (`before`/`after`, `autoInvalidate`).
- Both hooks must run in a component **inside `<Canvas>`** (Threlte uses Svelte context).

Minimal sketch:

```svelte
<!-- Viewer.svelte (page-level wrapper) -->
<script lang="ts">
  import { Canvas } from '@threlte/core'
  import Scene from './Scene.svelte'
</script>

<Canvas>
  <Scene />
</Canvas>
```

```svelte
<!-- Scene.svelte -->
<script lang="ts">
  import { T, useTask } from '@threlte/core'
  import { useGltf } from '@threlte/extras'
  import type * as THREE from 'three'

  let { jointAngles }: { jointAngles: Record<string, number> } = $props()

  const gltf = useGltf<{
    nodes: { Armature: THREE.Object3D; UpperArm: THREE.Bone; Forearm: THREE.Bone }
    materials: { Body: THREE.MeshStandardMaterial }
  }>('/models/rig.glb')

  useTask((delta) => {
    if (!$gltf) return
    // imperatively drive named nodes each frame
    $gltf.nodes.UpperArm.rotation.x = jointAngles.upperArm ?? 0
    $gltf.nodes.Forearm.rotation.z += delta * 0.5
  })
</script>

<T.PerspectiveCamera makeDefault position={[0, 1.5, 4]} />
<T.DirectionalLight position={[3, 5, 2]} />

{#if $gltf}
  <T is={$gltf.scene} />
{/if}
```

Compression options if the asset warrants it: `useDraco()`, `useMeshopt()`, `useKtx2()`
from `@threlte/extras`, passed as loader options to `useGltf`.

## 3. SvelteKit SSR / prerender caveats

- **`ssr.noExternal`**: three.js (and friends) ship ESM that Vite must process during SSR.
  Standard Threlte guidance is to add to `apps/web/vite.config.ts`:

  ```ts
  export default defineConfig({
    ssr: { noExternal: ['three'] } // add 'postprocessing' too if ever used
  })
  ```

  (Threlte's own packages are Svelte libraries and are handled by vite-plugin-svelte
  automatically.)

- **Canvas is browser-only in practice**: `<Canvas>` creates a WebGL renderer, so nothing
  meaningful renders during SSR/prerender; the safe, standard patterns are either
  `export const ssr = false` in the route's `+page.ts`, or gate the viewer with
  `{#if browser}` (`$app/environment`) / dynamic-import it in `onMount`. The `{#if browser}`
  gate is the least invasive — the rest of the page keeps SSR.
- **Prerendering**: a prerendered page containing the gated viewer is fine (the canvas
  hydrates client-side); do not call `useGltf`/`useTask` outside `<Canvas>` or at module
  top level in server-executed code.

## 4. Approximate bundle-size impact

| Package           | Raw signal                                             | Realistic app impact                                                                 |
| ----------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `three@0.185.1`   | 709 kB min / 178 kB gzip full build (bundlephobia)     | Dominant cost; tree-shaking trims somewhat, expect ~450–650 kB min / ~120–170 kB gzip for a GLTF scene |
| `@threlte/core`   | 154 kB unpacked (uncompiled Svelte source)             | Small after compile + tree-shake — roughly 10–20 kB gzip                             |
| `@threlte/extras` | 537 kB unpacked                                        | Per-import tree-shaken; `useGltf` + GLTFLoader path roughly 15–30 kB gzip            |

Total expectation: **~150–200 kB gzip added to the client bundle**, almost all of it
three.js. Mitigation: lazy-load the viewer route/component (dynamic import) so the 3D
stack is only fetched when the preview is opened — this composes naturally with the
browser-only gating from section 3.

Note: bundlephobia cannot analyze `@threlte/*` (they publish uncompiled `.svelte`
source, HTTP 422), so those figures are unpacked-size + compile-time reasoning, not
measured bundle output. A spike with `vite build --mode analyze` in `apps/web` would
pin exact numbers.

## Recommendation

Adopt `three@0.185.1` + `@threlte/core@8.5.16` + `@threlte/extras@9.21.0`. Wire
`useGltf` (extras) for the rigged model and `useTask` (core) for per-frame named-node
rotation. Gate the viewer with `{#if browser}` and add `ssr: { noExternal: ['three'] }`
to the web app's Vite config. Lazy-load the viewer component to keep the ~150–200 kB
gzip three.js cost off the initial bundle.

## Source links

- https://threlte.xyz/docs/reference/extras/use-gltf
- https://threlte.xyz/docs/reference/core/use-task
- https://threlte.xyz/docs/learn/getting-started/installation
- https://threlte.xyz/docs/learn/basics/app-structure
- npm registry (`npm view`) for versions/peer deps, 2026-08-03
- https://bundlephobia.com/api/size?package=three@0.185.1
