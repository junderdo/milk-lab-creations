/**
 * URLs for a list route with its filter state attached.
 *
 * Separate from `list-query.ts` so that module stays free of SvelteKit and
 * testable as plain logic; this is the thin part that knows about routes.
 */

import { resolve } from "$app/paths";
import { listQuerySearch, type ListQuery } from "./list-query";

/** The routes that render a paged animation list. */
export type ListRoute = "/" | "/my";

export function listHref(
  route: ListRoute,
  query: ListQuery,
  changes: Partial<ListQuery> = {},
): string {
  const params = listQuerySearch(query, changes);
  const path = resolve(route);
  return params ? `${path}?${params}` : path;
}
