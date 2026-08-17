# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the
codebase. This repo is **single-context**: one `CONTEXT.md` and one `docs/adr/` at the root cover
`apps/api`, `apps/web`, and `packages/config` alike — they share one vocabulary (animations, robots,
payloads, keyframes, the wire format), not three.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root
- **`docs/adr/`** — read ADRs that touch the area you're about to work in

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest
creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and
`/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

As of this writing neither exists yet — that is expected, not a gap to fix.

## File structure

```
/
├── CONTEXT.md
├── docs/
│   ├── adr/
│   │   ├── 0001-....md
│   │   └── 0002-....md
│   ├── agents/       ← this directory: skill configuration
│   ├── research/     ← findings from /research
│   └── spec/         ← specs / PRDs from /to-spec
├── apps/{api,web}/
└── packages/config/
```

`docs/research/` and `docs/spec/` are established homes for long-form output and are not ADRs — an
ADR records a decision and its consequences, a spec describes what to build, research captures what
was learned. Keep them apart.

## The three have different lifespans

This is what decides where a fact goes, more than what the fact is about.

A **spec is fulfilled**, not superseded — it describes work that gets done, and once the code exists
the code is the record of _what_. A spec keeps its reasoning about the things code cannot show (why
this shape and not that one), and it stops being edited. An **ADR outlives the build**: it is read
cold, years later, by someone who never saw the spec and is about to change something. **Research is a
dated snapshot** of what the sources said; it is never revised to stay true, only cited.

So: if a fact must still be true and findable after the feature ships — a constraint, a one-way door, a
posture — it belongs in an ADR, even when it was discovered while writing a spec. Lift it out and leave
a pointer. Don't duplicate: two copies of an argument drift, and the stale one still reads
authoritatively. [ADR-0002](../adr/0002-how-a-pair-of-ears-is-identified.md) and
[`docs/spec/profile-and-devices.md`](../spec/profile-and-devices.md) are the worked example.

**Specs carry a `Status:` line** under the title, in the same position and idiom as an ADR's:

| Status        | Means                                                                       |
| ------------- | --------------------------------------------------------------------------- |
| `in assembly` | Still being written; sections are landing as questions get settled          |
| `settled`     | Every question answered, nothing open — but not built yet                   |
| `built`       | Shipped. The argument is over; go read the code, come back only for the why |

Never mark a spec `superseded`. That word is a truth claim and belongs to ADRs, where a later decision
genuinely contradicts an earlier one.

**Across a repository boundary, duplicate the warning and point for the rest.** Within a repo a link is
strong — same history, one grep away. Across repos it is weak, and the reader most likely to break a
cross-repo invariant is the one least likely to follow the link.

If `apps/api` and `apps/web` ever grow genuinely separate domain languages, switch to multi-context:
a root `CONTEXT-MAP.md` pointing at a per-app `CONTEXT.md`, with app-scoped `docs/adr/` alongside.
Nothing today justifies it.

## Use the glossary's vocabulary

When your output names a domain concept (in a card title, a refactor proposal, a hypothesis, a test
name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly
avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language
the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
