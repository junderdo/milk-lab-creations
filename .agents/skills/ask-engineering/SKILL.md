---
name: ask-engineering
description: File a Jira question ticket to the engineering team for a technical decision — architecture, API contracts, data model, migrations, library choice.
argument-hint: '[question] [members to tag]'
disable-model-invocation: true
---

# ask-engineering

A **question ticket** turns the decision blocking you into a board card an engineer answers where they already work, and the ticket is where their answer lands. This skill frames it for an **engineering audience**: a full technical breakdown, with code referenced as `path/to/file.ts:line` so the reader lands on the evidence. For decisions product or design owns, use `/ask-product` instead.

## Distill the question

Pull exactly one decision from the chat context — several independent decisions become several tickets. The summary is the question itself, phrased as one. Body:

```markdown
<one paragraph: what's being built and why this decision is needed now>

## Current state

<what the code does today, as `path:line` references; the constraints that box the decision in>

## Options

1. **<option>** — <mechanism, trade-off, blast radius, how reversible>
2. ...

**Our default if we hear nothing:** <option and why>

## Blocked work

<ticket name and key, or "None — this question stands alone">
```

## Publish

Follow **Question tickets** in `docs/agents/issue-tracker.md`: create with audience `engineering`, assign the first member the user named and @mention the rest, route to the blocked work's epic and sprint, and wire the `Blocks` link plus `blocked-by-<key>` mirror onto the blocked ticket — then raise that ticket's **flag with a comment @mentioning the same members**, so the board shows the work stopped and the people who can restart it hear about it. One list of members throughout: whoever is assigned and tagged on the question is who the flag comment mentions.

## Report

The step is done when the ticket carries its label, epic, sprint, and assignee, the block is wired, the blocked ticket is flagged with everyone mentioned, and chat has: the ticket by name with its key, who was tagged, and that `/check-questions` sweeps for the answer and clears the flag.
