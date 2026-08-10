# The wire-format conformance fixture

`docs/spec/wire-format-fixture.json` is the golden file for the ears animation wire format
(`ble-protocol.md` §2.6 in the firmware repo). Two independent implementations are tested against
it, so the guarantee that they agree is a failing test rather than a code comment:

- **Web app** — `apps/api/test/wire-format-conformance.test.ts` asserts `packWireFormat` produces
  each case's bytes.
- **Firmware** — `test/wire_format_conformance.c` in
  [robo-cat-ears](https://github.com/junderdo/robo-cat-ears) asserts `custom_animation_deserialize`
  accepts the bytes and reconstructs the keyframes, and that `custom_animation_serialize` reproduces
  them. Run it with `make -C test` — a host gcc build, no ESP-IDF and no hardware.
  `make -C test test` skips the drift check below.

## Where it lives

This repo holds the canonical file. A C test cannot read a JSON file out of another repository at
build time, so robo-cat-ears carries a byte-identical copy at `test/wire-format-fixture.json`,
and `test/check-fixture-drift.sh` there diffs the copy against this one. It resolves the canonical
path from `$MILKLAB_REPO` or a sibling checkout, and **fails** rather than passing quietly when it
cannot find one. It gates the default `make -C test` target, so a conformance pass against a stale
copy is not something you can get by accident.

## Changing it

The fixture is generated, not hand-written, so the bytes are not copied out of either
implementation under test:

```bash
python3 scripts/gen-wire-format-fixture.py                       # rewrites the canonical file
cp docs/spec/wire-format-fixture.json ../robo-cat-ears/test/     # refresh the firmware's copy
```

Then run both test suites. Changing the fixture means changing the protocol: expect to change
`packWireFormat`, `custom_animation_serialize`/`custom_animation_deserialize`, and §2.6 of
`ble-protocol.md` in the same breath.

## What the cases cover

Each case carries a `why` saying which edge it exists for, so the fixture explains itself rather
than being explained here. It pairs the canonical JSON payload with its expected bytes as hex, one
line for the count byte and one line per keyframe, so a byte that moves shows up on a single line of
the diff. `covers the edges the firmware cares about` in the web test asserts the set of edges is
still there after a regeneration.
