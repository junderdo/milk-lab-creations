# Milk Lab Creations

pnpm + Turborepo monorepo: `apps/api` (tRPC v11 on Lambda via SST v3), `apps/web` (SvelteKit 2 / Svelte 5 + Tailwind v4 + Tark UI), `packages/config` (shared tsconfig/eslint/prettier presets). Packages are scoped `@milklab/*`.

## Development

```bash
pnpm install
pnpm build / pnpm check / pnpm lint / pnpm test   # turbo pipelines
pnpm dev                                           # sst dev: personal stage (DSQL+Cognito), migrations, API :3001, web :5173
pnpm --filter @milklab/api dev:server              # local tRPC server on :3001 (needs AWS_PROFILE=milklab-dev for DSQL)
pnpm --filter @milklab/web dev                     # SvelteKit dev (talks to :3001 by default)
```

AWS deploys use profile `milklab-dev` (us-west-2); re-auth with `aws sso login --sso-session personal`. Tark UI components are copy-pasted from tarkui.com (`?framework=svelte`) into `apps/web/src/lib/components/` — rewrite their `lucide-svelte` imports to `@lucide/svelte`.

## Coding standards

How we write TypeScript here is in `docs/typescript.md` — it holds in review across `apps/api`,
`apps/web`, and `packages/config`.

It started as a copy from another repo and has since been tailored to this one: the examples are
this project's shapes (animations, keyframes, payloads, robot profiles), the `## Svelte` section
covers Svelte 5 runes and SvelteKit, and boundary parsing points at `apps/api/src/payload.ts` and
the Zod schemas in `apps/api/src/router.ts` rather than an external doc.

## Issue tracking (Trello)

Issues for this project are tracked on the **Milk Lab Creations** Trello board using the `trello` CLI (npm package `trello-cli`, installed globally).

The board's lists are **Todo**, **In Progress**, and **Done**.

### Common commands

```bash
trello list:list --board "Milk Lab Creations"                    # show the board's lists
trello card:list --board "Milk Lab Creations" --list "Todo"      # list cards in a list
trello card:get-by-id --id <card-id>                             # read a card in full
trello card:create --board "Milk Lab Creations" --list "Todo" -n "Card title" --description "Details"
trello card:move --board "Milk Lab Creations" --list "Todo" --card "Card title" --to "In Progress"
trello search --query "some text" --board "Milk Lab Creations"   # search cards
```

Run `trello <topic> --help` (e.g. `trello card --help`) to discover subcommands. Card body shape,
label handling, wayfinder conventions, and the CLI's sharp edges are in
`docs/agents/issue-tracker.md`.

### Workflow

- New bugs/ideas/tasks go in the **Todo** list as cards.
- Move a card to **In Progress** when work starts, **Done** when it lands.
- Reference the card title in related commit messages when it makes sense.

### Auth

Credentials are stored in `~/.trello-cli/` (set up once via `trello auth:api-key <key>` and `trello auth:token <token>`; key/token come from https://trello.com/power-ups/admin). If a command fails with an auth error, ask the user to re-authenticate — do not attempt to fetch tokens yourself.

## Agent skills

The engineering skills are vendored into this repo: real directories in
`.agents/skills/` (tool-agnostic), exposed to Claude Code as symlinks in
`.claude/skills/`. Project-level skills shadow any same-named skill installed
globally, so this repo pins its own versions — matching the zagops setup.
Local deviations from upstream are recorded in `.agents/skills/LOCAL-EDITS.md`.

### Code review

Always use `matt-code-review` — including when another skill (such as
`/implement`) says to review the work. Never the generic `code-review`, which
may exist as a global skill or plugin command.

### Issue tracker

Cards on the **Milk Lab Creations** Trello board, driven by the `trello` CLI — not GitHub issues. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, each label string equal to its name (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and one `docs/adr/` at the repo root cover the whole monorepo. See `docs/agents/domain.md`.
