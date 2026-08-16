# Research: what an avatar is in this app, and the column shape that admits uploads later

Date: 2026-08-16. Sources: this repo at `4a25755`; Aurora DSQL User Guide, postgresql.org,
svelte.dev/docs/kit, vite.dev, sst.dev/docs and zod.dev (all fetched live on this date);
npm registry via `npm view` (live); the installed `node_modules` trees for zod and
`@ark-ui/svelte` (read directly, plus Zod schemas actually executed against the installed
copy — not recalled). Where a fact could not be established from a primary source it is
called out as **unverified** rather than filled in with plausible prose.

Grilling card: <https://trello.com/c/EO7vV5gf/93-grilling-what-an-avatar-preset-is>.
Parent wayfinder map: <https://trello.com/c/gi2Ipg3P/91-wayfinder-map-user-profile-and-registered-devices>.

This note does **not** pick the design. It sharpens the options and states the constraints
that make some of them one-way doors.

---

## 1. What exists today

There is no avatar anywhere. `grep -ri avatar apps/web/src` and `grep -ri avatar docs/`
both return nothing. There is also no profile page — the route tree is `/` (gallery),
`/my`, `/animations/[id]`, `/animations/new`, and `/auth/*`.

### The `User` row

`apps/api/prisma/schema.prisma:15-24`:

```prisma
model User {
  id          String      @id @db.Uuid // Cognito sub, JIT-upserted
  email       String
  displayName String      @map("display_name")
  createdAt   DateTime    @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt   DateTime    @updatedAt @map("updated_at") @db.Timestamptz()
  animations  Animation[]

  @@map("users")
}
```

The physical table is `apps/api/prisma/migrations/000001_init/migration.sql:7-16` — three
`TEXT`/`UUID` columns plus timestamps, no CHECK constraints, no FKs.

Rows are created just-in-time on the first authenticated request
(`apps/api/src/trpc.ts:41-62`), seeded from Cognito's `email` and `name` attributes
(`apps/api/src/auth.ts:52-59`). So **every user already has a `displayName` on day one** —
there is no "unset name" state to model, and initials are always derivable.

### The tRPC surface

`apps/api/src/router.ts:186-217`:

```ts
const usersRouter = router({
  me: authedProcedure.query(({ ctx }) => ctx.dbUser),

  updateDisplayName: authedProcedure
    .input(z.object({ displayName: nameSchema }))
    .mutation(...),

  deleteAccount: authedProcedure.mutation(async ({ ctx }) => { ... }),
});
```

Two things follow, and both are load-bearing for this card:

1. **`users.me` returns the whole row** (`ctx.dbUser`), not a projection. Any column added
   to `users` is automatically on the wire to the signed-in client — including `email`,
   which already ships today. An avatar column needs no read plumbing for the profile page,
   but it also gets no chance to be filtered.
2. **The public projection is explicit and separate.** `apps/api/src/router.ts:75-78`:

   ```ts
   const ownerRobotSelect = {
     owner: { select: { id: true, displayName: true } },
     robot: { select: { slug: true, name: true } },
   } as const;
   ```

   This is what gallery cards and animation detail pages read from. An avatar on a byline
   is a deliberate one-line addition here — it is not free, and it is the moment the avatar
   becomes public data about a user rather than a private preference.

### Where `displayName` renders today

| Surface | File:line | What it shows |
| --- | --- | --- |
| Header, signed in | `apps/web/src/routes/+layout.svelte:52` | `{data.me.displayName}` beside Sign out |
| Gallery card byline | `apps/web/src/routes/+page.svelte:45` | `by {item.owner?.displayName ?? "unknown"} · {item.robot?.name}` |
| Animation detail byline | `apps/web/src/routes/animations/[id]/+page.svelte:108` | same sentence, plus duration/keyframes |
| `/my` cards | — | **no byline owner** — the list is already yours; `AnimationCard`'s `byline` snippet carries visibility and remix badges instead (`apps/web/src/lib/components/animation-card/AnimationCard.svelte:1-8`) |

`AnimationCard` takes the byline as a `Snippet` prop
(`AnimationCard.svelte:22-23,37`), so an avatar on a gallery card needs no change to the
card component — only to the snippet the gallery passes.

That is **three** render sites, not one, and they have different privacy weights: the
header is self-only, the two bylines are public.

### The `visibility` precedent — this repo has already solved "small closed set"

This is the closest existing analogue to a preset key, and it is worth copying rather than
inventing around:

- `apps/api/src/visibility.ts:1-2` — the set is a `const` tuple:
  ```ts
  export const VISIBILITIES = ["private", "unlisted", "public"] as const;
  export type Visibility = (typeof VISIBILITIES)[number];
  ```
- The column is bare `TEXT NOT NULL DEFAULT 'private'`
  (`apps/api/prisma/migrations/000001_init/migration.sql:35`) with **no** database CHECK.
- Server-side validation is `z.enum(VISIBILITIES)` at the tRPC boundary
  (`apps/api/src/router.ts:388`, and again at `:232` for filtering).
- The type crosses to the web app through the package export
  (`apps/api/src/index.ts:2`, consumed at `apps/web/src/lib/editor/visibility.ts:10`), and
  the web app re-derives its own presentation table plus a tolerant reader:
  ```ts
  /** A visibility off the wire, or `null` for a value this build doesn't know. */
  export function visibilityOf(value: string): Visibility | null {
    return VISIBILITY_OPTIONS.find((option) => option.value === value)?.value ?? null;
  }
  ```
  (`apps/web/src/lib/editor/visibility.ts:27-30`)

So: **closed set in the API package, enforced by Zod at the boundary, unconstrained TEXT in
the database, and a client that returns `null` for values it doesn't recognise.** The
"free-text column a client can set to anything" half of the card's last bullet is already
answered by precedent — the database is free text, the boundary is not.

### Boundary parsing, as this repo actually practises it

`docs/typescript.md:71-104` bans `any` and bans `as` to silence errors: *"Data from outside
the process — HTTP bodies, environment, storage — is parsed into a typed value at the
boundary"*. (Note: it links `parse-dont-validate.md`, which does not exist here — CLAUDE.md
already records this as a known gap.)

The two live implementations of that rule are worth naming because they are *different*:

- **Server, on write:** Zod at the tRPC input, with a deliberately loose outer shape and a
  strict per-profile inner parse (`apps/api/src/router.ts:51-73`, `apps/api/src/payload.ts:15-37`).
- **Client, on read:** hand-rolled narrowing that *drops* malformed data instead of
  throwing — `apps/web/src/lib/animation/payload.ts:1-46`, whose header says casting
  *"would move any future mismatch to a runtime crash inside the render loop"*.

An avatar value read on a gallery card sits in the second category: a byline must not throw
because a future build wrote a `kind` this build has never heard of.

### Static assets: `static/` vs `$lib/assets`

Both patterns are in use, and the repo has already reasoned about the difference:

| Pattern | Example | Consequence |
| --- | --- | --- |
| `static/` | `apps/web/static/models/robo-cat-ears.glb`, addressed as `/models/<slug>.glb` (`apps/web/src/lib/animation/robots.ts:14-17`) | Stable, unhashed URL. `sst.config.ts:113-126` gives `**/*.glb` `max-age=31536000,immutable`, and the comment states the price plainly: *"a rebuilt model needs a CloudFront invalidation to reach clients that already cached it — accepted, since rig changes are rare and deliberate."* |
| `$lib/assets` import | `import logo from "$lib/assets/milk-lab-logo.svg"` (`apps/web/src/routes/+layout.svelte:4-5`) | Vite-processed, content-hashed filename, safe to cache forever, changes bust themselves. |

SvelteKit's own docs come down on one side. `static/` is described as *"Any static assets
that should be served without any alteration to the name — such as `robots.txt`"*
(<https://svelte.dev/docs/kit/project-structure>), and the images page states of imported
assets: *"Vite will automatically process imported assets for improved performance… Hashes
will be added to the filenames so that they can be cached, and assets smaller than
`assetsInlineLimit` will be inlined"* (<https://svelte.dev/docs/kit/images>). Vite's
`assetsInlineLimit` defaults to **4096 bytes** (<https://vite.dev/config/build-options>) —
so small SVG presets imported from `$lib` would inline into the bundle entirely, costing
zero requests.

Worth knowing before anyone reaches for it: **`@sveltejs/enhanced-img` cannot help with
uploads.** Same page: it *"can only optimize files located on your machine during the build
process."* It is a preset-art tool only.

The choice for avatar art is therefore already precedented in both directions, and the
deciding question is whether an avatar key ever needs to become a URL a *server* can
construct. `modelUrlFor` builds `/models/<slug>.glb` from a database value; a bundled
import cannot be built from a database value at all — it has to go through an explicit
`Record<PresetKey, string>` map in the web app.

### The UI primitive already exists (unused)

`@ark-ui/svelte@5.22.1` is a direct dependency (`apps/web/package.json:17`) and its
installed tree contains a full Avatar:
`dist/components/avatar/{avatar-root,avatar-image,avatar-fallback}.svelte`, exported as
`Avatar.Root/Image/Fallback` plus `useAvatar`. Its `package.json` exports map has a `./*`
wildcard, so the import path is `@ark-ui/svelte/avatar` — the same shape as the one Tark UI
copy-paste already in the repo (`apps/web/src/lib/components/accordion/with-chevron.svelte:2`
imports `@ark-ui/svelte/accordion`).

Ark's Avatar is built around exactly the state this card is asking about: an `Image` that
may fail or be absent, and a `Fallback` slot that renders when it does. If "no avatar" is
a real state, this component already models it, at zero new dependency cost.

**Unverified:** whether tarkui.com publishes an Avatar block (the site was not fetched for
this note). The underlying Ark primitive is confirmed present regardless.

### No upload path exists at all

`grep -rn "sst.aws.Bucket|s3-request-presigner|@aws-sdk/client-s3"` across the repo (minus
`node_modules`) returns **nothing**. `sst.config.ts` declares `Dsql`, `CognitoUserPool`,
`ApiGatewayV2`, `SvelteKit`, and one `Function` — no bucket, no CDN of user content, no
presigner dependency. The parent wayfinder card puts uploaded avatars explicitly out of
scope: *"Uploaded avatar images (S3 bucket, CDN, moderation, orphan cleanup). Preset avatars
deliver 'change my avatar' without dragging in a new subsystem."*

So the "uploaded variant later" in this card is a **hypothetical second subsystem**, not a
planned next sprint. That matters for how much the column shape should pay today to
accommodate it.

---

## 2. The preset set — this is a product question, not a research finding

The card asks how many presets, what art direction, who makes the assets. **None of that is
answerable from the codebase or from any external source, and this note declines to invent
it.** What research can contribute is the shape of the constraint:

- The only existing art in the repo is `milk-lab-logo.svg` (14 KB, black line art on
  transparent, dark mode handled by `dark:invert` — `+layout.svelte:38`) and
  `favicon.svg`. There is one visual precedent: **line art that inverts**, not full-colour
  illustration. A preset set that is flat line art costs nothing extra in dark mode; a
  full-colour set needs its own answer for the dark background (`bg-gray-950`).
- The count only interacts with engineering in one place: whether the picker is a grid the
  user scans (works to roughly a dozen) or a searchable list (beyond that). Nothing in the
  data model cares.
- Who makes them is unanswerable here. The realistic options — commissioned, generated,
  or bought — differ mostly in licensing, and **licensing is the one part with a technical
  consequence**: assets that cannot be redistributed cannot go in `static/` behind a public
  CloudFront distribution.

Where they live is answerable, and section 1 gives both precedents. The sharper framing:
if the preset key is stored in the database and the URL is derived (`/avatars/<key>.svg`,
mirroring `modelUrlFor`), the assets must be in `static/` and are then subject to the same
"rebuilt asset needs an invalidation" caveat the `.glb` comment already accepts. If the key
maps through an explicit `Record<PresetKey, string>` of Vite imports, the assets are hashed
and self-busting, but a key with no map entry must render *something* — which drags the
"unknown key" case into the UI whether or not it is a real state in the data.

---

## 3. Is "no avatar" a distinct state?

Research can only supply the mechanics; the call is a product one. The mechanics:

- **Every user has a `displayName` from row creation** (`apps/api/src/auth.ts:59` falls back
  to the email, then to the literal `"New user"`). Initials are therefore always
  derivable, and never empty. Note the fallback: a user whose Cognito `name` and `email`
  are both missing is literally named `New user` — initials would read `NU`.
- **A nullable column and a `{kind:"none"}` variant are not equivalent under DSQL.** See
  section 4: you can add a nullable column later, but you cannot add `NOT NULL` to an
  existing column, and you cannot change a column's type. Whichever of the two you pick is
  effectively permanent for the life of the table.
- **Ark's `Avatar.Fallback`** renders exactly when the image is absent or fails, so the
  "derived default" path needs no branching in the component — it is the fallback slot's
  content.

### Derived-default libraries — live registry data, 2026-08-16

Checked with `npm view <pkg> version time.modified license dependencies dist-tags` on
2026-08-16:

| Package | Latest | Last published | License | Deps | Verdict |
| --- | --- | --- | --- | --- | --- |
| `@dicebear/core` | `10.6.0` | **2026-08-16** | MIT | **none** | **Only actively maintained option.** Framework-agnostic, emits an SVG string |
| `@dicebear/collection` | `9.4.2` (`v9-lts` → `9.4.3`) | 2026-07-05 | MIT | peer `@dicebear/core@^9.0.0` | Style packs; see trap 1 |
| `minidenticons` | `4.2.1` | 2024-03-01 | MIT | **none** | Smallest (18 KB unpacked), zero deps, pure `identiconSvg(name) -> string`. **Dormant ~2.5 years** |
| `jdenticon` | `3.3.0` | 2024-05-10 | MIT | `canvas-renderer@~2.2.0` | 721 KB unpacked, drags a canvas renderer. Dormant |
| `identicon.js` | `2.3.3` | 2022-06-19 | BSD | — | Dormant 4+ years |
| `boring-avatars` | `2.0.4` | 2025-09-28 | MIT | peer `react>=18`, `react-dom>=18` | **Unusable — React only** |
| `svelte-boring-avatars` | `1.2.6` | 2024-03-08 | MIT | — | Unaffiliated third-party port, ~967 weekly downloads. Treat as abandoned |

Three live traps worth writing down:

1. **DiceBear's own packages are out of step.** `@dicebear/core`'s `latest` is `10.6.0`
   (published today), but every style package tops out at `9.4.x` and peers on
   `@dicebear/core@^9.0.0`. `npm view @dicebear/collection@10` returns **404 — no such
   version exists**. `pnpm add @dicebear/core @dicebear/collection` at `latest` produces an
   unmet peer dependency. The coherent pin is the `v9-lts` dist-tag on both, which resolves
   to `@dicebear/core@9.4.3` + `@dicebear/collection@9.4.3`.
2. **Never `@dicebear/converter`** — it pulls `sharp`, `@resvg/resvg-js` and
   `exiftool-vendored`, which is a non-starter inside the tRPC Lambda bundle. The SVG-string
   path in `@dicebear/core` has no native deps.
3. `boring-avatars` is the one most often suggested and is the one that cannot be used —
   its peer dependencies are React. The Svelte port has not been published in over two
   years.

The honest summary: if "maintained" is a criterion, the list is one entry long, and it costs
two pinned packages. If "smallest thing that works" is the criterion, `minidenticons` is
18 KB of zero-dependency ESM that has not needed a commit since 2024 — dormant is not
automatically broken for a pure function that turns a string into an SVG.

**Unverified:** whether any of these produce output that reads as *this app's* art
direction rather than as generic geometric noise. That is a look-at-it question, and the
`/prototype` card (<https://trello.com/c/SMvESq0e/96>) is where it gets answered.

The cheapest derived default needs no library at all: initials on a colour derived from the
user id, rendered as Tailwind classes inside `Avatar.Fallback`. It has a real advantage
over an identicon — initials tie the avatar to the `displayName` that is already the byline,
so the two do not read as unrelated facts about the same person.

---

## 4. The column shape, and what DSQL actually permits

This is where the card's phrase "without a migration" needs to be re-examined, because the
DSQL constraints move the cost around.

### 4.1 A migration here is cheap. Some column changes are impossible.

Adding a migration in this repo is a file plus a deploy: `pnpm db:migrate:new` generates it
via `aurora-dsql-prisma`, and `apps/api/scripts/migrate.ts:19-31` runs `prisma migrate
deploy` under the linked DSQL resource in CI and in `sst dev`. `000003_add_remixed_from` is
the whole precedent — eight lines, one `ALTER TABLE ... ADD COLUMN`.

So "without a migration" is not really about avoiding a file. It is about avoiding the
DDL operations DSQL does not have. Those are the facts that should drive the decision:

Aurora DSQL publishes an explicit supported-syntax grammar for `ALTER TABLE`
(<https://docs.aws.amazon.com/aurora-dsql/latest/userguide/alter-table-syntax-support.html>).
What it contains, and what it conspicuously does not:

| Operation | DSQL |
| --- | --- |
| `ADD [COLUMN] [IF NOT EXISTS] name type` | **Supported** |
| `DROP COLUMN` | Supported — but "does not physically remove the column… Dropping a column does not reclaim its attribute number" |
| `ALTER COLUMN … SET DEFAULT` / `DROP DEFAULT` | Supported |
| `ALTER COLUMN … DROP NOT NULL` | Supported |
| `ALTER COLUMN … SET NOT NULL` | **Absent from the grammar** |
| `ALTER COLUMN … [SET DATA] TYPE …` | **Absent from the grammar** |
| `ADD CONSTRAINT … CHECK (…)` | Supported, **`NOT VALID` is mandatory**, then `ALTER TABLE ASYNC … VALIDATE CONSTRAINT` |
| `ADD CONSTRAINT … FOREIGN KEY` | Not in the grammar (`table_constraint` is `CHECK` only) |
| `CREATE TYPE … AS ENUM` | **Not supported** — the data-types page states outright that "Aurora DSQL doesn't currently support `CREATE TYPE`" |
| `CREATE DOMAIN` | Listed as a supported DDL target |

On the CHECK path, verbatim from that page: *"In Aurora DSQL, `CHECK` constraints added via
`ALTER TABLE ADD CONSTRAINT` must use the `NOT VALID` option… The constraint applies
immediately to all new rows and updates."*

Two more rules from the migration guide
(<https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-migration-guide.html>),
which `000001_init`'s header comment already encodes:

> - DDL and DML operations require separate transactions
> - A transaction can include only 1 DDL statement

So a migration that adds a column *and* backfills it is two transactions and is **not
atomic**.

**The one-way door:** because `ALTER COLUMN … TYPE` is not in the grammar, **the column type
chosen now cannot be changed later**. `text` → `jsonb` is not an `ALTER`; it is add a new
column, backfill in ≤3,000-row batches (quota page), switch the code, drop the old column,
and live with the dropped column permanently consuming one of the table's 255 active /
1,600 lifetime attribute numbers.

**The second one-way door:** `SET NOT NULL` is not in the grammar either. A column added to
`users` later is nullable forever. `NOT NULL` is only available at `CREATE TABLE` time.

Both statements above are read off the published "Supported syntax" grammar. The DSQL docs
publish what *is* supported and do not publish a matching list of unsupported `ALTER TABLE`
subcommands, so "`ALTER COLUMN TYPE` is unsupported" is **strongly implied by the grammar
but not stated in those words anywhere I could fetch**. Flagged, not smoothed over.

### 4.2 `jsonb` is a worse fit on DSQL than on stock Postgres

`json` and `jsonb` are supported types, but the supported-data-types page's own table gives
them **Index support: No**, while `text` gets **Index support: Yes**
(<https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-supported-data-types.html>).
`CREATE INDEX`'s published grammar has **no `USING method` clause and no `WHERE` clause**
(<https://docs.aws.amazon.com/aurora-dsql/latest/userguide/create-index-syntax-support.html>),
so GIN indexes and partial indexes are both off the table. Expression indexes *are*
supported, over immutable expressions — whether `((avatar->>'kind'))` is accepted by DSQL
specifically is **unverified**.

Postgres' own guidance still favours `jsonb` over `json`
(<https://www.postgresql.org/docs/current/datatype-json.html>): *"most applications should
prefer to store JSON data as `jsonb`"*, and jsonb is *"slightly slower to input due to
added conversion overhead, but significantly faster to process, since no reparsing is
needed"* — but the documented advantage that *"`jsonb` also supports indexing"* is exactly
the one DSQL removes.

**Unverified:** Postgres publishes no byte-level figure for jsonb's structural overhead
versus `text`. Don't quote one.

Note also that this repo already stores JSON as `jsonb` (`animations.payload`), and the
schema comment marks it *"never indexed"* (`schema.prisma:43`) — consistent with the above.

### 4.3 CHECK constraints do not stop NULL

<https://www.postgresql.org/docs/current/ddl-constraints.html>, verbatim: *"a check
constraint is satisfied if the check expression evaluates to true or the null value…
they will not prevent null values in the constrained columns."* Combined with DSQL's
missing `SET NOT NULL`, a CHECK added to a nullable column later constrains the non-null
values and nothing else.

### 4.4 The candidate shapes

| Shape | Reads as | Adds "uploaded" later by | What it costs |
| --- | --- | --- | --- |
| **A. Bare preset key** — `avatar_preset TEXT NULL` | `"cat-01"` or NULL | Adding a **second** column `avatar_url TEXT NULL` and a precedence rule in code | Cheapest today, identical to the `visibility` precedent. The precedence rule ("URL wins over key") is an invariant with no representation — two columns can disagree, and nothing prevents it. |
| **B. Two columns, explicit kind** — `avatar_kind TEXT NULL` + `avatar_ref TEXT NULL` | `("preset","cat-01")` / `("uploaded","<key>")` | Nothing — a new `kind` value is a code change only | Still `text`, still indexable, still CHECK-able. The discriminator is a real column, so `z.discriminatedUnion` maps onto it directly. Two columns can still disagree (`kind` set, `ref` NULL) but the illegal states are nameable in one parse function. |
| **C. One jsonb column** — `avatar JSONB NULL` holding `{kind,key}` | `{"kind":"preset","key":"cat-01"}` | Nothing | One column, one parse, illegal states hardest to reach. But: not indexable on DSQL (§4.2), and the shape is invisible to anyone reading the schema. |
| **D. One text column holding JSON** — `avatar TEXT NULL` | the same JSON, as a string | Nothing | Indexable, but you have parsed twice (string → JSON → typed) and the database can no longer tell you the value is even JSON. Strictly worse than C unless you need the index. |
| **E. Enum type** | — | — | **Impossible on DSQL** — no `CREATE TYPE`. |

The card frames this as "A vs C". The table's point is that **B is the shape the card's own
constraints actually describe**: a discriminated value that can grow a variant, in the
indexable type, in the style this repo already uses for `visibility`.

What none of the shapes buy you: an uploaded avatar was never blocked by the column. It is
blocked by there being no bucket, no CDN, no presigner, no moderation and no orphan cleanup
(§1, and the parent card's out-of-scope list). Choosing shape C to "avoid a migration later"
buys a file you would have written anyway, at the cost of an unindexable column you cannot
convert back.

### 4.5 Recommendation

**Prefer B (two `text` columns with an explicit `kind`), or A if the uploaded variant is
genuinely accepted as never-happening.** The reasoning, with the constraints named:

1. `text` is the only shape that keeps the index option open, and index options cannot be
   reopened later because `ALTER COLUMN TYPE` does not exist on DSQL (§4.1). Nobody needs
   to index an avatar today — but "cheap and reversible" is the wrong description of a
   jsonb column here, and it should not be chosen under that impression.
2. An explicit `kind` column is what makes `z.discriminatedUnion` the boundary parser
   rather than a hand-rolled precedence rule. §5 shows it works in the installed version.
3. Both columns nullable is not a choice — DSQL has no `SET NOT NULL` for a column added
   later (§4.1). So "no avatar" is representable whether or not it is designed to be, and
   the parse function has to decide what NULL means regardless. That argues for deciding it
   deliberately rather than discovering it.
4. If a DB-level guarantee on the key set is wanted, it is `ADD CONSTRAINT … CHECK (…) NOT
   VALID` plus `ALTER TABLE ASYNC … VALIDATE CONSTRAINT` — two DDL transactions, and
   widening the set later means `DROP CONSTRAINT` + re-`ADD … NOT VALID`, two more, with a
   window in between where nothing is enforced. Given `visibility` ships with no CHECK at
   all, adding one here would be a new pattern, not a continuation of one.

The counter-argument for C, stated fairly: it is one column, one parse, and the illegal
states are unreachable rather than merely undocumented. If the avatar is never queried and
never indexed — which is the likely truth — the DSQL indexing loss is theoretical, and C is
the tidier model. The decision turns on how much you weigh "unindexable, unconvertible"
against "one value, not two".

### 4.6 What the uploaded variant would actually cost, so the column can be judged against it

Priced out, because "admits uploads later without a migration" is only worth paying for if
the migration is the expensive part. It isn't.

The repo is on **`sst@4.17.1`** (`package.json:20`, lockfile), not SST v3 — CLAUDE.md's
"tRPC v11 on Lambda via SST v3" is stale on that point. The component API below is current
for v4.

- **Bucket:** `const bucket = new sst.aws.Bucket("Avatars")`
  (<https://sst.dev/docs/component/aws/bucket/>). Adding it to `TrpcFn`'s `link` array
  grants the IAM permissions and injects the name — the docs say linking *"allows the
  linked function or app to access the bucket through the SDK and generate authenticated
  operations like pre-signed URLs."* No hand-written policy.
- **CORS is already right by default.** The Bucket component enables CORS with
  `allowMethods: ["DELETE","GET","HEAD","POST","PUT"]`, `allowOrigins: ["*"]`,
  `exposeHeaders: ["ETag"]`. A browser presigned `PUT` works out of the box; you would want
  to narrow `allowOrigins` for production. **This is a different mechanism from the
  API Gateway CORS workaround** the config fights with at `sst.config.ts:76-89` — the two
  must not be conflated.
- **Signing:** `getSignedUrl(new S3Client({}), new PutObjectCommand({ Bucket:
  Resource.Avatars.name, Key: ... }))`, per the SST SvelteKit tutorial
  (<https://sst.dev/docs/start/aws/svelte/>) and
  <https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-s3-request-presigner/>.
  Note the tutorial signs in a SvelteKit `+page.server.ts`; here it belongs on `TrpcFn` as a
  mutation, since that is where this repo's server logic lives.
- **Not installed:** neither `@aws-sdk/client-s3` nor `@aws-sdk/s3-request-presigner` appears
  in any `package.json`. Both would be new dependencies in `apps/api`.

So the uploaded variant is: a new SST component, two new SDK dependencies, a new mutation, a
CloudFront/CDN decision, plus everything the parent card already listed as the real cost
(moderation, orphan cleanup). Against that, the eight-line `ALTER TABLE ADD COLUMN` that
shape A would need is rounding error. **The column shape should be chosen on which model is
clearest, not on which one dodges a migration file.**

**Unverified:** SST's default `maxAge: "0 seconds"` implies a preflight on every PUT, but no
doc states it outright; and neither SST nor the AWS page states `getSignedUrl`'s default
expiry.

---

## 5. Validation and the boundary parse

### The installed Zod is 3.25.76, which is *both* v3 and v4

`apps/api/package.json:30` declares `"zod": "^3.25.0"`; `pnpm-lock.yaml:3111` resolves
`zod@3.25.76`. Reading that package's own `exports` map in `node_modules` shows subpaths
`.`, `./v3`, `./v4`, `./v4-mini`, `./v4/core`, `./v4/locales`. Every import in this repo is
a bare `from "zod"` — i.e. **the classic v3 API**, not `zod/v4`.

`z.discriminatedUnion` exists in both, and in **both** the discriminator string is still a
required first argument — zod.dev's API page shows `z.discriminatedUnion("status", [...])`
(<https://zod.dev/api>), and the array-only form throws `opts is not iterable` against the
bundled v4 core. Verified by running against the installed copy on 2026-08-16:

```ts
import { z } from "zod";

export const AVATAR_PRESETS = ["cat-01", "cat-02" /* … */] as const;

const avatarSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("preset"), key: z.enum(AVATAR_PRESETS) }),
  z.object({ kind: z.literal("uploaded"), url: z.string().url() }),
]);
```

**v4's error for an unmatched discriminator is worse, not better** — the one genuinely
decision-relevant difference. Both runs are verbatim output from the installed package:

```
v3: [{ code: "invalid_union_discriminator",
       options: ["preset","uploaded"], path: ["kind"],
       message: "Invalid discriminator value. Expected 'preset' | 'uploaded'" }]

v4: [{ code: "invalid_union", errors: [], path: ["kind"],
       note: "No matching discriminator", message: "Invalid input" }]
```

v4 dropped the `invalid_union_discriminator` code and no longer names the valid options —
you get a generic `"Invalid input"`, with the useful text demoted to a non-standard `note`.
Since this API returns Zod messages to the client (`apps/api/src/router.ts:69` interpolates
`result.error.issues[0]?.message` straight into the `TRPCError`), v3's message is the more
actionable one. On v4 you would want an explicit `error` param to get it back.

So the card's premise ("Zod v4 discriminated unions") needs one correction: **this repo is
on the v3 API today**, and nothing about the avatar shape requires moving to `zod/v4`. What
v4 *does* add that v3 lacks is documented nesting — a discriminated union usable as an
option inside another discriminated union — which an avatar value does not need.

Two caveats on the above: **the v4 error shape is not documented on zod.dev at all** (it is
empirical, from running the installed build), and **whether tRPC v11's input-parser typing
accepts a `zod/v4` schema here is unverified** — not tested, and out of scope for this card.

### Server-side enforcement

The card asks whether the preset key is checked server-side against a known set, or is free
text. The answer the repo already gives for `visibility` is: **the column is free text; the
boundary is not.** `z.enum(VISIBILITIES)` at `router.ts:388` is the only thing standing
between a client and an arbitrary string in that column, and it is sufficient because there
is no other writer.

The same works here, with one asymmetry worth naming: `visibility` is *consumed by queries*
(`listWhere`, `router.ts:130`), so a bogus value silently makes an animation invisible. An
avatar key is *consumed by an `<img src>`*, so a bogus value is a broken image on a public
gallery card. If the preset key is ever interpolated into a URL (`/avatars/<key>.svg`), the
enum check is also a **path-traversal guard**, and it is the only one — `modelUrlFor`
(`robots.ts:14-17`) does the same interpolation today with a slug that only migrations can
set, which is not true of a user-writable avatar key.

### Client-side read

Per `docs/typescript.md:71-104` and the precedent in
`apps/web/src/lib/animation/payload.ts`, the byline should parse and *degrade*, not throw:
an avatar row written by a newer build with a `kind` this build does not know must render
the fallback, not crash the gallery. That mirrors `visibilityOf`'s `?? null`
(`apps/web/src/lib/editor/visibility.ts:27-30`). A `switch` over the parsed kind must still
be exhaustive with a `never` default per `docs/typescript.md:163-191` — the two rules
compose: parse tolerantly at the edge, switch exhaustively once inside.

---

## 6. Where the avatar renders — the question behind the question

Three sites (§1). The header one is free. The two bylines are not, and they are what turn
this from a preference into public data:

- Adding `avatar` to `ownerRobotSelect` (`router.ts:75-78`) publishes it on **every public
  gallery card and every animation detail page**, including to signed-out visitors — the
  gallery is a `publicProcedure` (`router.ts:228-230`).
- The parent card's settled constraint is that *registered devices* are private forever. It
  says nothing about the avatar, and the avatar is the opposite: a preset avatar's whole
  point is that other people see it. Worth making that explicit rather than implicit, since
  the profile page will host both.
- `/my` has no owner byline at all, so nothing changes there.

A fourth site is worth raising because nobody has: the **remix attribution** component
(`apps/web/src/lib/components/remix-attribution/RemixAttribution.svelte`) names a source
animation, and ADR-0001 already establishes that uploading someone else's animation is
allowed. Whether attribution grows an avatar is a design call, not a data one.

---

## 7. What this note could not verify

- **The preset set itself** — count, art direction, who draws them. Not a research
  question; §2 says why and gives the two constraints that do bind (dark mode, licensing).
- **`ADD COLUMN` with an inline `DEFAULT` or `NOT NULL` on DSQL.** The published
  `ALTER TABLE` grammar's `ADD COLUMN` action has no `column_constraint` slot, but the same
  page's prose says the form uses *"the same syntax as `CREATE TABLE`"*, whose
  `column_constraint` does include both. The two statements conflict. Safe read: use
  `ADD COLUMN col type` alone, then `ALTER COLUMN col SET DEFAULT …` as a separate DDL
  transaction.
- **Explicit DSQL statements that `ALTER COLUMN TYPE` and `SET NOT NULL` are unsupported.**
  Both are absent from the "Supported syntax" grammar, which is strong evidence, but AWS
  publishes no matching "unsupported subcommands" list saying so in words.
- **Whether an expression index on `((avatar->>'kind'))` works on DSQL.** Expression
  indexes over immutable expressions are documented as supported; this specific expression
  is neither blessed nor forbidden.
- **jsonb's byte-level overhead vs `text`** — postgresql.org gives only qualitative
  statements.
- **Whether tarkui.com ships an Avatar block.** The underlying `@ark-ui/svelte` Avatar is
  confirmed installed; the Tark wrapper was not checked.
- **Whether tRPC v11 accepts a `zod/v4` schema here without changes.** Not tested.
- **Zod v4's `invalid_union` error shape** is empirical (run against the installed build);
  zod.dev does not document error codes for this case.
- **The identicon libraries' visual fit**, and their tree-shaken browser bundle sizes —
  `dist.unpackedSize` includes types, CJS+ESM and sourcemaps, so it is a rough signal only.
  Nothing was built. Whether the output looks like this app is for `/prototype`.
- **SST's presigned-PUT preflight behaviour** (`maxAge: "0 seconds"`) and `getSignedUrl`'s
  default expiry — neither is stated on a first-party page.

---

## Source links

- Aurora DSQL — `ALTER TABLE` supported syntax: <https://docs.aws.amazon.com/aurora-dsql/latest/userguide/alter-table-syntax-support.html>
- Aurora DSQL — `CREATE TABLE` supported syntax: <https://docs.aws.amazon.com/aurora-dsql/latest/userguide/create-table-syntax-support.html>
- Aurora DSQL — `CREATE INDEX` supported syntax: <https://docs.aws.amazon.com/aurora-dsql/latest/userguide/create-index-syntax-support.html>
- Aurora DSQL — supported data types: <https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-supported-data-types.html>
- Aurora DSQL — supported SQL features: <https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-supported-sql-features.html>
- Aurora DSQL — migration guide (transaction constraints, referential integrity): <https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-migration-guide.html>
- Aurora DSQL — cluster quotas: <https://docs.aws.amazon.com/aurora-dsql/latest/userguide/CHAP_quotas.html>
- PostgreSQL — JSON types: <https://www.postgresql.org/docs/current/datatype-json.html>
- PostgreSQL — constraints: <https://www.postgresql.org/docs/current/ddl-constraints.html>
- PostgreSQL — enumerated types: <https://www.postgresql.org/docs/current/datatype-enum.html>
- SvelteKit — project structure (`static/`): <https://svelte.dev/docs/kit/project-structure>
- SvelteKit — images / imported assets: <https://svelte.dev/docs/kit/images>
- Vite — static asset handling and `assetsInlineLimit`: <https://vite.dev/guide/assets>, <https://vite.dev/config/build-options>
- Zod — API reference, discriminated unions: <https://zod.dev/api>
- SST — Bucket component: <https://sst.dev/docs/component/aws/bucket/>
- SST — SvelteKit tutorial (presigned PUT): <https://sst.dev/docs/start/aws/svelte/>
- AWS SDK for JavaScript v3 — `@aws-sdk/s3-request-presigner`: <https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-s3-request-presigner/>
- npm registry via `npm view`, 2026-08-16, for every version, date and dist-tag in §3
