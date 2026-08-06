# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual
label strings used on the **Milk Lab Creations** Trello board.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label
string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Board notes

- Only **`ready-for-agent`** currently exists on the board (lime). The other four are created on
  first use:
  `trello label:create --board "Milk Lab Creations" -n "needs-triage" --color <color>`
- Apply with `trello card:label --board "Milk Lab Creations" --list "<current list>" --card "<title>" --label "<label>"`.
- The CLI cannot **remove** a label. Treat triage labels as additive markers and let the
  Todo / In Progress / Done list position carry live workflow state; strip a stale label in the
  Trello UI if it genuinely misleads.
- `wontfix` is the one role where the label matters more than the list — a wontfix card should carry
  the label *and* move to Done, so Todo stays a true queue.
