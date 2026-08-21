# TypeScript

How we write TypeScript in this repo. These rules hold in review everywhere; a
rule that names a scope applies only there.

## What the compiler already enforces

`packages/config/tsconfig/base.json` turns on `strict`,
`noUncheckedIndexedAccess`, `isolatedModules`, and `verbatimModuleSyntax`, and
every package extends it. Most rules below are the habits that keep those
settings from being worked around — a `!` or an `as` that turns a compiler
error into a runtime one costs more than the error it removed.

## Model absence in the types

A value that can be missing says so in its type, and the caller handles it.
Don't hide the gap with a cast or a lie in the return type.

```ts
// no
function robotLimits(slug: string): RobotLimits {
  return ROBOT_PROFILES[slug] as RobotLimits;
}

// yes
function robotLimits(slug: string): RobotLimits | undefined {
  return ROBOT_PROFILES[slug];
}
```

A robot can arrive by migration before `ROBOT_PROFILES` knows it. Guessing its
limits builds documents the server then rejects; the absence belongs in the
type so the caller decides what to show.

## Index access can return `undefined`

`noUncheckedIndexedAccess` is on, so every `arr[i]` and `obj[key]` is
`T | undefined`. Prefer restructuring so the index disappears; narrow
explicitly when it can't.

```ts
// no
for (let i = 0; i < keyframes.length; i++) {
  poseFrom(keyframes[i]);
}

// yes
for (const keyframe of keyframes) {
  poseFrom(keyframe);
}
```

When the index is genuinely needed — comparing a keyframe to its neighbour,
reading the last one — handle the miss:

```ts
// no
const last = keyframes[keyframes.length - 1];
return last.timeMs;

// yes
const last = keyframes.at(-1);
if (last === undefined) {
  throw new Error("animation has no keyframes");
}
return last.timeMs;
```

## No non-null assertions

`!` is banned. It silences the compiler exactly where the value can be missing;
narrow explicitly instead.

```ts
// no
const animation = rows.find((row) => row.id === id)!;

// yes
const animation = rows.find((row) => row.id === id);
if (animation === undefined) {
  throw new TRPCError({ code: "NOT_FOUND" });
}
```

Inside a predicate, compare rather than assert:

```ts
// no
keyframes.every((kf, i) => i === 0 || kf.timeMs >= keyframes[i - 1]!.timeMs);

// yes
keyframes.every((kf, i) => {
  const previous = keyframes[i - 1];
  return previous === undefined || kf.timeMs >= previous.timeMs;
});
```

## No `any`

`any` turns checking off for everything it touches and spreads through
inference. Never declare it. When one leaks in — a loose dependency,
`JSON.parse`, a tRPC payload column — give the value a real type at the point
it enters instead of passing it along. For a value that is genuinely unknown,
the type is `unknown`, narrowed before use.

```ts
// no
const payload: any = animation.payload;
render(payload.keyframes);

// yes
const keyframes = keyframesFromPayload(animation.payload); // takes `unknown`
render(keyframes);
```

## Parse at the boundary

Data from outside the process — tRPC inputs, the `payload` JSON column, HTTP
bodies, `localStorage`, environment — is parsed into a typed value where it
enters, once, and travels as that type from then on. The zod schemas in
`apps/api/src/payload.ts` and `apps/api/src/router.ts` are that boundary
server-side; `apps/web/src/lib/animation/payload.ts` is its counterpart in the
browser.

```ts
// no
function save(payload: AnimationPayload) {
  db.animation.update({ data: { payload } });
}
save(JSON.parse(body) as AnimationPayload);

// yes
const result = payloadSchemaFor(profile).safeParse(JSON.parse(body));
if (!result.success) {
  throw new TRPCError({ code: "BAD_REQUEST", message: result.error.issues[0]?.message });
}
save(result.data);
```

Derive the type from the schema rather than declaring it twice — one source of
truth, and a schema change is a compile error at every use:

```ts
export type AnimationPayload = z.infer<ReturnType<typeof payloadSchemaFor>>;
```

A prop or parameter that receives unparsed data is typed `unknown`, and says so:

```ts
interface Props {
  /** Opaque API JSON; parsed at this boundary, never cast. */
  payload: unknown;
}
```

## Casts

Never use `as` to silence a type error — it makes the compiler believe
something it can't verify, and the error moves to runtime. `as const` and
`satisfies` are fine; so is a widening cast to `unknown`. A double cast
(`as unknown as T`) is the same lie in two steps.

```ts
// no
const payload = animation.payload as unknown as AnimationPayload;

// yes
const payload = validatePayload(animation.robot.slug, animation.payload);
```

Use `satisfies` when you want a literal checked against a type without losing
its narrower inferred shape:

```ts
// no — the literal widens to VisibilityOption[], losing the exact members
const OPTIONS: VisibilityOption[] = [...];

// yes
const OPTIONS = [...] as const satisfies readonly VisibilityOption[];
```

## Unions from const arrays, not enums

A union that also needs a runtime list is one `as const` array and a type
derived from it. No `enum` — it emits runtime code, and its members aren't
assignable from the strings that cross the wire.

```ts
// no
enum Visibility {
  Private = "private",
  Unlisted = "unlisted",
  Public = "public",
}

// yes
export const VISIBILITIES = ["private", "unlisted", "public"] as const;
export type Visibility = (typeof VISIBILITIES)[number];
```

The array is then what `z.enum(VISIBILITIES)` and the UI's option list both
read, so adding a member is one edit.

## States are discriminated unions

Model a state machine as a union whose variants carry exactly the data that
variant has — not one wide object with optional fields that are only sometimes
set. Narrowing on the tag then hands the branch its data, and an impossible
combination can't be constructed.

```ts
// no
interface SaveStatus {
  saving: boolean;
  conflict?: LoadedAnimation;
  errorMessage?: string;
  retryable?: boolean;
}

// yes
export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving"; request: SaveRequest }
  /** `request` is what the server rejected — Overwrite resends exactly it. */
  | { kind: "conflict"; server: LoadedAnimation; request: SaveRequest }
  /** `retryable` false = resending the same request cannot succeed. */
  | { kind: "failed"; message: string; retryable: boolean };
```

The same shape covers results a caller must handle: `{ ok: true; … }` /
`{ ok: false; message: string }` beats returning `null` and losing the reason.

## `readonly` where nothing should mutate

Domain values that are passed around and compared — payloads, keyframes,
snapshots — declare their fields `readonly`. It makes "pure, returns a new one"
checkable rather than a comment.

```ts
export interface WireKeyframe {
  readonly timeMs: number;
  readonly angles: readonly number[];
  readonly easeInType: number;
  readonly easeOutType: number;
}
```

Prefer `readonly T[]` for parameters a function only reads.

## No escape hatches without a reason

`@ts-expect-error`, `@ts-ignore`, and `eslint-disable` comments are last
resorts, never a way past a rule above. `@ts-ignore` is banned outright —
`@ts-expect-error` at least fails when the error goes away. Whichever you use,
scope it to the single line and say why on the same comment.

```ts
// no
// eslint-disable-next-line
/// <reference path="../../../sst-env.d.ts" />

// yes — svelte-check compiles @milklab/api sources but doesn't see its tsconfig
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../../sst-env.d.ts" />
```

## Every promise is handled

A promise is awaited, returned, or explicitly discarded with `void`. A bare
call swallows rejections and races whatever runs next.

```ts
// no
ears.connect();

// yes
await ears.connect();

// yes — intentionally fire-and-forget from a click handler, marked as such
void ears.connect();
```

Don't hand an async function to an API expecting a synchronous callback; the
returned promises are dropped on the floor.

```ts
// no
slots.forEach(async (slot) => session.write(slot));

// yes
for (const slot of slots) {
  await session.write(slot);
}
```

Independent awaits go through `Promise.all` rather than in sequence:

```ts
const [gallery, robots] = await Promise.all([
  client.animations.gallery.query(input),
  client.robots.list.query(),
]);
```

## `??` for defaults

`||` replaces every falsy value — `0`, `''`, `false` — not just missing ones.
Default with `??` so only `null` and `undefined` trigger the fallback. It
matters here: `0` is a legitimate `timeMs`, angle, and ease type.

```ts
// no
const timeMs = keyframe.timeMs || 0;

// yes
const timeMs = keyframe.timeMs ?? 0;
```

## Optional chains

Use `?.` instead of chained `&&` existence checks.

```ts
// no
if (result.error && result.error.issues && result.error.issues[0]) {
  reject(result.error.issues[0].message);
}

// yes
const message = result.error?.issues[0]?.message ?? "malformed";
```

## Exhaustive switches

A `switch` over a union names every member. The `default` asserts the value is
`never` and throws: a union member added later fails to compile, and an
unexpected runtime value throws instead of falling through silently.

```ts
// no
switch (status.kind) {
  case "saving":
    return spinner();
  default:
    return null;
}

// yes
switch (status.kind) {
  case "idle":
    return null;
  case "saving":
    return spinner();
  case "conflict":
    return conflictDialog(status.server);
  case "failed":
    return errorBanner(status.message, status.retryable);
  default: {
    const unhandled: never = status;
    throw new Error(`unhandled save status: ${String(unhandled)}`);
  }
}
```

## Template literals interpolate strings and numbers

Anything else stringifies badly (`[object Object]`, `null`). Interpolate an
explicit representation instead.

```ts
// no
throw new Error(`invalid keyframe ${keyframe}`);

// yes
throw new Error(`invalid keyframe at ${keyframe.timeMs}ms`);
```

## Type-only imports and exports

`verbatimModuleSyntax` is on: anything imported or re-exported only for its
type must use `import type` / `export type`, so the binding carries no runtime
cost and reads as what it is.

```ts
// no
import { AnimationPayload } from "./payload.ts";

// yes
import type { AnimationPayload } from "./payload.ts";
export type { Visibility };
```

Mixed imports mark the type specifiers inline:

```ts
import { packWireFormat, type AnimationPayload } from "./payload.ts";
```

## Explicit `override`

Every member that overrides a base-class member says so.

```ts
// no
class RecordingSession extends EarsSession {
  write(slot: Slot): Promise<void> {}
}

// yes
class RecordingSession extends EarsSession {
  override write(slot: Slot): Promise<void> {}
}
```

## Svelte

Svelte 5 runes only — no `export let`, no `$:` labels, no stores for component
state, no `createEventDispatcher`.

Props are destructured from `$props()` against a local `interface Props`, with
a doc comment on any prop whose name doesn't carry its meaning:

```ts
// no
export let keyframes;
export let graphHeight = null;

// yes
interface Props {
  keyframes: Keyframe[];
  limits: RobotLimits;
  /** `null` leaves the responsive default, which is what most callers want. */
  graphHeight?: number | null;
}

let { keyframes, limits, graphHeight = null }: Props = $props();
```

Events are callback props with a full signature, so the payload is typed at
both ends:

```ts
interface Props {
  onangle: (index: number, channel: number, angle: number) => void;
  ontime: (index: number, timeMs: number) => void;
}
```

Two-way props use `$bindable` with a default; slot content is a
`Snippet` imported from `svelte`:

```ts
import type { Snippet } from "svelte";

interface Props {
  playheadMs: number;
  selectedIndex: number | null;
  /** Sits beside the name — badges, byline, whatever the list wants. */
  byline?: Snippet;
}

let { playheadMs = $bindable(0), selectedIndex = $bindable(null), byline }: Props = $props();
```

Derive with `$derived` / `$derived.by`; an `$effect` that only assigns to state
is a `$derived` written the hard way.

```ts
// no
let keyframes = $state<Keyframe[]>([]);
$effect(() => {
  keyframes = keyframesFromPayload(payload);
});

// yes
const keyframes = $derived(keyframesFromPayload(payload));
```

Reactive state that outlives a component lives in a `.svelte.ts` module and is
exposed through getters — `$state` loses its reactivity when destructured, so
never return the variable itself:

```ts
// apps/web/src/lib/ears/connection.svelte.ts
function createEarsConnection() {
  let state = $state<EarsConnectionState>({ status: "disconnected", notice: null });
  return {
    get state(): EarsConnectionState {
      return state;
    },
    connect,
  };
}
```

SvelteKit's generated types are the contract for routes: annotate loads with
`PageLoad` / `PageServerLoad` from `./$types`, and let `+page.svelte` /
`+layout.svelte` take their `data` and `children` from the generated `$props()`
rather than re-declaring a shape that can drift.

```ts
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, url }) => { … };
```

Browser-only APIs (`navigator.bluetooth`, `matchMedia`, `localStorage`) are
gated on `browser` from `$app/environment`; SSR has no `window` and guessing on
the server renders the wrong answer until hydration corrects it.

Markup keeps the accessibility bar: every form control has an associated label
(wrapped, `for`/`id`, or `aria-label`), interactive elements are focusable and
keyboard-operable, decorative icons carry `aria-hidden="true"`, and images
carry `alt` text. `eslint-plugin-svelte`'s recommended set enforces most of it —
don't disable those rules to land a change.

## Smaller conventions

- `T[]` over `Array<T>`; `readonly T[]` for what a function only reads.
- `interface` for object shapes; `type` for unions, intersections, and
  function types.
- Exported functions declare their return type. Inference is fine for locals.
- Dot notation (`obj.key`) over `obj['key']` when the key is known.
- `startsWith` / `endsWith` over `slice` or `indexOf` comparisons.
- `.at(-1)` over `arr[arr.length - 1]`.
- Modules are kebab-case (`wire-format.ts`, `animation-list.ts`); Svelte
  components are PascalCase; a module holding runes is `*.svelte.ts`.
- `apps/api` imports with the `.ts` extension (`./payload.ts`) —
  `allowImportingTsExtensions` is on for the Lambda build. `apps/web` imports
  extensionless through `$lib` aliases. Match the app you're in.
