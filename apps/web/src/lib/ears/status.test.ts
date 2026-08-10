import { describe, expect, it } from "vitest";
import { STATUS_CODE, isOk, statusFrom, statusText } from "./status";

describe("statusFrom", () => {
  it("gives every code the protocol defines its own sentence", () => {
    const codes = Object.values(STATUS_CODE);
    const messages = codes.map((code) => statusFrom(code).message);

    expect(codes).toHaveLength(11);
    expect(new Set(messages).size).toBe(11);
    expect(messages.every((message) => message.endsWith("."))).toBe(true);
  });

  it("still says something useful about a code it has never heard of", () => {
    const status = statusFrom(0x7f);

    expect(status.name).toBe("UNKNOWN_STATUS");
    expect(status.message).not.toBe("");
  });
});

describe("statusText", () => {
  it("trails the sentence with the wire name and code", () => {
    expect(statusText(statusFrom(STATUS_CODE.slotEmpty))).toBe(
      "That slot is empty now; reconnect to see what your ears are holding. (SLOT_EMPTY 0x04)",
    );
  });
});

describe("isOk", () => {
  it("is true for zero and nothing else", () => {
    expect(isOk(STATUS_CODE.ok)).toBe(true);
    expect(isOk(STATUS_CODE.storageFailure)).toBe(false);
  });
});
