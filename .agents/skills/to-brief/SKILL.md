---
name: to-brief
description: Distill a finished wayfinder map into one short, plain-language brief for the product team — where the effort landed, cross-checked against its pitch.
disable-model-invocation: true
---

A finished wayfinder map is written for the people who walked it: dozens of decisions in engineering vocabulary, indexed for zooming. The product team needs one page of it. This skill renders the map into a **brief** — a single short ticket telling product where the effort landed and what happens next, in their language.

Like `/publish-map`'s snapshot, the brief is a **render**: the map stays where decisions live, this skill is the brief's only writer, and a rebuild regenerates it from the tracker afresh. The brief gists and links; the map holds the detail.

Where the brief ticket lives and how it routes is tracker-specific — consult the tracker doc's "Briefing operations" section. Run `/setup-matt-pocock-skills` if no tracker has been provided.

## Voice

Write for a reader who has never opened the repo and never will. Their vocabulary is the product's — the words on the pitch and on the screens. Name outcomes as the user will meet them ("removing a location takes that location's assignments with it"), and leave each mechanism behind the map link that owns it. The read-back test: read the finished draft once as that reader, and rewrite every sentence they would stumble on — a sentence that needs a schema, an endpoint, or an internal codename to parse fails.

## The cross-check

The pitch is the promise; the map is what was decided; the brief reconciles them, because a pitched promise the brief is silent on reads as delivered. Fetch the originating pitch (the map's Notes names it) and walk it item by item — every problem, deliverable, open item, and no-go takes a **verdict**:

- **Landed** — resolved as pitched; the brief carries the outcome in a line.
- **Changed** — resolved differently than the pitch assumed; the brief names the change and the reason in a phrase.
- **Deferred** — pushed past this effort's destination; the brief says so plainly, and whether it is parked for a follow-up or dead.

Verdicts come from the map's decisions index and Out of scope; zoom a ticket only where the gist is too thin to call. The cross-check is complete when every pitch item holds a verdict.

## The brief

One ticket, five sections, under 300 words of prose (the sketch's code block sits outside the budget):

1. **What we set out to do** — the pitch's problem, one or two sentences.
2. **Where we landed** — the path forward: what will be built, described as the user will meet it. The largest section, and still a paragraph.
3. **What changed along the way** — every Changed and Deferred verdict, one line each. Omit the section only when every verdict is Landed.
4. **The sketch** — the technical direction at a glance: one preformatted block of labeled stanzas (THE PIECES, then one stanza per flow), each stanza two or three short plain-English lines, a blank line between stanzas, twenty lines all told. Plain preformatted text, never a syntax-highlighted code block — a highlighter paints arbitrary words in colors that imply meaning, and density without whitespace gives the eye nowhere to land. Built from the brief's own nouns so a product reader who just read section 2 can follow it, and each line traceable to a map decision.
5. **What happens next** — the immediate next step, and what product is being asked to do with this brief, if anything.

Every sentence traces to a map decision or a pitch verdict — the brief asserts nothing the map hasn't decided. End with links to the map and the pitch.

## Publish

The product team reads this, so the draft is shown to the user in full and only what comes back approved is posted. Then create the ticket per the tracker doc's "Briefing operations" and comment its link on the map, so the map points at its render.

Done when the approved brief is on the tracker and the map links it.
