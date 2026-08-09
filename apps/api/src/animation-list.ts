/**
 * A paged animation list, shared by the gallery and the caller's own.
 *
 * Offsets rather than cursors: the reader picks the sort, and a cursor that
 * survived a re-sort would have to encode every sort key.
 */
import { z } from "zod";
import type { Visibility } from "./visibility.ts";

export const LIST_SORTS = ["newest", "oldest", "name", "longest"] as const;
export type ListSort = (typeof LIST_SORTS)[number];

export const DEFAULT_PER_PAGE = 24;
export const MAX_PER_PAGE = 100;
export const SEARCH_MAX = 100;

export const listInputSchema = z.object({
  robotSlug: z.string().optional(),
  search: z.string().max(SEARCH_MAX).optional(),
  sort: z.enum(LIST_SORTS).default("newest"),
  // a page number is navigation, not an assertion: nonsense lands on page 1
  // and a page past the end lands on the last one (see pageWindow)
  page: z.number().int().min(1).catch(1).default(1),
  perPage: z.number().int().min(1).max(MAX_PER_PAGE).default(DEFAULT_PER_PAGE),
});

export interface ListScope {
  ownerId?: string;
  visibility?: Visibility;
  robotSlug?: string;
  search?: string;
}

export function listWhere({ ownerId, visibility, robotSlug, search }: ListScope) {
  const trimmed = search?.trim();
  return {
    ...(ownerId ? { ownerId } : {}),
    ...(visibility ? { visibility } : {}),
    ...(robotSlug ? { robot: { slug: robotSlug } } : {}),
    ...(trimmed
      ? {
          OR: [
            { name: { contains: trimmed, mode: "insensitive" as const } },
            { description: { contains: trimmed, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

const SORT_KEYS = {
  newest: { createdAt: "desc" },
  oldest: { createdAt: "asc" },
  name: { name: "asc" },
  longest: { durationMs: "desc" },
} as const;

/** Every sort ends on id: ties would otherwise shuffle rows between pages. */
export function listOrderBy(sort: ListSort) {
  return [SORT_KEYS[sort], { id: "desc" as const }];
}

export interface PageWindow {
  page: number;
  pageCount: number;
  skip: number;
  take: number;
}

/** Resolves a requested page against the real total — an out-of-range page
 * lands on the last one rather than on an empty list. */
export function pageWindow({
  page,
  perPage,
  total,
}: {
  page: number;
  perPage: number;
  total: number;
}): PageWindow {
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const resolved = Math.min(page, pageCount);
  return { page: resolved, pageCount, skip: (resolved - 1) * perPage, take: perPage };
}
