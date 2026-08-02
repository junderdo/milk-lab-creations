# Wiring Tark UI into a SvelteKit 2 / Svelte 5 App

Research date: 2026-08-02. Primary sources: the Tark UI GitHub repo (`anubra266/tarkui`, which is the source of tarkui.com), the live tarkui.com registry endpoint, the npm registry, Ark UI docs/blog, and Tailwind CSS docs. Source URLs are cited inline and collected at the end.

## Summary

- **Tark UI is not an npm package.** `https://registry.npmjs.org/tarkui` returns `{"error":"Not found"}`. It is a copy-paste component gallery (50+ components, 300+ Svelte example variants) whose site also serves each example as a **shadcn-compatible registry item JSON** at `https://tarkui.com/r/sv/<componentIndex>/<exampleIndex>.json` (`sv` = Svelte). The site's code modal shows an install command of the form `npx shadcn@latest add <registry-url>` ([code-modal.tsx](https://github.com/anubra266/tarkui/blob/main/app/components/%5Bframework%5D/%5Bslug%5D/code-modal.tsx)).
- **Runtime dependencies are exactly two**: `@ark-ui/svelte` and `lucide-svelte` (per the registry item `dependencies` field served by [the live endpoint](https://www.tarkui.com/r/sv/0/0.json) and [route.ts](https://github.com/anubra266/tarkui/blob/main/app/r/%5BframeworkCode%5D/%5BcomponentIndex%5D/%5BexampleIndex%5D/route.ts)). No `cn`/`clsx`/`tailwind-merge` utility is used by the Svelte components — classes are inline strings.
- **`@ark-ui/svelte` latest is 5.22.1** (published 2026-06-06), peer dependency `svelte >= 5.20.0` — Svelte 5 only, runes-based ([npm](https://www.npmjs.com/package/@ark-ui/svelte), [Ark UI blog](https://ark-ui.com/blog/introducing-ark-ui-svelte)).
- **Tailwind CSS v4 is required** in practice: the repo uses `tailwindcss ^4.1.11` with `@import 'tailwindcss'`, and the Svelte snippets use v4-only utility names (`bg-linear-to-br`, `focus:outline-hidden`, `backdrop-blur-xs`) ([package.json](https://github.com/anubra266/tarkui/blob/main/package.json), [globals.css](https://github.com/anubra266/tarkui/blob/main/app/globals.css), [example component](https://github.com/anubra266/tarkui/blob/main/components/registry/svelte/accordion/with-chevron.svelte)).
- **Dark mode is class-based** (`@custom-variant dark (&:is(.dark *))` in [globals.css](https://github.com/anubra266/tarkui/blob/main/app/globals.css)); every component ships `dark:` variants, so the app needs something to toggle a `.dark` class on `<html>`.
- **Top caveats**: (1) `lucide-svelte` is deprecated on npm in favor of `@lucide/svelte`; (2) the advertised `npx shadcn@latest add` flow is React-tooling and is unverified in a SvelteKit project — plain copy-paste is the reliable path; (3) some examples (dialog, etc.) also need keyframes/`@theme` animation vars shipped in the registry item's `css`/`cssVars` fields, which manual copy-paste won't bring along automatically.

## Step-by-step setup (scaffolding ticket)

Assumes an existing SvelteKit 2 / Svelte 5 project (`npx sv create`).

1. **Install Tailwind CSS v4 with the Vite plugin** ([Tailwind SvelteKit guide](https://tailwindcss.com/docs/installation/framework-guides/sveltekit)):
   ```bash
   npm install tailwindcss @tailwindcss/vite
   ```
   (Or, on a fresh project, `npx sv add tailwindcss`.)
2. **Register the plugin** in `vite.config.ts`:
   ```ts
   import { sveltekit } from '@sveltejs/kit/vite';
   import tailwindcss from '@tailwindcss/vite';
   import { defineConfig } from 'vite';

   export default defineConfig({
     plugins: [tailwindcss(), sveltekit()],
   });
   ```
3. **Install component runtime deps** ([registry item deps](https://www.tarkui.com/r/sv/0/0.json); Svelte peer range from [npm @ark-ui/svelte](https://www.npmjs.com/package/@ark-ui/svelte)):
   ```bash
   npm install @ark-ui/svelte @lucide/svelte
   ```
   Requires `svelte >= 5.20.0`. Tark UI snippets import from `lucide-svelte`; `lucide-svelte@1.0.1` still installs and supports Svelte 5 (`peer svelte ^3 || ^4 || ^5.0.0-next.42`) but is [deprecated on npm](https://www.npmjs.com/package/lucide-svelte) — prefer installing `@lucide/svelte` and rewriting the icon import in each pasted snippet (`import { ChevronDown } from "lucide-svelte"` → `from "@lucide/svelte"`). Icon component API is the same.
4. **`src/app.css`** — Tailwind v4 has no `tailwind.config.js` by default; theme lives in CSS:
   ```css
   @import "tailwindcss";

   /* Tark UI components use class-based dark mode */
   @custom-variant dark (&:is(.dark *));
   ```
   The `@custom-variant dark` line mirrors Tark UI's own [globals.css](https://github.com/anubra266/tarkui/blob/main/app/globals.css). Add an `@theme { ... }` block with animation vars/keyframes only when a copied example needs one (see "Theme tokens" below).
5. **Import the CSS** in `src/routes/+layout.svelte`:
   ```svelte
   <script>
     import "../app.css";
     let { children } = $props();
   </script>
   {@render children()}
   ```
6. **Dark-mode toggle**: add a mechanism that puts a `dark` class on `<html>` (e.g. the `mode-watcher` package, or a small inline script) — Tark UI itself uses `next-themes` with class strategy on its Next.js site; nothing Svelte-specific is prescribed.
7. **Copy components**: on tarkui.com pick a component with `?framework=svelte`, open the code modal, and paste the `.svelte` file into your project (suggested target mirrors the registry: `src/lib/components/<slug>/<example>.svelte`; the registry item's own `target` is `components/<slug>/<file>.svelte`). Alternatively fetch the JSON directly, e.g. `curl https://tarkui.com/r/sv/0/0.json` and extract `files[0].content`.
8. **Per-example CSS extras**: if the fetched registry JSON contains `css` (keyframes) or `cssVars.theme` (e.g. `animate-dialog-in`), translate them into `app.css`: keyframes go in plain CSS (or inside `@theme`), and each `cssVars.theme` entry `"animate-dialog-in": "..."` becomes `--animate-dialog-in: ...;` inside `@theme` (compare Tark UI's own [globals.css](https://github.com/anubra266/tarkui/blob/main/app/globals.css) and the [dialog manifest](https://github.com/anubra266/tarkui/blob/main/components/registry/manifest/dialog.ts)).
9. **No utils file needed.** The Svelte snippets use plain class strings — no `cn()`/`clsx`/`tailwind-merge` (verified by sampling registry `.svelte` files; the repo's `lib/utils.ts` `cn()` helper is for the site's own React UI only).

## Detail sections

### 1. Distribution model

- The whole of tarkui.com lives in [github.com/anubra266/tarkui](https://github.com/anubra266/tarkui) — a Next.js app (127 stars, last push 2026-02-16). Components are plain source files under `components/registry/{react,vue,solid,svelte}/<slug>/<example>.{tsx,vue,svelte}`; the Svelte tree has 327 `.svelte` files across 41 component categories (accordion … tree-view).
- No npm package: [registry.npmjs.org/tarkui](https://registry.npmjs.org/tarkui) → `Not found`. The [README](https://github.com/anubra266/tarkui/blob/main/README.md) says "Zero Dependencies — Only peer dependencies on Ark UI, Tailwind CSS and Lucide Icons."
- shadcn-style registry: [`app/r/[frameworkCode]/[componentIndex]/[exampleIndex]/route.ts`](https://github.com/anubra266/tarkui/blob/main/app/r/%5BframeworkCode%5D/%5BcomponentIndex%5D/%5BexampleIndex%5D/route.ts) serves `$schema: "https://ui.shadcn.com/schema/registry-item.json"` items. Framework codes: `r` react, `v` vue, `s` solid, `sv` svelte. Verified live: [`https://www.tarkui.com/r/sv/0/0.json`](https://www.tarkui.com/r/sv/0/0.json) returns the accordion `with-chevron.svelte` source with `dependencies: ["@ark-ui/svelte", "lucide-svelte"]`.
- The site's code modal offers per-package-manager commands `npx shadcn@latest add <url>` / `pnpm dlx shadcn@latest add <url>` etc. ([code-modal.tsx](https://github.com/anubra266/tarkui/blob/main/app/components/%5Bframework%5D/%5Bslug%5D/code-modal.tsx)).
- **Unverified**: whether the React-oriented `shadcn` CLI actually completes an `add` of a `.svelte`-file registry item inside a SvelteKit project (the CLI expects a `components.json` and does framework detection). The separate [shadcn-svelte](https://www.shadcn-svelte.com/docs/registry) project has its own remote-registry format; cross-compatibility with shadcn's `registry-item.json` was not verified. Treat copy-paste (or curl + extract `files[0].content`) as the dependable workflow.
- There is no docs/installation page on tarkui.com — `https://www.tarkui.com/docs` returns 404 and the repo's `app/` contains only the gallery, code-modal, and registry routes. All "installation" guidance is the per-example install command in the code modal.

### 2. Ark UI dependency

- [`@ark-ui/svelte`](https://www.npmjs.com/package/@ark-ui/svelte): latest **5.22.1**, published 2026-06-06 (npm registry metadata). Peer dependency: **`svelte >= 5.20.0`**. Runtime deps: `@zag-js/*@1.41.2` state machines + `@internationalized/date`.
- Svelte 5 / runes: the [Ark UI Svelte announcement](https://ark-ui.com/blog/introducing-ark-ui-svelte) states "Ark UI only works for Svelte 5 apps and design systems" and that it leverages runes (`$state`, `$derived`, `$effect`). 45+ components.
- The Ark repo's Svelte workspace ([packages/svelte/package.json](https://github.com/chakra-ui/ark/blob/main/packages/svelte/package.json)) is developed against `svelte 5.56.7` and `@sveltejs/kit 2.70.1`, i.e. SvelteKit 2 is the reference environment.
- Tark UI's own repo pins `"@ark-ui/svelte": "latest"` ([package.json](https://github.com/anubra266/tarkui/blob/main/package.json)), so snippets track the current Ark UI API. Imports are per-component subpaths: `@ark-ui/svelte/accordion`, `@ark-ui/svelte/portal`, `@ark-ui/svelte/toast`, etc.

### 3. Tailwind CSS compatibility

- Tark UI is built on **Tailwind v4**: `tailwindcss ^4.1.11` + `@tailwindcss/postcss` in [package.json](https://github.com/anubra266/tarkui/blob/main/package.json); [globals.css](https://github.com/anubra266/tarkui/blob/main/app/globals.css) starts with `@import 'tailwindcss';` and defines theme via `@theme` (no `tailwind.config.ts` file exists in the repo despite `components.json` referencing one — that reference is shadcn boilerplate).
- Snippets use **v4-renamed utilities** — `bg-linear-to-br` (v3: `bg-gradient-to-br`), `focus:outline-hidden` (v3: `outline-none`), `backdrop-blur-xs` — so they will not render correctly on Tailwind v3 without manual translation.
- No Tailwind plugins or presets are required by the Svelte snippets. Colors are stock palette classes (`gray-*`, `blue-500`, …) with `dark:` variants, **not** shadcn semantic tokens; the shadcn-style `--background`/`--primary` CSS variables in Tark's globals.css style the tarkui.com site itself, not the copied components.
- Theme tokens the components may need: some examples ship `cssVars.theme` animation vars (e.g. `--animate-dialog-in`, `--animate-backdrop-in`) and matching `@keyframes` via the registry item's `css`/`cssVars` fields ([dialog manifest](https://github.com/anubra266/tarkui/blob/main/components/registry/manifest/dialog.ts)); Tark's [globals.css](https://github.com/anubra266/tarkui/blob/main/app/globals.css) shows the equivalent `@theme` declarations. Class-based dark mode via `@custom-variant dark (&:is(.dark *))`.

### 4. Install/config specifics for SvelteKit 2 / Svelte 5

Covered in the step-by-step list above. Key package set:

| Package | Version (2026-08-02) | Why |
|---|---|---|
| `tailwindcss` | ^4.1.x | v4 utilities used by snippets ([Tailwind guide](https://tailwindcss.com/docs/installation/framework-guides/sveltekit)) |
| `@tailwindcss/vite` | ^4.1.x | v4 Vite plugin for SvelteKit (no PostCSS config needed) |
| `@ark-ui/svelte` | 5.22.1 | headless primitives; peer `svelte>=5.20.0` ([npm](https://www.npmjs.com/package/@ark-ui/svelte)) |
| `@lucide/svelte` (or deprecated `lucide-svelte`) | 1.28.0 / 1.0.1 | icons imported by many snippets ([npm](https://www.npmjs.com/package/@lucide/svelte)) |

No `components.json`, no `cn` util, no Tailwind config file, no PostCSS config are required for the Svelte path.

### 5. SSR / SvelteKit caveats

- **General SSR**: Ark UI is headless over Zag.js state machines; the Ark repo itself develops/tests the Svelte package inside SvelteKit 2 ([packages/svelte/package.json](https://github.com/chakra-ui/ark/blob/main/packages/svelte/package.json) devDeps include `@sveltejs/kit`). No Svelte-specific SSR warnings were found in Ark UI docs.
- **Portals**: overlay components (Menu, Dialog, Popover, Select, Tooltip, …) render floating content through `Portal` from `@ark-ui/svelte/portal` (seen in [menu/basic.svelte](https://github.com/anubra266/tarkui/blob/main/components/registry/svelte/menu/basic.svelte)). Portal targets `document.body` on the client; keep the copied structure intact.
- **EnvironmentProvider** is only needed for iframes / Shadow DOM / Electron, where `document.querySelectorAll`-style lookups break ([Ark UI Environment docs](https://ark-ui.com/docs/utilities/environment)) — not for ordinary SvelteKit SSR. The Environment docs page shows React/Solid examples only; no Svelte example (unverified how it is exposed in Svelte beyond the `@ark-ui/svelte` export map).
- **Issue tracker**: as of 2026-08-02, GitHub search shows **zero open Svelte-labeled issues** in `chakra-ui/ark`; notable closed ones: [#3651 "Problems with Asynchronous Svelte"](https://github.com/chakra-ui/ark/issues/3651) and [#3571 Svelte Toast overlap/gap](https://github.com/chakra-ui/ark/issues/3571). No SvelteKit-specific open bugs found.
- **Toasts** use `createToaster` + `<Toaster>` with a `{#snippet children(toast)}` render snippet ([toast/basic.svelte](https://github.com/anubra266/tarkui/blob/main/components/registry/svelte/toast/basic.svelte)) — create the toaster in module/component scope on the page or a layout that renders `<Toaster>`.

### Unverified / unclear points

- Whether `npx shadcn@latest add https://tarkui.com/r/sv/...json` works in a SvelteKit project (the command tarkui.com displays); untested and the shadcn CLI is React-first. Copy-paste is the safe workflow.
- Tark UI has no versioning/changelog for the components themselves ([releases page](https://github.com/anubra266/tarkui/releases) — no releases published); snippets track `@ark-ui/svelte@latest`, so future Ark UI majors could break older copies.
- Ark UI's docs site does not expose stable per-framework URL slugs that could be fetched directly (framework switch appears client-side; `/docs/svelte/...` paths 404), so Svelte-specific docs claims above rest on the blog post, npm metadata, and the ark repo source.

## Sources

- https://www.tarkui.com/ (site; `?framework=svelte`)
- https://www.tarkui.com/r/sv/0/0.json (live registry item, fetched 2026-08-02)
- https://github.com/anubra266/tarkui — repo root
- https://github.com/anubra266/tarkui/blob/main/README.md
- https://github.com/anubra266/tarkui/blob/main/package.json
- https://github.com/anubra266/tarkui/blob/main/components.json
- https://github.com/anubra266/tarkui/blob/main/app/globals.css
- https://github.com/anubra266/tarkui/blob/main/app/r/%5BframeworkCode%5D/%5BcomponentIndex%5D/%5BexampleIndex%5D/route.ts
- https://github.com/anubra266/tarkui/blob/main/app/components/%5Bframework%5D/%5Bslug%5D/code-modal.tsx
- https://github.com/anubra266/tarkui/blob/main/lib/registry.utils.ts
- https://github.com/anubra266/tarkui/blob/main/components/registry/manifest/dialog.ts
- https://github.com/anubra266/tarkui/blob/main/components/registry/svelte/accordion/with-chevron.svelte (via registry JSON)
- https://github.com/anubra266/tarkui/blob/main/components/registry/svelte/menu/basic.svelte
- https://github.com/anubra266/tarkui/blob/main/components/registry/svelte/toast/basic.svelte
- https://github.com/anubra266/tarkui/releases
- https://www.npmjs.com/package/@ark-ui/svelte (registry metadata via registry.npmjs.org)
- https://www.npmjs.com/package/lucide-svelte / https://www.npmjs.com/package/@lucide/svelte (registry metadata)
- https://registry.npmjs.org/tarkui (404 — no npm package)
- https://ark-ui.com/blog/introducing-ark-ui-svelte
- https://ark-ui.com/docs/overview/getting-started
- https://ark-ui.com/docs/utilities/environment
- https://github.com/chakra-ui/ark/blob/main/packages/svelte/package.json
- https://github.com/chakra-ui/ark/issues/3651 · https://github.com/chakra-ui/ark/issues/3571 (closed Svelte issues)
- https://tailwindcss.com/docs/installation/framework-guides/sveltekit
- https://www.shadcn-svelte.com/docs/registry (context on the separate shadcn-svelte registry format)
