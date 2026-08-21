import { NAME_MAX } from "@milklab/api/limits";
import { describe, expect, it } from "vitest";
import { commitName } from "./name";

const commit = (draft: string, current: string) => commitName(draft, current, "Your name");

describe("commitName", () => {
  it("writes a real change", () => {
    expect(commit("Cat Herder", "Jeff")).toEqual({ kind: "save", name: "Cat Herder" });
  });

  it("trims, as the server will", () => {
    expect(commit("  Cat Herder  ", "Jeff")).toEqual({ kind: "save", name: "Cat Herder" });
  });

  it("writes nothing when leaving the field changed nothing", () => {
    expect(commit("Jeff", "Jeff").kind).toBe("unchanged");
    expect(commit("  Jeff  ", "Jeff").kind).toBe("unchanged");
  });

  it("refuses a name that is empty or only spaces", () => {
    for (const draft of ["", "   "]) {
      expect(commit(draft, "Jeff")).toMatchObject({ kind: "invalid" });
    }
  });

  it("refuses a name past the length the server accepts", () => {
    expect(commit("x".repeat(NAME_MAX), "Jeff").kind).toBe("save");
    expect(commit("x".repeat(NAME_MAX + 1), "Jeff").kind).toBe("invalid");
  });

  it("names the field it is refusing, so one message serves both", () => {
    expect(commitName("", "Jeff", "A name for your ears")).toMatchObject({
      message: "A name for your ears can't be empty.",
    });
  });
});
