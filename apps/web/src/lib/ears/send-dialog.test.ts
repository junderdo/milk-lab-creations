import { describe, expect, it } from "vitest";
import { buildSlots, type Slot } from "./protocol";
import { dialogView, occupantName, slotLabel } from "./send-dialog";

const ANIMATION_ID = "00112233-4455-6677-8899-aabbccddeeff";
const OTHER_ID = "ffeeddcc-bbaa-9988-7766-554433221100";

const slots: Slot[] = buildSlots(4, [
  { index: 1, animationId: OTHER_ID, name: "Something else" },
  { index: 2, animationId: ANIMATION_ID, name: "Tail flick" },
  { index: 3, animationId: null, name: "Made on the ears" },
]);

function view(target: number | undefined, name = "Tail flick") {
  return dialogView({ slots, target, name, animationId: ANIMATION_ID });
}

describe("slotLabel", () => {
  it("numbers slots from one for people, though the wire counts from zero", () => {
    expect(slotLabel(0)).toBe("slot 1");
    expect(slotLabel(15)).toBe("slot 16");
  });
});

describe("occupantName", () => {
  it("labels a slot the ears made themselves", () => {
    expect(occupantName({ index: 3, entry: { index: 3, animationId: null, name: "Blink" } })).toBe(
      "Blink (made on the ears)",
    );
  });

  it("is just the name for anything the web app uploaded", () => {
    expect(
      occupantName({ index: 1, entry: { index: 1, animationId: OTHER_ID, name: "Blink" } }),
    ).toBe("Blink");
  });
});

describe("dialogView", () => {
  it("saves into an empty slot with no warning", () => {
    expect(view(0)).toMatchObject({
      confirmLabel: "Save to slot 1",
      overwriteWarning: null,
      canConfirm: true,
    });
  });

  it("names the occupant inline and says the button will replace it", () => {
    const chosen = view(1);

    expect(chosen.confirmLabel).toBe("Replace slot 2");
    expect(chosen.overwriteWarning).toContain("Something else");
    expect(chosen.overwriteWarning).toContain("no undo");
    expect(chosen.canConfirm).toBe(true);
  });

  it("promises no undo, because STORE is atomic and unconditional", () => {
    expect(view(1).overwriteWarning).not.toContain("undone");
  });

  it("says when the occupant is this same animation", () => {
    expect(view(2).overwriteWarning).toContain("already holds this animation");
  });

  it("labels a slot the ears made themselves", () => {
    expect(view(3).overwriteWarning).toContain("made on the ears");
  });

  it("cannot confirm with no slot chosen", () => {
    expect(view(undefined)).toMatchObject({ confirmLabel: "Choose a slot", canConfirm: false });
  });

  it("counts the name in bytes, not characters", () => {
    expect(view(0, "😺").nameBytes).toBe(4);
  });

  it("refuses a name past the device's 32 bytes and says how far past", () => {
    const chosen = view(0, "a".repeat(40));

    expect(chosen.canConfirm).toBe(false);
    expect(chosen.nameProblem).toContain("40");
    expect(chosen.nameProblem).toContain("32");
  });

  it("refuses a blank name rather than letting the ears nack it", () => {
    expect(view(0, "   ").canConfirm).toBe(false);
  });
});
