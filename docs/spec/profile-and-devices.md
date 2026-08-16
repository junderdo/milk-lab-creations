# Profile and Registered Devices — Spec (in assembly)

Destination artifact of the [user profile and registered devices wayfinder map](https://trello.com/c/gi2Ipg3P/91-wayfinder-map-user-profile-and-registered-devices).

**This document is incomplete by design.** The map is still being walked; each resolved ticket adds a
section. What is written here is settled and should not be reopened without cause. What is missing is
listed in §7, with the card that will settle it.

Landed so far:

- [Grilling: what an avatar preset is](https://trello.com/c/EO7vV5gf/93-grilling-what-an-avatar-preset-is) → §1
- [Grilling: the Device data model and where dismissal lives](https://trello.com/c/gGofc2Rh/94-grilling-the-device-data-model-and-where-dismissal-lives) → §2–§6

**Scope:** the web app's profile section — a preset avatar, a private list of registered devices, and
registering a pair of ears after a Web Bluetooth connect.

**Out of scope (decided on the map, not reopened here):** uploaded avatar images; public profile pages
and handles; social device features; per-device slot mirroring and upload history; the OpenAuth
migration.

---

## 1. Avatar

Settled on card 93 and recorded here for completeness; see the map card for the full rationale and
[`docs/research/avatar-preset-shape.md`](../research/avatar-preset-shape.md) for the constraint work
behind it.

`users.avatar TEXT`, nullable **forever** (DSQL has no `SET NOT NULL` and no `ALTER COLUMN TYPE`, so
both the nullability and the `text` type are one-way doors), holding a prefixed token such as
`preset:cat-01`. The prefix is the discriminant, so a later `upload:<key>` needs no migration. Eight
robo-cat-ears colourways ship in `apps/web/src/lib/assets/avatars/` behind a typed map.

There is **no "no avatar" state in the domain**: `avatarOf(null)` returns `PRESETS[hash(id) % 8]`, so
NULL is absorbed at the boundary and `setAvatar` is the only writer. `setAvatar` takes a bare key under
`z.enum` and the server prepends the prefix, so the client can never author the variant. The avatar
renders wherever `displayName` does — header, gallery byline, detail byline — so `ownerRobotSelect`
gains `avatar`, and the avatar is public data.

---

## 2. The `Device` model

```prisma
model Device {
  ownerId   String   @map("owner_id") @db.Uuid
  serial    String
  name      String
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  owner User @relation(fields: [ownerId], references: [id])

  @@id([ownerId, serial])
  @@map("devices")
}
```

`User` gains `devices Device[]`. Migration `000004_add_devices`, one DDL statement per explicit
`BEGIN/COMMIT` block per the DSQL dialect the existing migrations use.

### 2.1 The key is `(ownerId, serial)`, with no surrogate id

This is the one table in the schema without a UUID primary key, and the inconsistency is deliberate.

- **It deletes a bug class.** Every procedure addresses a device as `(caller's ownerId, serial)`. The
  owner is not a filter someone has to remember to write — it is half the key. `rename` cannot be made
  to touch another user's row even by a careless implementation, which is the usual way this shape of
  table goes wrong.
- **The only read needs no secondary index.** "My devices" is `WHERE owner_id = $1`, a prefix scan of
  the primary key. A surrogate id would cost a UUID PK _and_ a unique index, neither of which serves any
  query the feature has.
- **Uniqueness stops depending on a background build.** Index creation on DSQL is always asynchronous
  (`CREATE INDEX ASYNC` is mandatory syntax), so a unique index is not enforced until its job completes.
  A primary key declared in `CREATE TABLE` is structural.

Costs accepted: the serial appears in any client cache key that addresses a device, and a future table
referencing a device would carry two columns. The map rules out the referencing case, and the serial is
already held in memory by the client.

`ALTER TABLE … ADD PRIMARY KEY` is absent from DSQL's published `ALTER TABLE` grammar, so **treat the
key choice as permanent.**

### 2.2 `serial` is bare `TEXT`, lowercase hex

- **Not `bytea`.** AWS's supported-data-types page gives `bytea` **"Index support: No"**. The serial
  must sit in the primary key, so binary storage is not merely unattractive — it is unavailable.
- **Not `VARCHAR(n)`.** `ALTER COLUMN … TYPE` is absent from the DSQL grammar, so a width chosen today
  is permanent, and the width is exactly the number that is still unresearched (see §7). Bare `TEXT`
  also matches every other string column in this schema; a lone length-typed column would read as
  though the length were load-bearing.
- **Width and alphabet are pinned in Zod, not in the database.** `SERIAL_HEX_CHARS` goes in
  `apps/api/src/limits.ts` (dependency-free and shared with the web app, like `NAME_MAX`), consumed as
  `z.string().regex(/^[0-9a-f]{SERIAL_HEX_CHARS}$/)` in `router.ts`. DSQL adds `CHECK` constraints as
  `NOT VALID`, so the boundary schema was always going to be the real gate.

**Lowercase is strict — uppercase is rejected, not normalized.** `'AB12' ≠ 'ab12'` to Postgres, so two
legal spellings would let the same physical device be registered twice by one owner, which is the one
thing the composite key exists to prevent. "Be liberal in what you accept" does not apply: the only
producer is our own client, formatting bytes it read from a `CAPABILITY` frame with a hex encoder we
write. If the firmware ever emits the serial as an uppercase _string_, the client normalizes before the
schema sees it — do not loosen the regex to make a 400 go away.

### 2.3 `name` is required, reuses `nameSchema`, and is not unique

`name TEXT NOT NULL`, validated by the existing `nameSchema` (trimmed, 1–100). `NOT NULL` is only
available at `CREATE TABLE` time on DSQL, and this is the column worth spending that door on.

There is **no database default**. The map fixed the payoff of registration as _naming_; a device that
can be registered without a name makes the feature's own justification optional at the moment it is
offered. Registration and naming are one action, which is also what gives "not now" a clear meaning.

The BLE advertised name is not the default, because it is a **model** name, not a per-unit one — two
pairs would both arrive called the same thing, failing exactly the user who owns two pairs. (`device.name`
is also optional in the Web Bluetooth API; `web-bluetooth.ts` already falls back to `"Your ears"`.) A
registration dialog may _prefill_ the input with a suggestion — that is UI, not schema.

Two pairs may share a name. It is a label, not an identifier.

### 2.4 There is no `lastConnectedAt`

The card worried that "a write on every handshake is a write on every page load." That is not this
app's shape: `connect()` early-returns unless the status is `disconnected`, `requestDevice` needs
transient user activation so it can only run out of a click, and the connection deliberately does not
survive a reload. A handshake happens when the user presses the chip — roughly once per tab session.

So cost was never the objection. The objection is that **nothing reads it**: the map rules out
per-device history, and a timestamp of when you last wore a device is a different category of data from
a name you chose, on a table the map insists is private permanently.

This is also the one column here that is cheap to revisit — `ADD COLUMN` of a _nullable_ column is
supported on DSQL. If a "sort by recency of use" ordering is ever wanted, add it then.

---

## 3. Where a dismissed registration prompt is remembered

**Client-side, in `localStorage`. Nothing about a declined device reaches the server.**

Key: `milklab:device-dismissed:<userId>:<serial>`, one key per dismissal, behind a `dismissed.ts`
module alongside the existing `theme.ts` / `timeline-height.ts` / `draft.ts` wrappers and sharing their
"the browser may refuse to hand it over" fallback.

- **Why not a row.** A `Device` with a `dismissed` status, or a separate table, both mean the server
  permanently stores an identifier for a device the user explicitly declined to associate with their
  account. It is the only option here that requires defending, and no reader for it is coming.
- **Why per-user, not per-browser.** A dismissal is the photographic negative of a registration, and
  registration is scoped to `(ownerId, serial)`. Sharing a browser must not let one user's "not now"
  silence another's prompt.
- **Why a key each, not one JSON array.** A check is a single `getItem` with no read-modify-write, and a
  corrupt value poisons one device rather than all of them. Nothing enumerates dismissals.

### 3.1 A dismissal silences the prompt, never the feature

Registration stays **permanently reachable from the connected chip**. "Not now" means "stop asking", not
"hide this". This is what makes a forgettable store an acceptable home: the data it holds is a
nag-suppressor, not the load-bearing route to a feature.

Accepted consequence: a new browser, a private window, or cleared site data re-offers registration once.
That is the same class of friction as the connect-per-session contract the app already states out loud
on the chip, and it costs one tap.

Rejected: an expiring dismissal. It re-raises the exact prompt the user declined, and it needs a policy
number nobody can justify. If a user cannot find the second door, fix the door.

### 3.2 Pre-serial firmware never dismisses

Firmware without a serial in `CAPABILITY` shows the registration affordance visible-but-disabled with
the reason on the page (ADR-0001's precedent). With no serial there is no key to write, so the dismissal
store simply has no entry for those ears. No special case is needed anywhere.

### 3.3 Forgetting a device also writes a dismissal

`forget` deletes the row **and** writes the local dismissal key. Forgetting and dismissing are the same
intent — "I don't want these in my list" — expressed at two moments, and the only reason they are two
mechanisms is that one has a row and the other does not. Without this, forgetting a device you are
currently connected to makes the app immediately offer to register it again, which is precisely the
nagging that dismissal exists to stop.

This is why the store is a module rather than two inline `setItem` calls.

Accepted asymmetry: a server action writing client state means forgetting on your phone leaves your
laptop still prompting. That is the price of §3, not a new cost, and it is the same shape as "a new
browser re-prompts".

---

## 4. Reading devices: the chip shows the registered name

The user's chosen name must appear where the user already looks. `chipView` currently renders
`state.deviceName`, the per-model advertised string; the chip is, by its own header comment, "the only
place that connects and it doubles as the connection's status display". A name that only ever appeared
on a rarely-visited list would mean the user had named a database row, not their ears.

**The name is resolved client-side from a cached device list**, not fetched on the connect path.

- The list is a handful of rows and is needed anyway — the profile page reads it, `register` inserts
  into it, `rename` and `forget` mutate it. One store, several readers.
- The connect sequence is already a multi-step GATT dance with a five-second request timeout and a
  hand-written serialization queue. Bolting a network call onto the end of it raises the question of
  what the chip displays while that call is in flight; a cache has the answer before the handshake
  finishes.
- Signed out, there is no list and the chip keeps the advertised name — today's behaviour.

Accepted staleness: renaming on another device leaves this one showing the old name until the list is
refetched.

---

## 5. Procedure surface

`devices.list | register | rename | forget`, all `authedProcedure`. Every one is addressed by
`{ serial }`; **the owner comes from the session and never from input.**

| Procedure  | Input              | Notes                                                                                                                                                      |
| ---------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list`     | —                  | Ordered by `name` ascending, `createdAt` as tie-break (names are not unique).                                                                              |
| `register` | `{ serial, name }` | Already-registered serial → `CONFLICT`. The cached list means the UI should not offer it, so reaching this is a bug worth surfacing rather than absorbing. |
| `rename`   | `{ serial, name }` |                                                                                                                                                            |
| `forget`   | `{ serial }`       | See §3.3 — the client also writes the dismissal key.                                                                                                       |

## 6. Account deletion reaps devices

`deleteAccount` (`apps/api/src/router.ts`) hand-cascades animations because `relationMode = "prisma"`
means there are no FK cascades. It gains, under `withOccRetry` and **before** the user row is deleted:

```ts
await withOccRetry(() => ctx.db.device.deleteMany({ where: { ownerId: ctx.dbUser.id } }));
```

A single statement, not the batched loop the animations cascade uses. That loop exists for a stated
reason — DSQL's 3,000-row / 10 MiB transaction limit — which does not apply to rows that correspond to
physical objects someone bought. Copying it would mislead the next reader about the cardinality.

Without this, a `devices` table orphans rows on account deletion permanently: nothing else references
them, and a re-registration under a fresh Cognito sub would never collide, because the key is
`(ownerId, serial)`.

### 6.1 Stated non-goal: the serial is client-asserted

Nothing stops a client registering a serial it never saw. This is accepted, not overlooked. Rows are
per-owner and permanently private, there is no global `Device` entity, and no reader crosses users — so
the only person affected by a fabricated serial is the fabricator, whose own list gets an entry for ears
that do not exist. Do not add a proof-of-possession scheme without a reader that would justify it.

---

## 7. Not yet settled

| Question                                                                                                                                                                                                                                                         | Card                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The serial's byte width, and therefore `SERIAL_HEX_CHARS` — everything above is written to accept it as a constant.                                                                                                                                              | [Research: how the ears derive a stable hashed serial](https://trello.com/c/9ymc6Nrg/92-research-how-the-ears-derive-a-stable-hashed-serial)             |
| The chip's shape. §3.1 and §4 mean a connected chip must offer _disconnect_ **and** _register_ while rendering a resolved name, but `ChipView.action` is a closed three-verb union. Menu, widened union, or something else — and the registration moment itself. | [Prototype: the profile page and the registration moment](https://trello.com/c/SMvESq0e/96-prototype-the-profile-page-and-the-registration-moment)       |
| The `CAPABILITY` wire change carrying the serial, and threading it from `openEarsLink` → `handshake` → connection state.                                                                                                                                         | [Grilling: the CAPABILITY wire change for the device serial](https://trello.com/c/UWfzOo1k/95-grilling-the-capability-wire-change-for-the-device-serial) |
| Whether ADR-0001 is amended or a new ADR records the device-identity decision.                                                                                                                                                                                   | unassigned                                                                                                                                               |
| Whether the stale-slot-list rule in `ble-protocol.md` §6 is fixed in the same change.                                                                                                                                                                            | unassigned                                                                                                                                               |
