---
name: check-questions
description: Sweep open Jira question tickets for answers — close and unblock the answered ones, relay counter-questions into chat and back onto the ticket.
disable-model-invocation: true
---

# check-questions

Drives every open question ticket filed by `/ask-product` or `/ask-engineering` to an outcome. All operations live under **Question tickets** in `docs/agents/issue-tracker.md` — run its answer-sweep query, read each ticket with comments, and classify by the newest response (a comment from anyone other than `jira me` since the question was posted).

## Outcomes

Every response gets a reply on the ticket — the answerer should never wonder whether anyone read them.

- **Waiting** — no response yet. Leave the ticket untouched.
- **Answered** — the response fully settles the question. Reply that the answer was received and is being integrated, restating the decision in one line so the ticket records what was decided, not just that a comment arrived; move it `Done`; drop the `blocked-by-<key>` mirror labels from every ticket it was blocking, and clear each of those tickets' **flags with a comment** recording the decision — unless another open question still blocks that ticket, which keeps its flag up. Beyond that the freed tickets need nothing more: claimability follows from the links and labels.
- **Still open** — the response asks something back, or answers only partially or ambiguously. Relay it in chat verbatim, attributed to its author, then reply on the ticket: answer their counter-question if the answer is already on hand — in the ticket body, the chat, or the repo — and name precisely what remains undecided; when the reply needs input only the user can give, ask in chat first and post their words. The ticket stays open.

A response that half-settles the question — answers one option away but asks about another — is still open: replying too much beats closing too early.

## Report

The sweep is done when **every** ticket it returned has one of the three outcomes and chat shows a single table — ticket by name and key, audience, outcome, what changed on the board. An empty sweep is a valid run; say so plainly.
