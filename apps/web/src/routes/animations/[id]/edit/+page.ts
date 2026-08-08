import { error, redirect } from "@sveltejs/kit";
import { resolve } from "$app/paths";
import { limitsFor } from "$lib/editor/document";
import { trpc } from "$lib/trpc";
import type { PageLoad } from "./$types";

/**
 * Client-rendered: the editor is a canvas, a WebGL preview and a pile of
 * pointer handlers — there is no useful first paint to send from the server.
 */
export const ssr = false;

/** NOT_FOUND is what the API returns for anything the caller cannot view. */
async function loadAnimation(fetchFn: typeof fetch, accessToken: string | null, id: string) {
  try {
    return await trpc(fetchFn, accessToken).animations.byId.query({ id });
  } catch {
    error(404, "Animation not found");
  }
}

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const { accessToken, me } = await parent();
  const animation = await loadAnimation(fetch, accessToken, params.id);

  // Only the owner edits. Everyone else lands on the detail page, where Remix
  // is their way in — the same rule the API enforces on the write.
  if (me === null || animation.ownerId !== me.id) {
    redirect(302, resolve("/animations/[id]", { id: params.id }));
  }

  // Without a validation profile there are no limits to keep edits inside, and
  // every save would be rejected server-side. Better to say so than to open an
  // editor that cannot produce a document this robot accepts.
  const robot = animation.robot;
  const limits = robot === null ? undefined : limitsFor(robot.slug);
  if (robot === null || limits === undefined) {
    error(501, `${robot?.name ?? "This robot"} can't be edited yet`);
  }

  return { animation, robot, limits };
};
