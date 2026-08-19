# Profile and Registered Devices — Spec

Status: settled

Destination artifact of the [user profile and registered devices wayfinder map](https://trello.com/c/gi2Ipg3P/91-wayfinder-map-user-profile-and-registered-devices).

**The map is walked and every question it raised is answered.** What is written here is settled and
should not be reopened without cause. The durable decisions about device identity have been lifted into
[ADR-0002](../adr/0002-how-a-pair-of-ears-is-identified.md), which outlives this document; the sections
below point at it rather than restating it.

Cards that built it:

- [Grilling: what an avatar preset is](https://trello.com/c/EO7vV5gf/93-grilling-what-an-avatar-preset-is) → §1
- [Grilling: the Device data model and where dismissal lives](https://trello.com/c/gGofc2Rh/94-grilling-the-device-data-model-and-where-dismissal-lives) → §2–§6
- [Grilling: the CAPABILITY wire change for the device serial](https://trello.com/c/UWfzOo1k/95-grilling-the-capability-wire-change-for-the-device-serial) → §7
- [Prototype: the profile page and the registration moment](https://trello.com/c/SMvESq0e/96-prototype-the-profile-page-and-the-registration-moment) → §8, amending §3.1
- [Grilling: threading the serial from the link to the registration prompt](https://trello.com/c/6mAXmow0/97-grilling-threading-the-serial-from-the-link-to-the-registration-prompt)
  → §10, amending §5, §7.2 and §8.5, and adding an ordering rule to §3.3
- [Grilling: where the device-identity decision is recorded](https://trello.com/c/sEJ5S38p/98-grilling-where-the-device-identity-decision-is-recorded)
  → [ADR-0002](../adr/0002-how-a-pair-of-ears-is-identified.md), thinning §2.1, §2.2, §6.1 and §7 to
  pointers

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

**The reasoning is in [ADR-0002](../adr/0002-how-a-pair-of-ears-is-identified.md), which owns it.**
This is the one table in the schema without a UUID primary key, and the inconsistency is deliberate:
the owner is half the key rather than a filter someone has to remember to write.

Two consequences that bear on the rest of this spec:

- **"My devices" is `WHERE owner_id = $1`**, a prefix scan of the primary key. No secondary index, and
  none should be added.
- **Treat the key choice as permanent.** `ALTER TABLE … ADD PRIMARY KEY` is absent from DSQL's
  published `ALTER TABLE` grammar.

Costs accepted: the serial appears in any client cache key that addresses a device, and a future table
referencing a device would carry two columns. The map rules out the referencing case, and the serial is
already held in memory by the client.

### 2.2 `serial` is bare `TEXT`, lowercase hex

**The reasoning is in [ADR-0002](../adr/0002-how-a-pair-of-ears-is-identified.md)** — not `bytea`
(no index support on DSQL, and this column sits in the primary key), not `VARCHAR(n)` (no
`ALTER COLUMN … TYPE`, so a width chosen today is permanent either way), and lowercase strictly
rejected rather than normalized.

What to write here:

- `SERIAL_HEX_CHARS = 12` in `apps/api/src/limits.ts` (dependency-free and shared with the web app,
  like `NAME_MAX`), consumed as `z.string().regex(/^[0-9a-f]{12}$/)` in `router.ts`. DSQL adds `CHECK`
  constraints as `NOT VALID`, so the boundary schema was always going to be the real gate.
- If the firmware ever emits the serial as an uppercase _string_, the client normalizes before the
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

Registration stays **permanently reachable from the profile page** (§8.5, which amends this paragraph —
it originally named the connected chip, before the page existed). "Not now" means "stop asking", not
"hide this". This is what makes a forgettable store an acceptable home: the data it holds is a
nag-suppressor, not the load-bearing route to a feature.

Accepted consequence: a new browser, a private window, or cleared site data re-offers registration once.
That is the same class of friction as the connect-per-session contract the app already states out loud
on the chip, and it costs one tap.

Rejected: an expiring dismissal. It re-raises the exact prompt the user declined, and it needs a policy
number nobody can justify. If a user cannot find the second door, fix the door.

### 3.2 Ears with no serial never dismiss

Ears that report no serial show the registration affordance visible-but-disabled with the reason on the
page (ADR-0001's precedent). With no serial there is no key to write, so the dismissal store simply has
no entry for those ears. No special case is needed anywhere.

"No serial" has more than one cause, and the reason shown differs — see §7.3. The dismissal store does
not care which: absence is absence.

### 3.3 Forgetting a device also writes a dismissal

`forget` deletes the row **and** writes the local dismissal key. Forgetting and dismissing are the same
intent — "I don't want these in my list" — expressed at two moments, and the only reason they are two
mechanisms is that one has a row and the other does not. Without this, forgetting a device you are
currently connected to makes the app immediately offer to register it again, which is precisely the
nagging that dismissal exists to stop.

This is why the store is a module rather than two inline `setItem` calls.

**The dismissal is written before the row leaves the client store, and the order is load-bearing**
(§10.4). The prompt is derived from the device list, so removing the row flips the verdict to
"unregistered" in the same frame — without the key already written, forgetting a connected pair does
not merely re-offer registration later, it reopens the modal immediately.

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

| Procedure  | Input              | Notes                                                                                                                                                                                                                                       |
| ---------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list`     | —                  | Ordered by `name` ascending, `createdAt` as tie-break (names are not unique).                                                                                                                                                               |
| `register` | `{ serial, name }` | Returns the created row. Already-registered serial → `CONFLICT`; **§10.8 amends what the client does with it** — the cache is explicitly allowed to be stale (§4), so this is reachable without a bug and self-heals rather than surfacing. |
| `rename`   | `{ serial, name }` |                                                                                                                                                                                                                                             |
| `forget`   | `{ serial }`       | See §3.3 — the client also writes the dismissal key.                                                                                                                                                                                        |

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

Nothing stops a client registering a serial it never saw. This is accepted, not overlooked — see
[ADR-0002](../adr/0002-how-a-pair-of-ears-is-identified.md), which owns the reasoning and the rest of
what the serial does not promise. **Do not add a proof-of-possession scheme without a reader that
would justify it.**

---

## 7. The serial on the wire

Settled on card 95. **The wire contract is owned by `robo-cat-ears/docs/ble-protocol.md`**, which names
itself the contract between the three repositories, and the identity semantics are owned by
[ADR-0002](../adr/0002-how-a-pair-of-ears-is-identified.md). The appended field is documented in that
repository's §8 and §8.1. This section is the client's half: what the web app parses, and what it shows
when there is nothing to parse.

### 7.1 The record grows by six bytes, and the version does not move

```
[protocol_version:u8][slot_count:u8][max_chunk_bytes:u16][serial:6]
```

Ten bytes, big-endian as the rest of the record already is, the serial appended **last**, raw bytes on
the wire and hex only in the client. The response stays one frame with two orders of magnitude of
headroom (§10 of the protocol doc budgets 504 payload bytes; the response goes from 9 bytes to 15).

**`protocol_version` stays at 1** — an append is absorbed by the protocol doc's §8 extensibility rule,
and bumping it would make every deployed client hard-disconnect from new ears over a change that broke
nothing. [ADR-0002](../adr/0002-how-a-pair-of-ears-is-identified.md) owns the argument.

### 7.2 Presence is a length check, and all-zero means "cannot tell you"

```
serial present  ⟺  payload.length >= 10  and  bytes 4..9 are not all zero
```

`parseCapability` returns **no serial at all**, never a string, when the predicate fails. This section
originally wrote that as `serial: string | null`; **§10.1 amends the return type** to a union that also
carries _why_ there is no serial, which §7.3's two strings need and a nullable string discards. Every
rule below is unchanged by that.

**The parse boundary is the only place this check may live.** All-zero hexes to `"000000000000"`, which
_passes_ `/^[0-9a-f]{12}$/`, so a zero serial that escapes the boundary registers a phantom device that
every failed unit in the fleet shares.

`payload.length < 4` remains the only rejection — the existing "answered with a capability record this
app can't read" refusal. A length of **5–9 is read as no serial**, not as a rejection: the protocol
doc's §8 rule says a client ignores trailing bytes it cannot interpret, and three leftover bytes are
exactly that. No legal firmware can emit 5–9, since the serial's offset and width are now fixed;
treating the impossible as absence costs one branch fewer than asserting against it, and a firmware
emitting seven bytes is a bench bug, not a field condition.

Why the field is fixed-width with a reserved all-zero value rather than omitted — overriding the
recommendation in the research note — is in
[ADR-0002](../adr/0002-how-a-pair-of-ears-is-identified.md).

### 7.3 Three causes, two reasons

| Cause               | Wire               | What the user is told                     |
| ------------------- | ------------------ | ----------------------------------------- |
| Pre-serial firmware | 4 bytes            | The firmware is behind and needs updating |
| eFuse read failed   | 10 bytes, all zero | These ears could not identify themselves  |
| Malformed record    | 5–9 bytes          | As above                                  |

Two strings, not one. At rollout essentially every pair in existence is pre-serial, so that is not an
edge case — it is the whole population for a while, and "update your firmware" is the only actionable
thing to say. The all-zero case is two memory-mapped register reads away from impossible (research
§6.1); telling that person to update firmware sends them on an errand that cannot succeed. The parse
already distinguishes them for free.

`versionVerdict` sets the precedent both ways: it writes its two directions separately rather than
collapsing to a neutral message, and it already uses the phrase "their firmware needs updating".

Noted and accepted: the firmware _update_ story these strings imply does not exist yet (§9). That is
already true of `versionVerdict` today, so this does not make it worse — but it is the second cheque
written against it.

### 7.4 The derivation is frozen the moment anyone registers

```
serial = SHA-256("milklab-ears-serial-v1" ‖ factory eFuse MAC)[0..6]
```

**Once one device is registered, none of those three choices — domain string, hash, width — can ever
change**, and there is no repair, because the key is `@@id([ownerId, serial])` with no surrogate id
(§2.1) and DSQL has no `ALTER COLUMN … TYPE`. This is a one-way door of the same class as the column
types in §1 and §2.2.

**[ADR-0002](../adr/0002-how-a-pair-of-ears-is-identified.md) is the durable record of this**, and is
where the full argument lives — including why the `v1` in the domain string is decorative rather than
an upgrade path. It is deliberately kept outside this spec, which ends when the feature is built.

### 7.5 The cached slot list is not tagged with the serial

The protocol doc's §6 and §12.1 required a cached slot list to be tagged with "the device address" and
discarded on mismatch. That named a value **no client can see** — Web Bluetooth hides the MAC — so the
rule read as unimplementable, and the map recorded a serial in `CAPABILITY` as finally making it
possible.

That was wrong, in both directions:

- **The web already discriminates devices.** `web-bluetooth.ts` takes `device.id`, Web Bluetooth's
  opaque per-origin identifier, and `connection.svelte.ts`'s `updateSlots` already guards on it so a
  listing can never be shown against another pair.
- **There is no cross-connection cache to go stale.** The slot list lives inside the `connected` state
  object and `disconnected()` replaces the whole state, so device B cannot inherit device A's list.

And using the serial here would be a **regression**: the serial is optional, `device.id` is not. A
client tagging its cache with the serial has no tag at all against pre-serial firmware — the largest
population there is. The protocol doc's rule is corrected to name the client's own stable device
identifier instead, and to say the serial is not it. **No client code changes**; the web already
conforms.

---

## 8. The profile page and the registration moment

Settled by building it. Three structurally different variants were made and reacted to, per ADR-0001's
own precedent; the prototype is on the throwaway branch **`prototype/profile-and-registration`** and
the winning shape is **a settings page with an in-place identity block**. Rejected: tabs on `/my`
(variant B) and a profile hub that absorbs `/my` entirely (variant C).

### 8.1 The profile is its own page at `/profile`

A sibling route, not a tab and not a section of `/my`. `/my` stays exactly what it is — one page, one
job, the animations list — and the header's name-and-avatar links to `/profile`.

- **Rejected: tabs on `/my`** (variant B). It makes a page that answers "what have I made?" also answer
  "who am I?" and "what do I own?", and the tab strip is a permanent widget serving a page most users
  open to do one thing. The nav label had to soften to "My stuff" to stay honest, which is the tell.
- **Rejected: the hub** (variant C). Identity above the animation list reads well when you own three
  animations and badly when you own forty; the profile is the rarely-visited page and it took the
  top of the frequently-visited one.
- **Not `/settings`.** The page is identity and possessions, not preferences. Account deletion sits
  there as a consequence of it being the page about your account, and the theme toggle stays in the
  header where it already is.

### 8.2 Identity edits in place, and is the page's title

The avatar and display name are **not** labelled form rows. The page opens with the avatar at
`size-20` carrying a pencil badge — pressing it opens the eight-swatch tray inline — beside the
display name, which is a button until it is clicked and an input afterwards, committing on blur.
This block replaces the page heading: the page is reached by pressing your own name, and an h1 reading
"Profile" above your name and face repeats what the reader can already see.

`updateDisplayName` and `setAvatar` (§1) are the writers; both already exist or are specified, and
neither has had a caller until now.

### 8.3 The device list is a table, and says it is private

Columns: **name**, **serial**, **registered**, and the row actions **rename** and **forget**. The row
for the pair connected right now carries a "connected now" pill — the one live fact the page shows, and
it comes from the connection state the client already holds, never from a GATT read (the profile page is
a place where the ears are almost certainly not connected).

"Only you can see this list" sits beside the heading. Devices are private permanently, and the page
that shows them should say so rather than leave the user to infer it.

Empty state: "No ears registered yet. Connect a pair from the header and you'll be asked to name them."
— it names the affordance that produces the first row.

### 8.4 The registration moment is a modal that interrupts the connect

When a connect completes against a serial that is known, unregistered and undismissed (§3), a dialog
opens over whatever page the user is on. It says why the name matters — every pair advertises itself
as the same model name — shows the serial as secondary text, takes one input, and offers **Save** and
**Not now**.

- **Interrupting is the point.** Registration _is_ naming (§2.3), and the moment the user has just
  proven they hold this pair is the only moment the question is cheap to answer. A banner that can be
  scrolled past (variant B) turns a one-input action into a thing to get around to.
- **"Not now" is a real answer, not a delay.** It writes the dismissal key (§3) and the prompt does not
  return for that pair. The copy says "Not now" rather than "Later" or "Skip" because it is the honest
  description of what the button does: this pair, not asked again.
- Modal, not the chip's own popover (variant C): the naming field wants a label, an explanation and
  room to breathe, and a popover anchored to a header control has none of the three.

### 8.5 The second door is the profile page — **this amends §3.1**

§3.1 was written before the profile page existed and named the connected chip as the permanent route to
registration. It is the page instead: a register row under the device table, showing the connected
pair's serial and one input, present whenever a connect is live.

**`ChipView.action` stays a closed three-verb union.** This settles the question §9 carried until now.
The chip remains a status display with one verb, and it gains no menu:

- A menu puts a rarely-used verb behind an extra press on the app's most-pressed control, and every
  press of it is a press that is not connecting or disconnecting.
- Once the profile page exists, a chip menu duplicates it. Two doors to one action is the thing that
  makes both harder to describe.
- The chip is not silent about it: connected to an unregistered pair it reads **"Unregistered · this
  tab only"** as its detail line, which is where a user learns there is something to do. Connected to a
  registered pair it reads the chosen name (§4), which is the payoff.

**§10.5 completes this**: the chosen name is the chip's _label_ (the line §4 says currently renders
`state.deviceName`) and "Unregistered" is its _detail_, so the two rules are about different lines and
never compete. §10.5 also settles the case this paragraph does not cover — ears that report no serial,
which are not "unregistered" and stay quiet.

A menu remains addable later without a schema change, if the page turns out to be too far away.

### 8.6 Ears that cannot identify themselves show the row, disabled, with the reason

The register row is **visible but disabled, with the reason as page text** — ADR-0001's precedent, and
the same rule §3.2 already applies to the prompt. The reason is whichever of §7.3's two strings the
connection carries: the firmware is behind and needs updating, or these ears could not identify
themselves. A missing row is a mystery; a disabled one with a sentence is an answer.

### 8.7 Account deletion is the last thing on the page

The danger zone sits at the bottom, below the devices: a red-outlined button and one sentence saying
what goes — "Deletes your animations and your list of ears. Cannot be undone." It calls the existing
`deleteAccount` (§6), which is the third procedure this page gives a caller.

---

## 9. Settled, and what was ruled out

Nothing on the map is open. The last question — where the device-identity decision is recorded —
was settled on
[card 98](https://trello.com/c/sEJ5S38p/98-grilling-where-the-device-identity-decision-is-recorded):
a new ADR, [ADR-0002](../adr/0002-how-a-pair-of-ears-is-identified.md), owning the derivation, the wire
carriage, the storage key and the threat posture, with ADR-0001 gaining a forward cross-reference.

Two things the map deliberately leaves undone:

- **The firmware _update_ story that §7.3's reason string implies does not exist.** Delivering OTA
  update is a subsystem in `robo-cat-ears`, ruled out of scope on the map.
- **The firmware does not emit the serial yet.** The wire contract is written — `ble-protocol.md` §8
  and §8.1 document the record, the reserved all-zero value and the freeze — but §11.8 of that document
  is a specification for code nobody has written. Until it is, every pair of ears reports the 4-byte
  pre-serial record, and §7.3's reason string is what every user sees.

---

## 10. Threading the serial to the prompt

Settled on card 97. §7 fixed what is on the wire; §8 fixed that registration is a modal and a dismissal
is a `localStorage` key. This section is the seam between them — the path `openEarsLink` → `handshake` →
`EarsConnectionState` → chip and modal.

The shape of the answer is one this codebase already has: **pure functions returning a decided verdict,
consumed by a component's `$derived`.** `chipView` and `sendEligibility` are both that. Nothing below
introduces a new mechanism.

### 10.1 The parse keeps the cause — **this amends §7.2**

```ts
export type DeviceIdentity =
  | { readonly kind: "serial"; readonly serial: string }
  | { readonly kind: "pre-serial" }
  | { readonly kind: "unidentified" };
```

`Capability` gains `identity: DeviceIdentity`. `pre-serial` is a payload shorter than ten bytes — §7.2's
4 and its 5–9 alike; `unidentified` is ten bytes that are all zero.

§7.2 wrote the return as `serial: string | null`, and that type cannot carry §7.3's promise. §7.3 gives
two causes two different sentences, and §8.6 says the connection carries whichever applies — but by the
time a reader holds `null`, the payload length is gone. The distinction §7.3 says the parse "already
makes for free" was being discarded at the only place that can see it.

The union also turns §7.2's central safety property from a rule into a shape: **no branch has a serial
field to read unless the serial is real.** An all-zero record cannot leak `"000000000000"` toward a
primary key, because the variant it produces has nowhere to put a string.

Rejected: keeping `serial: string | null` and carrying the payload length beside it. Two fields that
must be kept agreeing, and the which-sentence logic ends up outside the one function that knows.

### 10.2 `identity` stays inside the record

Not hoisted to a sibling field on the `connected` state.

- **The connected state already has a rule for what gets hoisted, and the serial is on the other side of
  it.** `deviceId` and `deviceName` are lifted because they come from the _link_ (`live.deviceId`,
  `live.deviceName` — the Web Bluetooth half); `capability` is kept whole because it came from the
  _record_. The serial arrives in the CAPABILITY frame.
- **"Identity is a different kind of fact" does not survive inspection.** The serial is precisely what
  `connect.ts` calls `slotCount` and `maxChunkBytes`: a per-connection fact, read from this device, that
  a client must not hardcode and that dies with the connection. The difference is the English word
  _capability_, not provenance or lifetime.
- **A copy is a thing that can be wrong.** `updateSlots` already rebuilds state with a spread, and every
  future partial update would have to keep two identity fields agreeing.

Cost accepted: readers would reach through a wire-shaped type for a domain fact. §10.3 removes that need
for all three of them.

### 10.3 One resolver, one type, three readers

```ts
export type Registration =
  | { readonly kind: "unknown" }
  | { readonly kind: "unregisterable"; readonly reason: string }
  | { readonly kind: "unregistered"; readonly serial: string }
  | { readonly kind: "registered"; readonly serial: string; readonly name: string };

resolveRegistration(state: EarsConnectionState, devices: readonly Device[] | null): Registration;
```

Three readers — `chipView` (§10.5), the modal (§10.4), and the profile page's register row (§8.5, §8.6)
— and one producer.

- **§7.3's two strings get exactly one implementation.** `unregisterable` carries its own sentence,
  chosen once from `identity`. No reader switches on the cause a second time.
- **Dismissals are deliberately not an input.** Only the modal consults the dismissal store. That makes
  §3.1 — a dismissal silences the prompt, never the feature — structural rather than remembered: the
  profile page _cannot_ hide its own register row on a dismissal, because it never sees one. The second
  door cannot be closed by the key that closes the first.
- **`me` is not an input either.** `devices.list` is an `authedProcedure` and its failure resolves to
  `null` (§10.6), so a non-null list already means signed in. The user id is needed only to build the
  dismissal key, which only the modal does.

### 10.4 The prompt is derived, not fired

`createEarsConnection` gains nothing: `connect()` does not report whether to prompt, and no component
runs an `$effect` on the connect transition. The dialog renders when the verdict says so —

> prompt ⟺ `resolveRegistration(...).kind === "unregistered"` and no dismissal key for `(userId, serial)`

- **Against a signal out of `connect()`:** it makes the connection depend on the logged-in user, the
  tRPC device list and `localStorage` — the exact coupling §4 refused when it kept name resolution off
  the connect path. The connection owns a session, not components.
- **Against an `$effect` on the transition:** an effect fires once, at connect, and the verdict's inputs
  need not all be ready at that instant. It would have to sequence itself against a pending fetch or
  re-fire, putting a race inside the moment. A derived value becomes true when its inputs agree,
  whenever that is, and is a pure function under test.

**Closing is then free in every direction, and that is the point.** Save pushes the row into the store,
dismissal writes the key, a disconnect drops the connected state — each flips the verdict. Nothing ever
writes `open = false`, so no dialog can be left open against a connection that is gone.

The corollary has to be said out loud, because it is the one way to get this wrong: **a closing gesture
that writes nothing cannot close the dialog.** Esc and the backdrop therefore write the dismissal key,
exactly as "Not now" does. The modal has two outcomes and every gesture maps to one of them.

Accepted: Esc is a permanent answer for that pair rather than a "later". §8.5's register row is the
second door, and the chip (§10.5) names the situation in the meantime.

`connection.svelte.ts` loses `get view()`. Its only caller is the chip component, and keeping it would
drag the device list into the connection object. The component composes instead —
`chipView(ears.state, registration)`, the shape `sendEligibility(state, animation)` already uses.

### 10.5 What the chip says — **this completes §8.5**

| Registration     | Label                 | Detail                              |
| ---------------- | --------------------- | ----------------------------------- |
| `registered`     | the chosen name       | `2 of 8 slots used · this tab only` |
| `unregistered`   | advertised model name | `Unregistered · this tab only`      |
| `unregisterable` | advertised model name | `2 of 8 slots used · this tab only` |
| `unknown`        | advertised model name | `2 of 8 slots used · this tab only` |

§4's name is the **label** — the line that currently renders `state.deviceName` — and §8.5's
"Unregistered" is the **detail**. Different lines; they never compete.

**"Unregistered" displaces the slot summary rather than joining it.** The chip is `max-w-56` with the
detail clamped to two lines, so there is no third segment to be had. At that moment the more useful
sentence is the one naming something to do, and it is self-limiting — it goes as soon as the user
answers, either way. The slot count remains where it is operationally needed: the send dialog, which
shows the whole grid.

**Ears that report no serial are not labelled "Unregistered".** That line is a prod toward an action,
and for these ears there is no action — they cannot be registered at all (§3.2). The explanation belongs
where there is room for a sentence, which §8.6 already decided is the profile page's disabled row, not a
global control nagging about a locked door. The chip treats "cannot be registered" as an ordinary
connection.

The result is the property worth keeping: **the chip says "Unregistered" only when acting on it would
work.** `unregisterable` and `unknown` are byte-identical to the chip as it ships today, which is also
what stops a failed fetch (§10.6) from lying.

### 10.6 The list is fetched at layout load, and `null` means unknown

`devices.list` joins `users.me` in `apps/web/src/routes/+layout.server.ts` — the same authed batch, one
HTTP request via `httpBatchLink`, seeded into a client store on hydration.

**There is then no timing gap on the connect path at all.** A connect needs a click, a click needs a
rendered page, and the layout load finishes before anything renders, so the list is always present
before the chip can be pressed. §4's "a cache has the answer before the handshake finishes" is an
argument for pre-loading; fetching at connect or on demand reintroduces the in-flight question a few
milliseconds later. The cost is a prefix scan of the primary key (§2.1) for a handful of rows, on a load
that does not re-run on client-side navigation.

**The gap that does exist is failure, not latency**, and `me` already sets the precedent with its
`try { … } catch { me = null }`. So the store holds:

```ts
Device[] | null; // null: we could not find out
```

and the two are opposites rather than neighbours. Under _empty_, a connected pair is unregistered —
prompt, and say so on the chip. Under _unknown_, doing that nags someone about ears they named months
ago and tells them it is not registered. `null` therefore resolves to `Registration.unknown`: no prompt,
advertised name, today's chip. **A failed fetch degrades to the app as it already ships**, which is a
state known to work. Signed out takes the same branch, for the reasons in §10.7.

The store is module-level `$state` in `lib/devices/store.svelte.ts`, seeded from layout data and mutated
in place by `register`, `rename` and `forget` — §4's "one store, several readers". `invalidateAll()` is
not used anywhere: it would put a server round trip between Save and the dialog closing. The one refetch
in this design is §10.8's.

### 10.7 Signed out, the chip is silent

No prompt, and nothing said about signing in. Connecting to ears is genuinely a signed-out capability —
the entire BLE surface works without an account — and the chip is a connection status display, not a
place to acquire accounts.

It would also be a worse nag than the ones already rejected. Acting on it costs an auth round trip that
destroys the connection the user just made, because the connection does not survive a reload (§2.4): the
chip would be advertising an action that undoes itself.

Structurally, silence lets signed-out and fetch-failed share one branch, and neither can produce a false
"Unregistered".

### 10.8 The modal is pinned to its pair, and what Save does — **this amends §5**

**Mounted under `{#if prompt}`, not always-mounted behind an `open` prop.** A pair swap always passes
through `disconnected`, because `connect()` early-returns unless the status is disconnected — so
conditional mounting means a new pair always gets a fresh input. The correctness property comes from the
structure rather than from keying and remembering to; there is no animation or state worth preserving
across a disconnect.

**The serial is captured at press time** from the verdict and carried in the mutation payload — never
re-read from the connection when the call resolves, by which point the connected state may be gone. This
is the serial's analogue of `updateSlots`'s `deviceId` guard: the value shown to the user is the value
written.

**A disconnect mid-save does not cancel the registration.** The user answered the question, and the row
is theirs whether or not the ears are still powered on. Registration is about a device someone owns, not
about a session.

`register` returns the created row and the client pushes it into the store. Constructing the row
client-side would mean inventing `createdAt`, which §8.3's **registered** column displays; refetching the
list would be a second round trip for a row just written.

**`CONFLICT` self-heals — this is the amendment to §5.** §5 reasoned that the cached list makes an
already-registered serial unreachable, so reaching it is a bug worth surfacing. But §4 explicitly accepts
a stale cache, and that makes it reachable with no bug at all: register a pair on your phone, leave a
laptop tab open, connect, get prompted, press Save. It also interacts badly with §10.4 — an inline error
leaves the dialog **permanently stuck**, because the local list still lacks the row so the verdict stays
true.

So `CONFLICT` refetches `devices.list`. The refetched list contains the row, the verdict flips, the
dialog closes, and the chip shows the name chosen on the other device — which is the right thing to
show, because the user's intent was already satisfied elsewhere and nothing was lost.

Cost accepted: a genuine client bug that double-registered would be invisible, and there is no client
error reporting to catch it (`lib/analytics/` is Cloudflare page analytics only). What makes that
acceptable is that the failure is idempotent in effect — the row exists, correctly named, owned by the
right user.

Every other failure needs no handling. The list is unchanged, so the verdict stays true, so the dialog
stays open by itself; an inline message with Save re-enabled is the whole requirement.

### 10.9 Where the code lives

A new `apps/web/src/lib/devices/`: `dismissed.ts` (§3), `registration.ts` (§10.3), `store.svelte.ts`
(§10.6), and `components/device-registration-dialog/`. §3 asks for the dismissal wrapper to sit beside
`theme.ts` / `timeline-height.ts` / `draft.ts`, and those live in feature directories.

`lib/ears/` keeps owning the radio and the bytes — the half testable without a radio — and does not grow
a tRPC-backed store or a `localStorage` wrapper.

**`Registration` is defined in `lib/devices/registration.ts`, and `chip.ts` imports it**, so the
dependency runs one way: `ears → devices`. Defining it in `lib/ears/` would make the two directories
mutually dependent. The direction matches `eligibility.ts`, which already imports the connection state
rather than being imported by it.

### 10.10 The `deviceId` boundary holds

Confirmed by audit, as §7.5 requires. `device.id` originates once, at `web-bluetooth.ts:80`, flows link →
session → connected state, and is read in exactly one guard, `connection.svelte.ts:76`. Nothing else
keys on it.

The serial is used for three things and no others: the `Device` row key (§2.1), the dismissal key (§3),
and matching a connection against the cached list (§10.3). It never reaches `updateSlots` and never tags
the slot cache. **The two identifiers do not meet**, so §7.5's correction — the client's stable device
identifier is `device.id`, and the serial is not it — still needs no code change.
