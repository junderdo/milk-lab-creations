# How a pair of ears is identified

Status: accepted

A pair of ears has to be able to say which pair it is. Every unit advertises the identical name
`ROBO_CAT_EARS`, and Web Bluetooth never exposes the peer's hardware address — `BluetoothDevice` has
`id` and `name` and nothing else, and `id` is an origin-scoped opaque string that changes with the
origin and does not survive a permission reset. So two pairs are indistinguishable to a client unless
the device tells it apart itself.

This ADR settles what that identifier is, how it reaches a client, how it is stored, and what it does
not promise. It was decided across four tickets on the [user profile and registered devices wayfinder
map](https://trello.com/c/gi2Ipg3P/91-wayfinder-map-user-profile-and-registered-devices); the
evidence behind the derivation is in
[`docs/research/device-serial-derivation.md`](../research/device-serial-derivation.md), and the
feature that consumes it is specified in
[`docs/spec/profile-and-devices.md`](../spec/profile-and-devices.md).

**The identifier is a six-byte truncated SHA-256 of the factory eFuse MAC, appended to the
`CAPABILITY` record, stored as twelve lowercase hex characters in a composite primary key.** It is
called the **serial** throughout.

## The decisions

**The derivation, and the fact that it is frozen.**

```
serial = SHA-256("milklab-ears-serial-v1" ‖ factory eFuse MAC)[0..6]
```

read via `esp_efuse_mac_get_default`, hashed with mbedTLS SHA-256, first six bytes kept.

**Once one device is registered, none of the three choices — domain string, hash, width — can
change.** A different value in any of them makes every physical unit report a _different_ serial after
a firmware update. Every `Device` row is then orphaned: the user's ears arrive as an unregistered
stranger, and the row they named is unreachable garbage keyed to a serial no device will ever emit
again. There is no repair, because the key is `(ownerId, serial)` with no surrogate id and DSQL has no
`ALTER COLUMN … TYPE`. This is worth stating bluntly because a hash is exactly the kind of thing
someone improves.

**The `v1` in the domain string is decorative.** It was chosen as free domain separation, which it is,
but it is not an upgrade path — there can be no v2 for an already-registered fleet without forcing
every user to re-register every pair. Keep the literal exactly as written; changing it _is_ the
breaking change above.

**Why the factory MAC and not the BLE MAC.** `esp_efuse_mac_get_default` reads the factory-programmed
eFuse value directly. `esp_read_mac(…, ESP_MAC_BT)` returns the base MAC with **+1 or +2** added to the
last octet depending on `CONFIG_ESP32Cx_UNIVERSAL_MAC_ADDRESSES`, which is a build-configuration
choice, not a chip property. A serial that changes when someone flips a menuconfig option is not a
serial. The factory read is also invariant to any future `esp_base_mac_addr_set`, and it sidesteps
ESP-IDF's own unresolved `WIFI-4134` TODO about how many universal addresses an ESP32-C2 really has.
Rejected: the BLE MAC, the base MAC, and any per-boot or NVS-stored value.

**Why SHA-256, and why six bytes.** SHA-256 is the only SHA-2 mode accelerated on all three targets
(ESP32-C2/C3/S3), and mbedTLS is already linked. Six bytes matches the 48-bit width of the input, so
the truncation discards no resolution the input ever had, and twelve lowercase hex characters is a
length people read aloud and paste into support threads without it feeling like a UUID. Rejected: four
bytes (1.2 × 10⁻² collision probability at ten thousand units — a schedule, not a tail risk); five
(defensible, but an odd width in a byte-oriented protocol and no better where it counts); eight (the
honest counter-argument — effectively injective over a 48-bit input — which loses only because a
collision here is not a corruption event, see below). Rejected as a primitive: the ROM `ets_sha_*`
symbols, which take no crypto lock and would corrupt shared peripheral state if called concurrently
with mbedTLS.

**How it travels: six raw bytes appended to the `CAPABILITY` record, and the version does not move.**

```
[protocol_version:u8][slot_count:u8][max_chunk_bytes:u16][serial:6]
```

The protocol's extensibility rule already obliges clients to ignore trailing bytes they do not
understand, and every deployed client already does. Bumping `protocol_version` would be actively
harmful: the version check refuses on _exact_ inequality, so every deployed client would hard-
disconnect from new ears and blame the firmware for a change that broke nothing. Rejected: ASCII hex
on the wire, which doubles the bytes and puts a hex encoder in firmware for no gain — the client is
formatting bytes for display and a primary key either way.

**The field is fixed-width, and "no serial" is a reserved all-zero value rather than an omission.**
The research note recommended omitting the six bytes when the eFuse read fails; that was overridden.
Omission makes the record's length non-monotone — legal lengths of 4, 6, 10, 12 once anything else is
ever appended — and a client could then no longer locate any field by offset, because offsets would
depend on whether an _earlier optional_ field had been emitted. The serial would be the first and last
optional field the record could ever have. All-zero is also the pattern `LIST` already uses, reading a
zero `animation_id` as "watch-authored".

Presence is therefore `payload.length >= 10 && bytes 4..9 are not all zero`, and it is checked at the
parse boundary only. All-zero hexes to `"000000000000"`, which _passes_ a `/^[0-9a-f]{12}$/` regex, so
a zero serial escaping the boundary would register a phantom device shared by every failed unit in the
fleet.

**How it is stored: `(ownerId, serial)`, bare `TEXT`, lowercase, no surrogate id.** The composite
primary key means every procedure addresses a device as `(caller's ownerId, serial)` — the owner is not
a filter someone has to remember to write, it is half the key, so a careless `rename` cannot be made to
touch another user's row. `TEXT` rather than `bytea` because DSQL gives `bytea` no index support and
the column must sit in the primary key; bare `TEXT` rather than `VARCHAR(n)` because `ALTER COLUMN …
TYPE` is absent from the DSQL grammar, so a width chosen today is permanent either way. The width and
alphabet are pinned in Zod as `SERIAL_HEX_CHARS = 12`.

**Lowercase is strict — uppercase is rejected, not normalized.** `'AB12' ≠ 'ab12'` to Postgres, so two
legal spellings would let one owner register the same physical device twice, which is the one thing the
composite key exists to prevent. "Be liberal in what you accept" does not apply when the only producer
is our own client formatting bytes with a hex encoder we wrote.

**What it does not promise.** The serial is **opaque, not anonymised, and not authenticated.**

_Not anonymised._ The input space is 48 bits and in practice far smaller, since Espressif's OUIs are
public and few. An unsalted SHA-256 over that space is exhaustively searchable on commodity hardware.
Hashing buys an identifier that is non-routable and decoupled from the radio — which is what keeps a
globally meaningful tracking identifier out of database keys, cache keys, `localStorage` keys and URLs
— and it buys nothing more. A secret salt would raise the bar against remote attackers only, since the
firmware is readable off the flash of any unit an attacker holds. Describe it as opaque; never as
anonymous.

_Not authenticated._ Nothing stops a client registering a serial it never saw. Rows are per-owner and
permanently private, there is no global `Device` entity, and no reader crosses users — so the only
person affected by a fabricated serial is the fabricator, whose own list gains an entry for ears that
do not exist. Do not add a proof-of-possession scheme without a reader that would justify it.

_Uniqueness is implied, never stated._ Espressif documents the factory MAC as "pre-programmed … in the
factory during production" and "universally administered (by IEEE)", and the TRMs add that the block
"has been programmed at manufacturing" and reads back read-only. But the word "unique" appears in none
of the three datasheets, none of the three TRM eFuse chapters, and nowhere in the programming guide's
MAC section. Design so that a duplicate is survivable, not so that a duplicate is impossible.

## Consequences

- **The global birthday bound is a sanity check, not the requirement.** The key is `(ownerId, serial)`,
  so two physically distinct pairs colliding only matters if the _same user_ owns both. At a realistic
  collection size of five that is ~3.6 × 10⁻¹⁴, and the failure mode is mild and non-destructive: the
  second `register` returns `CONFLICT` and the user sees their already-registered ears under the wrong
  name. Nothing is lost and nothing is mis-attributed across owner boundaries. This is the reason six
  bytes wins over eight.
- **Three causes of "no serial" collapse to two user-facing reasons.** Pre-serial firmware (4 bytes)
  is told the firmware is behind and needs updating; an eFuse read failure (10 bytes, all zero) and a
  malformed record (5–9 bytes) are both told the ears could not identify themselves. At rollout
  essentially every pair in existence is pre-serial, so that is not an edge case — it is the whole
  population for a while. Telling the all-zero case to update firmware would send that person on an
  errand that cannot succeed.
- **The firmware-update story these strings imply does not exist.** Delivering OTA update is a
  subsystem in `robo-cat-ears` and was ruled out of scope on the map. This is the second cheque written
  against it; the version-mismatch copy already writes the first.
- **The serial is not the client's cache key, and must not become one.** The serial is optional;
  Web Bluetooth's `device.id` is not. A client tagging a cached slot list with the serial has no tag at
  all against pre-serial firmware — the largest population there is. Discriminate devices by
  `device.id`.
- **The wire contract is owned elsewhere.** `robo-cat-ears/docs/ble-protocol.md` is the owner of record
  for the byte layout, and names itself the contract between three repositories. This ADR owns identity
  _semantics_ — what the value means, what it promises, and what may never change about it. The
  appended field is not yet written into that document; it lands with the firmware change, carrying a
  copy of the freeze warning above. That duplication is deliberate: across a repository boundary the
  reader most likely to change the hash is the one least likely to follow a link.
- **A third client is already compatible.** The watch's `onCapabilityResponse` guards on
  `_rx_length < 4` — a minimum, not an equality — so the append is non-breaking for all three clients
  without a change to any of them.
- **Nothing here depends on the eFuse block number.** The rendered ESP-IDF documentation is wrong about
  it for ESP32-C2 (it says BLK1/BLK3; the eFuse table and the ESP8684 TRM say BLOCK2/BLOCK1), but
  `esp_efuse_mac_get_default` resolves the block through the generated table. Anyone checking this ADR
  against the docs will be misled; the code is right.
