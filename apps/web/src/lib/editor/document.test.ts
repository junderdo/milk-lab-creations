import { describe, expect, it } from "vitest";
import type { Keyframe } from "../animation/interpolator";
import {
  addKeyframeAt,
  documentFromRecord,
  documentsEqual,
  insertionIndexFor,
  keyframesOf,
  easeTypesFor,
  limitsFor,
  createInputFor,
  newDocument,
  removeKeyframe,
  revealOf,
  setAngle,
  setDescription,
  setEase,
  setName,
  setTime,
  updateInputFor,
  type EditorDocument,
} from "./document";

const limits = limitsFor("robo-cat-ears");
if (limits === undefined) throw new Error("robo-cat-ears must have a validation profile");

function frame(timeMs: number, angles: number[]): Keyframe {
  return { timeMs, angles, easeInType: 1, easeOutType: 1, easeInMs: 150, easeOutMs: 150 };
}

function docOf(...keyframes: Keyframe[]): EditorDocument {
  return {
    name: "Ear wiggle",
    description: "",
    payload: { schemaVersion: 1, keyframes },
  };
}

const doc = docOf(
  frame(0, [90, 90, 90, 90]),
  frame(500, [40, 80, 140, 100]),
  frame(1000, [90, 90, 90, 90]),
);

describe("limitsFor", () => {
  it("reads the robot's profile rather than assuming robo-cat-ears", () => {
    expect(limits).toEqual({
      channels: 4,
      maxKeyframes: 64,
      maxAngle: 180,
      maxTimeMs: 65535,
      maxEaseType: 3,
    });
  });

  it("offers only the ease curves the robot's firmware knows", () => {
    expect(easeTypesFor(limits)).toEqual([0, 1, 2, 3]);
    expect(easeTypesFor({ ...limits, maxEaseType: 1 })).toEqual([0, 1]);
  });

  it("has nothing to offer for a robot with no profile, and says so", () => {
    // a robot can arrive by migration before ROBOT_PROFILES knows it; guessing
    // its limits would build documents the server then rejects
    expect(limitsFor("robo-tentacles")).toBeUndefined();
    expect(limitsFor(undefined)).toBeUndefined();
  });
});

describe("documentFromRecord", () => {
  it("normalises a null description to the empty string the inputs bind to", () => {
    const document = documentFromRecord({
      name: "Wiggle",
      description: null,
      payload: { schemaVersion: 1, keyframes: [frame(0, [90, 90, 90, 90])] },
    });
    expect(document.description).toBe("");
  });

  it("parses the payload at the boundary instead of trusting its shape", () => {
    const document = documentFromRecord({
      name: "Wiggle",
      description: null,
      payload: { keyframes: [{ timeMs: 0, angles: [90, 90, 90, 90] }, "rubbish"] },
    });
    expect(keyframesOf(document)).toEqual([
      {
        timeMs: 0,
        angles: [90, 90, 90, 90],
        easeInType: 0,
        easeOutType: 0,
        easeInMs: 0,
        easeOutMs: 0,
      },
    ]);
  });
});

describe("documentsEqual", () => {
  it("is true for separately built copies of the same document", () => {
    expect(documentsEqual(doc, docOf(...keyframesOf(doc).map((k) => ({ ...k }))))).toBe(true);
  });

  it("notices a name, description, angle, time and ease change alike", () => {
    expect(documentsEqual(doc, setName(doc, "Other"))).toBe(false);
    expect(documentsEqual(doc, setDescription(doc, "note"))).toBe(false);
    expect(documentsEqual(doc, setAngle(doc, limits, 1, 0, 41))).toBe(false);
    expect(documentsEqual(doc, setTime(doc, limits, 1, 501))).toBe(false);
    expect(documentsEqual(doc, setEase(doc, limits, 1, { easeInType: 2 }))).toBe(false);
  });

  it("notices a keyframe added or removed", () => {
    expect(documentsEqual(doc, removeKeyframe(doc, 1))).toBe(false);
    expect(documentsEqual(doc, addKeyframeAt(doc, limits, 750))).toBe(false);
  });
});

describe("edits never mutate the document they are given", () => {
  it("leaves the original untouched", () => {
    const before = structuredClone(doc);
    setAngle(doc, limits, 0, 0, 12);
    setTime(doc, limits, 1, 600);
    setEase(doc, limits, 0, { easeOutMs: 40 });
    addKeyframeAt(doc, limits, 250);
    removeKeyframe(doc, 0);
    expect(doc).toEqual(before);
  });
});

describe("setName / setDescription", () => {
  it("clamps to the lengths the API accepts", () => {
    expect(setName(doc, "x".repeat(140)).name).toHaveLength(100);
    expect(setDescription(doc, "y".repeat(1200)).description).toHaveLength(1000);
  });
});

describe("setAngle", () => {
  it("clamps to the robot's angle range and rounds to an integer", () => {
    expect(keyframesOf(setAngle(doc, limits, 1, 0, -30))[1]?.angles[0]).toBe(0);
    expect(keyframesOf(setAngle(doc, limits, 1, 0, 400))[1]?.angles[0]).toBe(180);
    expect(keyframesOf(setAngle(doc, limits, 1, 0, 41.7))[1]?.angles[0]).toBe(42);
  });

  it("ignores a channel the robot does not have", () => {
    expect(setAngle(doc, limits, 1, 9, 100)).toBe(doc);
  });

  it("ignores a keyframe index that is not there", () => {
    expect(setAngle(doc, limits, 7, 0, 100)).toBe(doc);
  });
});

describe("setTime", () => {
  it("clamps between the neighbouring columns so the order can never change", () => {
    expect(keyframesOf(setTime(doc, limits, 1, 4000))[1]?.timeMs).toBe(1000);
    expect(keyframesOf(setTime(doc, limits, 1, -200))[1]?.timeMs).toBe(0);
  });

  it("clamps the first column at zero and the last at the uint16 ceiling", () => {
    expect(keyframesOf(setTime(doc, limits, 0, -50))[0]?.timeMs).toBe(0);
    expect(keyframesOf(setTime(doc, limits, 2, 99_999))[2]?.timeMs).toBe(65535);
  });
});

describe("setEase", () => {
  it("patches only the named fields of one column", () => {
    const eased = keyframesOf(setEase(doc, limits, 1, { easeInType: 3, easeOutMs: 20 }))[1];
    expect(eased).toMatchObject({ easeInType: 3, easeOutMs: 20, easeOutType: 1, easeInMs: 150 });
  });

  it("drops an ease type the robot's firmware does not have", () => {
    const simple = { ...limits, maxEaseType: 1 };
    expect(keyframesOf(setEase(doc, simple, 1, { easeInType: 3 }))[1]?.easeInType).toBe(1);
    expect(keyframesOf(setEase(doc, simple, 1, { easeInType: 0 }))[1]?.easeInType).toBe(0);
  });

  it("clamps ease windows to the uint16 range", () => {
    expect(keyframesOf(setEase(doc, limits, 1, { easeInMs: -5 }))[1]?.easeInMs).toBe(0);
    expect(keyframesOf(setEase(doc, limits, 1, { easeOutMs: 90_000 }))[1]?.easeOutMs).toBe(65535);
  });
});

describe("addKeyframeAt", () => {
  it("inserts in time order with the pose sampled at that instant", () => {
    const added = keyframesOf(addKeyframeAt(doc, limits, 500));
    expect(added.map((k) => k.timeMs)).toEqual([0, 500, 500, 1000]);
    // the inserted column matches what was already being played there, so
    // adding a keyframe never changes the motion
    expect(added[2]?.angles).toEqual([40, 80, 140, 100]);
  });

  it("appends past the end and reports where the column landed", () => {
    expect(insertionIndexFor(keyframesOf(doc), 1500)).toBe(3);
    expect(keyframesOf(addKeyframeAt(doc, limits, 1500)).map((k) => k.timeMs)).toEqual([
      0, 500, 1000, 1500,
    ]);
  });

  it("refuses to go past the robot's keyframe ceiling", () => {
    const full = docOf(
      ...Array.from({ length: 64 }, (_unused, i) => frame(i * 10, [90, 90, 90, 90])),
    );
    expect(addKeyframeAt(full, limits, 5)).toBe(full);
  });
});

describe("removeKeyframe", () => {
  it("drops the column", () => {
    expect(keyframesOf(removeKeyframe(doc, 1)).map((k) => k.timeMs)).toEqual([0, 1000]);
  });

  it("keeps the last keyframe — a payload with none is invalid", () => {
    const single = docOf(frame(0, [90, 90, 90, 90]));
    expect(removeKeyframe(single, 0)).toBe(single);
  });
});

describe("revealOf", () => {
  it("points at the column an angle change landed on", () => {
    expect(revealOf(doc, setAngle(doc, limits, 1, 2, 30))).toEqual({
      kind: "keyframe",
      index: 1,
      timeMs: 500,
    });
  });

  it("follows a retimed column to where it now sits", () => {
    expect(revealOf(doc, setTime(doc, limits, 1, 700))).toEqual({
      kind: "keyframe",
      index: 1,
      timeMs: 700,
    });
  });

  it("points at an inserted column", () => {
    expect(revealOf(doc, addKeyframeAt(doc, limits, 250))).toEqual({
      kind: "keyframe",
      index: 1,
      timeMs: 250,
    });
  });

  it("points at what took a deleted column's place, never off the end", () => {
    expect(revealOf(doc, removeKeyframe(doc, 2))).toEqual({
      kind: "keyframe",
      index: 1,
      timeMs: 500,
    });
  });

  it("names the field when the change was text, not motion", () => {
    expect(revealOf(doc, setName(doc, "Other"))).toEqual({ kind: "field", field: "name" });
    expect(revealOf(doc, setDescription(doc, "words"))).toEqual({
      kind: "field",
      field: "description",
    });
  });

  it("has nothing to reveal when the documents match", () => {
    expect(revealOf(doc, doc)).toBeNull();
  });

  it("prefers the motion change when text and keyframes both moved", () => {
    const both = setName(setAngle(doc, limits, 2, 0, 10), "Other");
    expect(revealOf(doc, both)).toEqual({ kind: "keyframe", index: 2, timeMs: 1000 });
  });
});

describe("updateInputFor", () => {
  it("sends the trimmed document plus the guard the server compares", () => {
    const at = new Date("2026-08-05T12:00:00.000Z");
    expect(
      updateInputFor("anim-1", { document: setName(doc, "  Wiggle  "), expectedUpdatedAt: at }),
    ).toEqual({
      id: "anim-1",
      name: "Wiggle",
      description: null,
      payload: { schemaVersion: 1, keyframes: keyframesOf(doc) },
      expectedUpdatedAt: at,
    });
  });

  it("omits the guard entirely when the caller has chosen to overwrite", () => {
    const input = updateInputFor("anim-1", { document: doc, expectedUpdatedAt: null });
    expect("expectedUpdatedAt" in input).toBe(false);
  });
});

describe("newDocument", () => {
  const fresh = newDocument(limits);

  it("is nameless, so the first thing asked of the author is what to call it", () => {
    expect(fresh.name).toBe("");
    expect(fresh.description).toBe("");
  });

  it("opens on two neutral columns — a curve to drag, not an empty canvas", () => {
    expect(keyframesOf(fresh)).toEqual([
      frame(0, [90, 90, 90, 90]),
      frame(1000, [90, 90, 90, 90]),
    ]);
  });

  it("takes its neutral pose and channel count from the robot, never robo-cat-ears", () => {
    const twoChannel = newDocument({ ...limits, channels: 2, maxAngle: 100 });
    expect(keyframesOf(twoChannel).map((each) => each.angles)).toEqual([
      [50, 50],
      [50, 50],
    ]);
  });

  it("is comparable to itself, so an untouched new editor reads as clean", () => {
    expect(documentsEqual(fresh, newDocument(limits))).toBe(true);
  });
});

describe("createInputFor", () => {
  it("names the robot and sends the trimmed document, with no guard to send", () => {
    expect(
      createInputFor("robo-cat-ears", {
        document: setDescription(setName(doc, "  Wiggle  "), "  ears  "),
        expectedUpdatedAt: null,
      }),
    ).toEqual({
      robotSlug: "robo-cat-ears",
      name: "Wiggle",
      description: "ears",
      payload: { schemaVersion: 1, keyframes: keyframesOf(doc) },
    });
  });

  it("sends no description rather than an empty one", () => {
    expect(
      createInputFor("robo-cat-ears", { document: doc, expectedUpdatedAt: null }).description,
    ).toBeUndefined();
  });
});
