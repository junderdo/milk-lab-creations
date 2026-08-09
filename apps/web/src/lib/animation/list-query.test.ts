import { describe, expect, it } from "vitest";
import {
  isFiltered,
  listQuerySearch,
  parseListQuery,
  withoutVisibilityFilter,
  type ListQuery,
} from "./list-query";

const parse = (search: string) => parseListQuery(new URLSearchParams(search));

describe("parseListQuery", () => {
  it("defaults an empty URL to page 1, newest first, no filters", () => {
    expect(parse("")).toEqual({
      page: 1,
      sort: "newest",
      robotSlug: "",
      search: "",
      visibility: "",
    });
  });

  it("reads page, sort, robot, search and visibility", () => {
    expect(parse("page=3&sort=name&robot=robo-cat-ears&q=wiggle&visibility=public")).toEqual({
      page: 3,
      sort: "name",
      robotSlug: "robo-cat-ears",
      search: "wiggle",
      visibility: "public",
    });
  });

  it("falls back to defaults for values this build doesn't know", () => {
    expect(parse("sort=sideways&visibility=cosmic")).toMatchObject({
      sort: "newest",
      visibility: "",
    });
  });

  it("treats an unparseable or out-of-range page as the first page", () => {
    expect(parse("page=nope").page).toBe(1);
    expect(parse("page=0").page).toBe(1);
    expect(parse("page=-4").page).toBe(1);
  });
});

describe("withoutVisibilityFilter", () => {
  it("drops a visibility a public list cannot honour", () => {
    const query = withoutVisibilityFilter(parse("visibility=private&q=wiggle"));
    expect(query).toMatchObject({ visibility: "", search: "wiggle" });
    expect(isFiltered(query)).toBe(true);
  });

  it("leaves an otherwise unfiltered list reading as unfiltered", () => {
    expect(isFiltered(withoutVisibilityFilter(parse("visibility=private")))).toBe(false);
  });
});

describe("listQuerySearch", () => {
  const base: ListQuery = {
    page: 2,
    sort: "name",
    robotSlug: "robo-cat-ears",
    search: "wiggle",
    visibility: "public",
  };

  it("round-trips a query through the URL", () => {
    expect(parse(listQuerySearch(base))).toEqual(base);
  });

  it("leaves defaults out of the URL", () => {
    expect(
      listQuerySearch({ page: 1, sort: "newest", robotSlug: "", search: "", visibility: "" }),
    ).toBe("");
  });

  it("applies changes on top of the current query", () => {
    expect(parse(listQuerySearch(base, { page: 5 })).page).toBe(5);
  });

  it("returns to page 1 whenever a filter or sort changes", () => {
    expect(parse(listQuerySearch(base, { search: "nod" }))).toMatchObject({
      page: 1,
      search: "nod",
    });
    expect(parse(listQuerySearch(base, { sort: "oldest" })).page).toBe(1);
    expect(parse(listQuerySearch(base, { robotSlug: "" })).page).toBe(1);
    expect(parse(listQuerySearch(base, { visibility: "private" })).page).toBe(1);
  });
});
