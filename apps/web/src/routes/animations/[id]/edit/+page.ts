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

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const { accessToken, me } = await parent();

  let animation;
  try {
    animation = await trpc(fetch, accessToken).animations.byId.query({ id: params.id });
  } catch {
    error(404, "Animation not found");
  }

  // Only the owner edits. Everyone else lands on the detail page, where Remix
  // is their way in — the same rule the API enforces on the write.
  if (me === null || animation.ownerId !== me.id) {
    redirect(302, resolve("/animations/[id]", { id: params.id }));
  }

  // Without a validation profile there are no limits to keep edits inside, and
  // every save would be rejected server-side. Better to say so than to open an
  // editor that cannot produce a document this robot accepts.
  const limits = limitsFor(animation.robot?.slug ?? "");
  if (limits === undefined) {
    error(501, `${animation.robot?.name ?? "This robot"} can't be edited yet`);
  }

  return { animation, limits };
};
