import { NAME_MAX } from "@milklab/api/limits";
import { describe, expect, it } from "vitest";
import { commitDisplayName } from "./display-name";

describe("commitDisplayName", () => {
  it("writes a real change", () => {
    expect(commitDisplayName("Cat Herder", "Jeff")).toEqual({
      kind: "save",
      displayName: "Cat Herder",
    });
  });

  it("trims, as the server will", () => {
    expect(commitDisplayName("  Cat Herder  ", "Jeff")).toEqual({
      kind: "save",
      displayName: "Cat Herder",
    });
  });

  it("writes nothing when leaving the field changed nothing", () => {
    expect(commitDisplayName("Jeff", "Jeff").kind).toBe("unchanged");
    expect(commitDisplayName("  Jeff  ", "Jeff").kind).toBe("unchanged");
  });

  it("refuses a name that is empty or only spaces", () => {
    for (const draft of ["", "   "]) {
      expect(commitDisplayName(draft, "Jeff")).toMatchObject({ kind: "invalid" });
    }
  });

  it("refuses a name past the length the server accepts", () => {
    expect(commitDisplayName("x".repeat(NAME_MAX), "Jeff").kind).toBe("save");
    expect(commitDisplayName("x".repeat(NAME_MAX + 1), "Jeff").kind).toBe("invalid");
  });
});
