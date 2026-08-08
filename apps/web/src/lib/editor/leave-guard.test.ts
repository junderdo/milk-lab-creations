import { describe, expect, it } from "vitest";
import { leaveDecision, type LeaveAttempt } from "./leave-guard";

const attempt = (overrides: Partial<LeaveAttempt> = {}): LeaveAttempt => ({
  dirty: true,
  confirmed: false,
  willUnload: false,
  to: new URL("https://milklab.test/animations/anim-1"),
  viaHistory: false,
  ...overrides,
});

describe("leaving the editor", () => {
  it("lets a clean editor go without a word", () => {
    expect(leaveDecision(attempt({ dirty: false }))).toEqual({ kind: "allow" });
    expect(leaveDecision(attempt({ dirty: false, willUnload: true }))).toEqual({ kind: "allow" });
  });

  it("asks about unsaved work, remembering where the user was going", () => {
    expect(leaveDecision(attempt())).toEqual({
      kind: "ask",
      leave: { url: new URL("https://milklab.test/animations/anim-1"), viaHistory: false },
    });
  });

  it("carries out the answer rather than asking it again", () => {
    expect(leaveDecision(attempt({ confirmed: true }))).toEqual({ kind: "allow" });
  });

  it("hands a page that is unloading to the browser's own prompt", () => {
    // our dialog would be rendered into a page that may already be going
    expect(leaveDecision(attempt({ willUnload: true }))).toEqual({ kind: "warn-native" });
    expect(leaveDecision(attempt({ willUnload: true, to: null }))).toEqual({ kind: "warn-native" });
  });

  it("remembers a Back, so answering Leave goes back rather than forward", () => {
    expect(leaveDecision(attempt({ viaHistory: true }))).toEqual({
      kind: "ask",
      leave: { url: new URL("https://milklab.test/animations/anim-1"), viaHistory: true },
    });
  });

  it("does not block a destination it could not resume", () => {
    expect(leaveDecision(attempt({ to: null }))).toEqual({ kind: "allow" });
  });
});
