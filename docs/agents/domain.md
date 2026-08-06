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
