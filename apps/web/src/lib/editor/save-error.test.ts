import { describe, expect, it } from "vitest";
import { saveFailureFrom } from "./save-error";

const current = {
  id: "anim-1",
  name: "Changed in the other tab",
  description: null,
  payload: { schemaVersion: 1, keyframes: [] },
  updatedAt: new Date("2026-08-05T14:00:00.000Z"),
};

/** The shape a TRPCClientError presents: `.message` plus the formatted `.data`. */
function clientError(data: unknown, message = "animation was changed elsewhere") {
  return { message, data };
}

describe("saveFailureFrom", () => {
  it("reads the server record a CONFLICT carries", () => {
    const failure = saveFailureFrom(clientError({ code: "CONFLICT", current }));
    expect(failure).toEqual({ kind: "conflict", server: current });
  });

  it("accepts an updatedAt that arrived as a string", () => {
    const failure = saveFailureFrom(
      clientError({ code: "CONFLICT", current: { ...current, updatedAt: "2026-08-05T14:00:00Z" } }),
    );
    expect(failure.kind === "conflict" && failure.server.updatedAt).toEqual(current.updatedAt);
  });

  it("falls back to a message when a conflict payload cannot be read", () => {
    // better an honest save error than a dialog offering to adopt a record we
    // do not actually have
    expect(saveFailureFrom(clientError({ code: "CONFLICT", current: { id: "anim-1" } }))).toEqual({
      kind: "message",
      message: "animation was changed elsewhere",
    });
    expect(saveFailureFrom(clientError({ code: "CONFLICT" })).kind).toBe("message");
  });

  it("reports any other rejection by its message", () => {
    expect(
      saveFailureFrom(clientError({ code: "BAD_REQUEST" }, "invalid animation payload")),
    ).toEqual({ kind: "message", message: "invalid animation payload" });
  });

  it("has something to say about a thrown value that is not an error at all", () => {
    expect(saveFailureFrom("boom")).toEqual({
      kind: "message",
      message: "Could not save. Please try again.",
    });
    expect(saveFailureFrom(undefined).kind).toBe("message");
  });
});
