import { describe, expect, it } from "vitest";
import { appRouter } from "../src/router.ts";

describe("appRouter", () => {
  it("greets by name", async () => {
    const caller = appRouter.createCaller({});
    const result = await caller.greet({ name: "Jeff" });
    expect(result.message).toBe("Hello Jeff, from the Milk Lab API");
    expect(result.at).toBeInstanceOf(Date);
  });
});
