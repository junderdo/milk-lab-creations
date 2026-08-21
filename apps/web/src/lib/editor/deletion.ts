/**
 * What the app says before and after deleting an animation.
 *
 * Deletion is immediate and permanent — there is no trash — so the prompt
 * carries the name, to make sure it is the right one, and the consequence.
 * Remixes keep working: they hold their own copy and merely lose the
 * "remixed from" line.
 */

export interface DeletePrompt {
  title: string;
  body: string;
  confirmLabel: string;
}

export function deletePrompt(name: string): DeletePrompt {
  const trimmed = name.trim();
  const subject = trimmed === "" ? "this animation" : `"${trimmed}"`;
  return {
    title: "Delete this animation?",
    body: `This permanently deletes ${subject} and cannot be undone. Any remixes others have made keep their own copy.`,
    confirmLabel: "Delete",
  };
}

export const DELETE_FAILED_MESSAGE = "Could not delete this animation. Please try again.";

/** Where to go once it is gone: the owner's own list, which no longer has it. */
export const AFTER_DELETE_PATH = "/my";
