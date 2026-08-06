# Issue tracker: Trello

Issues, tasks, and specs (you may know a spec as a PRD) for this repo live as **cards on the
"Milk Lab Creations" Trello board**. Use the `trello` CLI (npm package `trello-cli`, installed
globally) for all operations. Do not use a GitHub-issues workflow here — the GitHub remote is for
code and pull requests only.

The board's lists are **Todo**, **In Progress**, and **Done**. List position carries workflow state;
labels carry triage role and wayfinder type.

## Conventions

Almost every command needs `--board "Milk Lab Creations"` plus the `--list` the card currently sits
in. Add `--format json` to any command when you need to parse the output.

- **Create a card**: `trello card:create --board "Milk Lab Creations" --list "Todo" -n "Title" --description "..."`.
  Use a heredoc or a `$(cat file)` for multi-line descriptions. Optional: `--label <name>` (repeatable),
  `--due <date>`, `--position top|bottom`.
- **List cards**: `trello card:list --board "Milk Lab Creations" --list "Todo"` — prints `Name (ID: ...)`
  per card. This is the way to get a card's ID.
- **Read a card**: `trello card:get-by-id --id <card-id>` — the most reliable read, since it needs no
  `--list`. `trello card:show --card "<title>" --board "Milk Lab Creations" --list "Todo"` works too
  when you know the list.
- **Comment**: `trello card:comment --board "Milk Lab Creations" --list "<list>" --card "<title>" --text "..."`
- **Read comments**: `trello card:comments --board "Milk Lab Creations" --list "<list>" --card "<title>"`
- **Apply a label**: `trello card:label --board "Milk Lab Creations" --list "<list>" --card "<title>" --label "<label>"`
- **Move between lists** (this is how state changes): `trello card:move --board "Milk Lab Creations" --list "Todo" --card "<title>" --to "In Progress"`
- **Close**: move the card to **Done**. Reserve `trello card:archive` for cards that were mistakes or
  duplicates — a card that got built belongs in Done, not archived.
- **Search**: `trello search --query "some text" --board "Milk Lab Creations" --type cards`
- **Labels on the board**: `trello label:list --board "Milk Lab Creations"`;
  create one with `trello label:create --board "Milk Lab Creations" -n "<name>" --color <green|yellow|orange|red|purple|blue|sky|lime|pink|black>`
- **Checklists**: `trello card:checklist ... -n "<name>"` to add one;
  `trello card:check-item ... --item "<item>" --state complete|incomplete [--checklist "<name>"]` to tick items.

### Card body shape

Cards are the unit of work; the description is the issue body. The established shape on this board:

```markdown
## Parent

<title of the parent spec/map card> — <its trello.com/c/... URL>

## What to build

<prose: the observable behavior this card delivers>

## Acceptance criteria

- [ ] ...
- [ ] ...

## Blocked by

<card titles + URLs, or "None — can start immediately.">
```

Keep `## Parent` and `## Blocked by` even when empty — they're what makes the board navigable
without opening every card.

## When a skill says "publish to the issue tracker"

Create a card in **Todo** with `trello card:create`, using the body shape above.

## When a skill says "fetch the relevant ticket"

`trello card:list` the relevant list to find the card's ID, then `trello card:get-by-id --id <id>`.
Follow with `trello card:comments` if the conversation history matters. The user will normally name
the card by title.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a card with one **child** card per ticket.

- **Map**: a card labelled `wayfinder:map` whose description holds the Notes / Decisions-so-far / Fog
  body. Create with `trello card:create --board "Milk Lab Creations" --list "Todo" -n "Spec: <effort>" --label "wayfinder:map"`.
- **Child ticket**: its own card in **Todo**, labelled `wayfinder:<type>`
  (`research` / `prototype` / `grilling` / `task`), with `## Parent` in the description linking the
  map card's URL. Trello has no native parent/child, so the link plus a checklist on the map card is
  the representation.
- **Blocking**: the `## Blocked by` section of the child's description, listing blocker card titles
  and URLs. A ticket is unblocked when every card it lists is in **Done**.
- **Frontier query**: list **Todo** (`trello card:list --board "Milk Lab Creations" --list "Todo"`),
  drop cards whose `## Blocked by` names a card not yet in Done, drop cards with a member assigned;
  first in board order wins.
- **Claim**: `trello card:assign --board "Milk Lab Creations" --list "Todo" --card "<title>" --user <me>`
  and move it to **In Progress** — the session's first write.
- **Resolve**: `trello card:comment` the answer onto the card, move it to **Done**, then append a
  context pointer (gist + card URL) to the map card's Decisions-so-far.

## Gotchas

- **`--list` must be the card's *current* list.** After a `card:move`, later commands need the new
  list name. Commands that take a card ID (`card:get-by-id`) sidestep this.
- **Labels are add-only through the CLI.** There is no `card:unlabel`. Where a skill says to *remove*
  a triage label, either do it in the Trello UI or — better — let the list position carry the state
  and leave the label as a historical marker.
- **Duplicate label names exist on this board** (`wayfinder:task`, `wayfinder:prototype`, and
  `wayfinder:grilling` each exist in two colors). Lookup by name may hit either. Run
  `trello label:list --board "Milk Lab Creations"` before assuming, and prefer the color already in
  use on sibling cards.
- **The name→ID cache is local SQLite** (`~/.trello-cli/default/trello.db`). If a board or list was
  renamed and the CLI reports it "not found" even though `board:list` shows it, the cache is stale —
  run `trello sync`.
- **Auth failures are the user's to fix.** Credentials live in `~/.trello-cli/`. If a command fails
  with an auth error, ask the user to re-authenticate; never attempt to fetch tokens yourself.
