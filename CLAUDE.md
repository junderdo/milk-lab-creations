# Milk Lab Creations

## Issue tracking (Trello)

Issues for this project are tracked on the **Milk Lab Creations** Trello board using the `trello` CLI (npm package `trello-cli`, installed globally).

The board's lists are **Todo**, **In Progress**, and **Done**.

### Common commands

```bash
trello list:list --board "Milk Lab Creations"                    # show the board's lists
trello card:list --board "Milk Lab Creations" --list "Todo"      # list cards in a list
trello card:create --board "Milk Lab Creations" --list "Todo" -n "Card title" --description "Details"
trello card:move --board "Milk Lab Creations" --list "Todo" --card "Card title" --to "In Progress"
trello search "some text"                                        # search cards
```

Run `trello <topic> --help` (e.g. `trello card --help`) to discover subcommands.

### Workflow

- New bugs/ideas/tasks go in the **Todo** list as cards.
- Move a card to **In Progress** when work starts, **Done** when it lands.
- Reference the card title in related commit messages when it makes sense.

### Gotchas

- The CLI caches board/list names in a local SQLite db (`~/.trello-cli/default/trello.db`). If a board or list was renamed in Trello and the CLI reports it "not found" even though `board:list` shows it, the cache is stale.

### Auth

Credentials are stored in `~/.trello-cli/` (set up once via `trello auth:api-key <key>` and `trello auth:token <token>`; key/token come from https://trello.com/power-ups/admin). If a command fails with an auth error, ask the user to re-authenticate — do not attempt to fetch tokens yourself.
