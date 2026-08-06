---
name: ask-product
description: File a Jira question ticket to the product/design team for a decision they own — scope, UX, flows, copy, priority.
argument-hint: '[question] [members to tag]'
disable-model-invocation: true
---

# ask-product

A **question ticket** turns the decision blocking you into a board card the product team answers where they already work, and the ticket is where their answer lands. This skill frames it for a **product audience**: user impact and options in plain language. Name screens, flows, and behaviours — never files or code. For decisions engineering owns, use `/ask-engineering` instead.

## Distill the question

Pull exactly one decision from the chat context — several independent decisions become several tickets. The summary is the question itself, phrased as one. Body:

```markdown
<one paragraph: what's being built and why this decision is needed now>

## Options

1. **<option>** — <what the user sees, the trade-off>
2. ...

**Our default if we hear nothing:** <option and why>

## Blocked work

<ticket name and key, or "None — this question stands alone">
```

## Publish

Follow **Question tickets** in `docs/agents/issue-tracker.md`: create with audience `product`, assign the first member the user named and @mention the rest, route to the blocked work's epic and sprint, and wire the `Blocks` link plus `blocked-by-<key>` mirror onto the blocked ticket — then raise that ticket's **flag with a comment @mentioning the same members**, so the board shows the work stopped and the people who can restart it hear about it. One list of members throughout: whoever is assigned and tagged on the question is who the flag comment mentions.

## Report

The step is done when the ticket carries its label, epic, sprint, and assignee, the block is wired, the blocked ticket is flagged with everyone mentioned, and chat has: the ticket by name with its key, who was tagged, and that `/check-questions` sweeps for the answer and clears the flag.
