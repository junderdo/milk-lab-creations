import { describe, expect, it } from "vitest";
import { listOrderBy, listWhere, pageWindow } from "../src/animation-list.ts";

describe("listWhere", () => {
  it("matches everything when nothing is asked for", () => {
    expect(listWhere({})).toEqual({});
  });

  it("scopes by owner, visibility and robot", () => {
    expect(
      listWhere({ ownerId: "owner-1", visibility: "public", robotSlug: "robo-cat-ears" }),
    ).toEqual({
      ownerId: "owner-1",
      visibility: "public",
      robot: { slug: "robo-cat-ears" },
    });
  });

  it("searches name and description case-insensitively", () => {
    expect(listWhere({ search: "wig" })).toEqual({
      OR: [
        { name: { contains: "wig", mode: "insensitive" } },
        { description: { contains: "wig", mode: "insensitive" } },
      ],
    });
  });

  it("ignores a blank search", () => {
    expect(listWhere({ search: "   " })).toEqual({});
  });
});

describe("listOrderBy", () => {
  it("breaks every tie on id so paging is deterministic", () => {
    for (const sort of ["newest", "oldest", "name", "longest"] as const) {
      const order = listOrderBy(sort);
      expect(order[order.length - 1]).toEqual({ id: "desc" });
    }
  });

  it("orders newest first by default and oldest first on request", () => {
    expect(listOrderBy("newest")[0]).toEqual({ createdAt: "desc" });
    expect(listOrderBy("oldest")[0]).toEqual({ createdAt: "asc" });
  });

  it("orders by name ascending and duration descending", () => {
    expect(listOrderBy("name")[0]).toEqual({ name: "asc" });
    expect(listOrderBy("longest")[0]).toEqual({ durationMs: "desc" });
  });
});

describe("pageWindow", () => {
  it("skips whole pages ahead of the requested one", () => {
    expect(pageWindow({ page: 3, perPage: 10, total: 55 })).toEqual({
      page: 3,
      pageCount: 6,
      skip: 20,
      take: 10,
    });
  });

  it("clamps a page past the end to the last page", () => {
    expect(pageWindow({ page: 99, perPage: 10, total: 25 })).toMatchObject({ page: 3, skip: 20 });
  });

  it("keeps page 1 of 1 for an empty result set", () => {
    expect(pageWindow({ page: 4, perPage: 10, total: 0 })).toEqual({
      page: 1,
      pageCount: 1,
      skip: 0,
      take: 10,
    });
  });
});
