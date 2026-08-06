---
name: publish-map
description: Publish a finished wayfinder map as a pull request for team approval — merge means clear to /to-spec and /to-tickets.
disable-model-invocation: true
---

A wayfinder map has run out of fog: the decisions are made, and the next move is `/to-spec`. Before that, the team gets a say. This skill publishes the map as a **snapshot** — one self-contained document — on a pull request, so the team sanity-checks the *approach* with the review ritual it already trusts. The skill only publishes; the humans approve.

**The map is where decisions live, in every mode.** The PR is a review surface, not a second brain: it challenges the approach, and its merge approves the map. `/to-spec` and `/to-tickets` then run against the map as of that merge SHA, so a decision recorded only on the PR reaches neither.

Where the snapshot lives, the branch and PR conventions, and the tracker operations are repo-specific — consult the tracker doc's "Map publishing operations" section. Run `/setup-matt-pocock-skills` if no tracker has been provided.

**Every message a teammate reads is drafted for the user before it is sent** — replies on threads, comments on the PR, comments on tickets. Write the drafts, show them in full, and post only what comes back approved. Batch a round's messages into one presentation rather than stopping per message. This holds in all four modes; the rest of the tracker work — creating tickets, transitions, labels, links — needs no such pause.

## Modes

Pick by state, in order:

- The map's epic is closed and the user wants changes → **Amend**.
- A publication PR is open → **Revise**.
- The publication PR has merged → **Close out**.
- Otherwise → **Publish**.

## The gate

Publish only a finished map: every child ticket closed and **Not yet specified** empty. Anything still open is a **straggler** — list the stragglers by name and put each one to the user. A straggler enters the PR only with the user's explicit **waiver**, recorded with its reason in the snapshot so reviewers approve knowing exactly what's unresolved. The gate is passed when every straggler is either closed or waived.

## The snapshot

One document, and a **render** of the map: this skill is its only writer, and every rebuild regenerates it by zooming the tracker afresh. Meaning that lives only in the render is lost at the next rebuild — so whatever review surfaces lands on the tracker first, and the document is re-rendered from it. The render must read complete without tracker access: inline what reviewers need. Sections, in order:

1. **Reviewer's guide** — written for a reviewer with twenty minutes: the 3–5 most load-bearing or contestable decisions ("if you only check five things, check these"), the risks and assumptions the map rests on, and which prototype to try first.
2. **Destination** — from the map, verbatim.
3. **Waivers** — each waived straggler and its reason. Omit when the gate passed clean.
4. **Decisions** — every closed decision ticket, linked by name: the question, the answer from its resolution comment, and the **alternatives rejected** along the way with why, mined from the ticket's discussion — approach review is impossible without seeing what was turned down.
5. **Prototypes** — per prototype: the question it settled, the verdict, screenshots or recordings committed beside the doc, and its throwaway branch with the exact commands to run it. Prototype code stays on those branches — reviewers play with a prototype by switching to it, and the publication branch carries only findings.
6. **Proposed spec split** — per proposed spec: a name, a one-paragraph scope, the decisions it consumes, and rough ordering between specs. A strong prior, not a contract: `/to-spec` starts from the approved split and flags any deviation to the user.
7. **Out of scope** — from the map.

## Publish

1. Pass the gate.
2. Build the snapshot on a fresh publication branch, per the tracker doc's conventions.
3. Open the PR ready-for-review — publishing *is* the request for review. The PR body carries the reviewer's guide gist, the waivers, and what merging means: approved, clear to `/to-spec` and `/to-tickets`.
4. Comment the PR's URL on the map's epic.

Done when the PR is open and the epic points at it.

## Revise

Review found something. Read every unresolved review thread **and every PR-level comment** — reviewers use both — and classify each. The tracker is written first in all three cases; the render follows it.

- **Editorial** — wording, a broken link, a missing screenshot, something the export dropped. Nothing to record: fix the snapshot and push.
- **Clarification** — the map decided this, but only by implication, and the reviewer is right that nobody said it plainly. Comment the rule on the ticket that owns it and fold it into the map's decisions index, then re-render. The ticket stays closed: a gap in the write-up is not a reopened call, and say so, since a reviewer reading a fresh comment on a closed ticket will otherwise assume it moved.
- **A decision** — the reviewer contests an answer, or names a question the map never charted. Reopen the ticket or chart a new one, and let a normal wayfinder session resolve it; an answer that was incomplete rather than wrong earns a fresh ticket and leaves the original closed. An option or reference offered toward an open question is recorded on that ticket too, carrying the tension against any decision it cuts across.

Charting a ticket **reopens the gate**. Name it in the snapshot's waivers section and in the section it bears on, so the render never reads finished while the map isn't, and merge waits for it to close or be waived.

Then report the round. Comment on the map's epic what was recorded where and how each item was classified, and reply on the PR: every thread gets its fix or its ticket link, plus one comment naming each tracker write by key. Reviewers watch the PR, so that comment is the only place they see the map move.

Done when the tracker carries every outcome, the render reflects that state, and every thread has a reply.

## Close out

The PR merged. Comment the PR URL, the merge SHA, and the snapshot's path on the map's epic — this comment is the pointer `/to-spec` follows to the approved baseline — then close the epic. A closed epic means no further wayfinding; changes from here go through Amend.

## Amend

The approved snapshot is frozen except through this skill. When an approved map must change — `/to-spec` hit a contradiction, product moved — reopen the epic, chart the changed decisions as normal wayfinder tickets, and once they resolve, run Publish again: same document, fresh PR, same gate and review. Merge re-closes the epic.
