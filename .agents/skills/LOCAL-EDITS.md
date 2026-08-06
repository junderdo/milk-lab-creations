# Local edits to vendored skills

Most skills under `.agents/skills/` are vendored verbatim from
[mattpocock/skills](https://github.com/mattpocock/skills) and are re-applied wholesale on
every upgrade, which overwrites anything edited in place. This file is what survives that
overwrite: each entry records an edit, why it exists, and how to check it is still there.

Vendored at **v1.2.0** (`2ffb184ffbb752faa664c0b204f3c9241b1428e9`). Skills tracked in
`skills-lock.json`; locally authored skills (`ask-engineering`, `ask-product`,
`check-questions`, `publish-map`, `to-brief`) are not vendored and are not listed here.

## Upgrading

1. Diff the pinned ref against the target ref and note which entries below sit in regions
   upstream changed.
2. Replace each vendored skill folder with the target ref's copy.
3. Re-apply every entry below, in order. An entry whose probe upstream has absorbed moves
   to Retired.
4. Confirm each live probe greps in `.agents/skills/`, then recompute `skills-lock.json`.
   Its `computedHash` is a sha256 over each skill folder's sorted relative paths and file
   contents.

## Live entries

### 1. `/code-review` renamed to `/matt-code-review`

**Skills:** `matt-code-review`, `ask-matt`, `implement`, `tdd`
**Probe:** `matt-code-review`
**Upstream status:** not upstreamed; the collision is specific to this repo.

Claude Code ships a built-in `/code-review`, so the vendored skill of the same name is
unreachable by its own slash command. The skill's frontmatter `name` becomes
`matt-code-review`, and every reference to it across the other three skills follows.

```diff
--- a/.agents/skills/matt-code-review/SKILL.md
-name: code-review
+name: matt-code-review

--- a/.agents/skills/implement/SKILL.md
-Once done, use /code-review to review the work.
+Once done, use /matt-code-review to review the work.

--- a/.agents/skills/tdd/SKILL.md
-  It belongs to the review stage (see the `code-review` skill), not the red → green implementation cycle.
+  It belongs to the review stage (see the `matt-code-review` skill), not the red → green implementation cycle.

--- a/.agents/skills/ask-matt/SKILL.md
-   then closes out by running **`/code-review`**, a two-axis review (Standards + Spec) of the diff, before committing. Reach for **`/tdd`** on its own when you just want to build a concrete behaviour test-first without a full spec, and **`/code-review`** on its own whenever you want to review a branch or PR against a fixed point.
+   then closes out by running **`/matt-code-review`**, a two-axis review (Standards + Spec) of the diff, before committing. Reach for **`/tdd`** on its own when you just want to build a concrete behaviour test-first without a full spec, and **`/matt-code-review`** on its own whenever you want to review a branch or PR against a fixed point.
```

### 2. Wayfinder maps go through `/publish-map` before `/to-spec`

**Skill:** `ask-matt`
**Probe:** `run **`/publish-map`** to put the finished map`
**Upstream status:** not upstreamed; `/publish-map` is a locally authored skill.

A finished wayfinder map is a team decision here, not a solo one. `/publish-map` puts the
map on a PR the team approves before any of it collapses into a spec; without this line
`ask-matt` routes straight from wayfinder to `/to-spec` and the approval step is skipped.

```diff
--- a/.agents/skills/ask-matt/SKILL.md
-  When the map clears, **it hands off, it doesn't build**: merge onto the main flow at **`/to-spec`**,
+  When the map clears, **it hands off, it doesn't build**: run **`/publish-map`** to put the finished map — decisions, prototype findings, and a proposed spec split — on a PR the team approves; merge means clear to proceed. Then merge onto the main flow at **`/to-spec`**,
```

## Retired

### `/writing-for-agents` pointed back at `/writing-great-skills`

**Skill:** `ask-matt`
**Retired at:** v1.2.0

The skill was vendored just before upstream renamed `writing-great-skills` to
`writing-for-agents`, so `ask-matt`'s reference was patched back to the old name. v1.2.0
adopts the upstream rename — folder, symlink and reference all move to
`writing-for-agents` — and the edit is no longer needed.
