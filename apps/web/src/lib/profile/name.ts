/**
 * What blurring a name field means.
 *
 * A name commits on blur rather than on a Save button, so the decision has to
 * be made without a user watching for a verdict: leaving the field is not
 * evidence they meant to write, and most blurs write nothing at all. Deciding
 * it here rather than inside the page keeps the three answers nameable and
 * testable — the page only renders them.
 *
 * The same trim the server applies (`nameSchema`), so a name that is only
 * spaces is refused here rather than round-tripped for a 400.
 *
 * Both fields on the profile page edit this way — the display name and a
 * device's — so `subject` is what the messages call the thing being named.
 */

import { NAME_MAX } from "@milklab/api/limits";

export type NameCommit =
  | { kind: "unchanged" }
  | { kind: "invalid"; message: string }
  | { kind: "save"; name: string };

export function commitName(draft: string, current: string, subject: string): NameCommit {
  const name = draft.trim();
  if (name.length === 0) return { kind: "invalid", message: `${subject} can't be empty.` };
  if (name.length > NAME_MAX) {
    return { kind: "invalid", message: `${subject} can be at most ${NAME_MAX} characters.` };
  }
  if (name === current) return { kind: "unchanged" };
  return { kind: "save", name };
}
