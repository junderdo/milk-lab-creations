/**
 * The filter/sort/page state of an animation list, as it lives in the URL.
 *
 * The URL is the state: a load reads it, the controls write it, and a shared
 * link or a reload lands on the same list. Defaults are absent from the query
 * string rather than spelled out, so an unfiltered list has a clean URL and
 * "same list" is a string comparison.
 */

import { LIST_SORTS, type ListSort } from "@milklab/api/list";
import { visibilityOf, type Visibility } from "../editor/visibility";

export type { ListSort };
export { LIST_SORTS };

export interface ListQuery {
  page: number;
  sort: ListSort;
  /** Empty means every robot. */
  robotSlug: string;
  search: string;
  /** Empty means every visibility; only `/my` offers the choice. */
  visibility: Visibility | "";
}

const DEFAULTS: ListQuery = {
  page: 1,
  sort: "newest",
  robotSlug: "",
  search: "",
  visibility: "",
};

const PARAM = { page: "page", sort: "sort", robot: "robot", search: "q", visibility: "visibility" };

/** A sort off a URL or a `<select>`, or the default for anything else. */
export function listSortOf(value: string | null): ListSort {
  return LIST_SORTS.find((sort) => sort === value) ?? DEFAULTS.sort;
}

/** A visibility filter, where empty (and anything unrecognised) means any. */
export function visibilityFilterOf(value: string | null): Visibility | "" {
  return (value === null ? null : visibilityOf(value)) ?? DEFAULTS.visibility;
}

function pageOf(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : DEFAULTS.page;
}

export function parseListQuery(params: URLSearchParams): ListQuery {
  return {
    page: pageOf(params.get(PARAM.page)),
    sort: listSortOf(params.get(PARAM.sort)),
    robotSlug: params.get(PARAM.robot) ?? DEFAULTS.robotSlug,
    search: params.get(PARAM.search) ?? DEFAULTS.search,
    visibility: visibilityFilterOf(params.get(PARAM.visibility)),
  };
}

/**
 * The gallery is public by definition, so a `visibility` param means nothing
 * there — dropped rather than carried, or an empty gallery would blame a filter
 * that was never applied.
 */
export const withoutVisibilityFilter = (query: ListQuery): ListQuery => ({
  ...query,
  visibility: "",
});

/** Whether anything is narrowing the list — an empty page says so differently. */
export const isFiltered = (query: ListQuery): boolean =>
  query.search !== "" || query.robotSlug !== "" || query.visibility !== "";

/**
 * The query string for `current` with `changes` applied. Anything but a page
 * change resets to page 1 — page 7 of a different filter is a different list,
 * and usually an empty one.
 */
export function listQuerySearch(current: ListQuery, changes: Partial<ListQuery> = {}): string {
  const changesAFilter = Object.keys(changes).some((key) => key !== "page");
  const next: ListQuery = { ...current, ...changes };
  const page = changes.page ?? (changesAFilter ? DEFAULTS.page : next.page);

  const params = new URLSearchParams();
  if (page !== DEFAULTS.page) params.set(PARAM.page, String(page));
  if (next.sort !== DEFAULTS.sort) params.set(PARAM.sort, next.sort);
  if (next.robotSlug) params.set(PARAM.robot, next.robotSlug);
  if (next.search) params.set(PARAM.search, next.search);
  if (next.visibility) params.set(PARAM.visibility, next.visibility);
  return params.toString();
}

/** What the list procedures take: the same state minus the empty-means-any strings. */
export function listQueryInput(query: ListQuery) {
  return {
    page: query.page,
    sort: query.sort,
    ...(query.robotSlug ? { robotSlug: query.robotSlug } : {}),
    ...(query.search ? { search: query.search } : {}),
    ...(query.visibility ? { visibility: query.visibility } : {}),
  };
}
