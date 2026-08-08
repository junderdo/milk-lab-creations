/**
 * The thing an editor session edits, and the only ways to change it.
 *
 * The document is `{ name, description, payload }` — exactly what
 * `animations.update` accepts — so saving is a straight handover rather than a
 * translation step, and "has this changed?" is one comparison of two documents.
 *
 * Every function here is pure: it takes a document and returns a new one,
 * never mutating its argument. That is what makes dirty tracking a snapshot
 * comparison (and, in later tickets, what makes an undo stack a list of these
 * values). It is also why the whole module is testable without a DOM.
 *
 * Validity is maintained by construction. Angles clamp to the robot's range,
 * retiming clamps between neighbouring columns so the order can never invert,
 * ease windows clamp to uint16, and the keyframe ceiling refuses the insert
 * rather than producing a document the server would reject. There is no
 * "invalid document" state for the UI to message.
 */

import { DESCRIPTION_MAX, MAX_TIME_MS, NAME_MAX, ROBOT_PROFILES } from "@milklab/api/limits";
import { sample, type EaseType, type Keyframe } from "../animation/interpolator";
import { keyframesFromPayload } from "../animation/payload";

// The same numbers `nameSchema` / `descriptionSchema` enforce server-side, so
// the inputs cannot produce a document the API would reject.
export { DESCRIPTION_MAX, NAME_MAX };

/** Which robot an animation drives — fixed at creation, never edited. */
export interface EditorRobot {
  slug: string;
  name: string;
}

/** What the editor needs to keep a document inside the robot's contract. */
export interface RobotLimits {
  channels: number;
  maxKeyframes: number;
  maxAngle: number;
  maxTimeMs: number;
  /** Highest ease type this robot's firmware understands. */
  maxEaseType: number;
}

/**
 * The robot's limits, or `undefined` for a robot with no validation profile.
 *
 * A robot arrives by migration and could in principle exist in the database
 * before `ROBOT_PROFILES` knows it. Guessing its limits would mean building
 * documents the server then rejects, so the absence is in the type and the
 * caller decides what to show.
 */
export function limitsFor(robotSlug: string | undefined): RobotLimits | undefined {
  const profile = robotSlug === undefined ? undefined : ROBOT_PROFILES[robotSlug];
  if (profile === undefined) return undefined;
  return {
    channels: profile.channels,
    maxKeyframes: profile.maxKeyframes,
    maxAngle: profile.maxAngle,
    maxTimeMs: MAX_TIME_MS,
    maxEaseType: profile.maxEaseType,
  };
}

/** The ease types this robot accepts — what the popover is allowed to offer. */
export function easeTypesFor(limits: RobotLimits): EaseType[] {
  const all: EaseType[] = [0, 1, 2, 3];
  return all.filter((type) => type <= limits.maxEaseType);
}

export interface EditorPayload {
  schemaVersion: 1;
  keyframes: Keyframe[];
}

export interface EditorDocument {
  name: string;
  description: string;
  payload: EditorPayload;
}

/** The fields of an animation record a document is built from. */
export interface DocumentSource {
  name: string;
  description: string | null;
  payload: unknown;
}

export function keyframesOf(document: EditorDocument): Keyframe[] {
  return document.payload.keyframes;
}

/**
 * A document from an API record.
 *
 * `description` is normalised to `""` because that is what a bound `<input>`
 * holds; `updateInputFor` puts the `null` back. Without that, opening an
 * animation with no description and typing nothing would read as an edit.
 */
export function documentFromRecord(record: DocumentSource): EditorDocument {
  return {
    name: record.name,
    description: record.description ?? "",
    payload: { schemaVersion: 1, keyframes: keyframesFromPayload(record.payload) },
  };
}

function keyframesEqual(a: Keyframe, b: Keyframe): boolean {
  return (
    a.timeMs === b.timeMs &&
    a.easeInType === b.easeInType &&
    a.easeOutType === b.easeOutType &&
    a.easeInMs === b.easeInMs &&
    a.easeOutMs === b.easeOutMs &&
    a.angles.length === b.angles.length &&
    a.angles.every((angle, channel) => angle === b.angles[channel])
  );
}

/**
 * Deep comparison of two documents — the definition of "dirty".
 *
 * Spelled out field by field rather than reached for generically: the shape is
 * small and closed, and a structural comparison that silently starts ignoring
 * a field added later is exactly the bug that makes a save button lie.
 */
export function documentsEqual(a: EditorDocument, b: EditorDocument): boolean {
  if (a.name !== b.name || a.description !== b.description) return false;
  const left = keyframesOf(a);
  const right = keyframesOf(b);
  return (
    left.length === right.length &&
    left.every((frame, index) => {
      const other = right[index];
      return other !== undefined && keyframesEqual(frame, other);
    })
  );
}

/**
 * Where a change between two documents happened — what undo should show.
 *
 * Undo that silently rewrites something off-screen is undo the user cannot
 * trust, so every step can say where it landed. This is a diff rather than
 * something recorded alongside the step because it has to work in both
 * directions: the same function tells redo where to look.
 */
export type Reveal =
  | { kind: "keyframe"; index: number; timeMs: number }
  | { kind: "field"; field: "name" | "description" }
  | null;

export function revealOf(from: EditorDocument, to: EditorDocument): Reveal {
  const before = keyframesOf(from);
  const after = keyframesOf(to);
  const at = after.findIndex((frame, index) => {
    const other = before[index];
    return other === undefined || !keyframesEqual(frame, other);
  });

  const changed = at === -1 ? undefined : after[at];
  if (changed !== undefined) return { kind: "keyframe", index: at, timeMs: changed.timeMs };

  // a column was deleted off the end: reveal what is now last, not the gap
  const lastIndex = after.length - 1;
  const last = after[lastIndex];
  if (after.length < before.length && last !== undefined) {
    return { kind: "keyframe", index: lastIndex, timeMs: last.timeMs };
  }
  if (from.name !== to.name) return { kind: "field", field: "name" };
  if (from.description !== to.description) return { kind: "field", field: "description" };
  return null;
}

function withKeyframes(document: EditorDocument, keyframes: Keyframe[]): EditorDocument {
  return { ...document, payload: { ...document.payload, keyframes } };
}

/** Replace one column, leaving every other keyframe object untouched. */
function withKeyframeAt(
  document: EditorDocument,
  index: number,
  change: (frame: Keyframe) => Keyframe,
): EditorDocument {
  const keyframes = keyframesOf(document);
  const frame = keyframes[index];
  if (frame === undefined) return document; // a stale index from a released drag
  return withKeyframes(
    document,
    keyframes.map((existing, at) => (at === index ? change(existing) : existing)),
  );
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function setName(document: EditorDocument, name: string): EditorDocument {
  return { ...document, name: name.slice(0, NAME_MAX) };
}

export function setDescription(document: EditorDocument, description: string): EditorDocument {
  return { ...document, description: description.slice(0, DESCRIPTION_MAX) };
}

/** Set one channel of one column. Angles are integer degrees in the rig's range. */
export function setAngle(
  document: EditorDocument,
  limits: RobotLimits,
  index: number,
  channel: number,
  angle: number,
): EditorDocument {
  if (channel < 0 || channel >= limits.channels) return document;
  const next = Math.round(clamp(angle, 0, limits.maxAngle));
  return withKeyframeAt(document, index, (frame) => ({
    ...frame,
    angles: frame.angles.map((existing, at) => (at === channel ? next : existing)),
  }));
}

/**
 * Retime a column, clamped between its neighbours.
 *
 * The clamp is what keeps keyframe times non-decreasing without any reordering
 * step: a column can be dragged onto a neighbour but never through it, so
 * indices stay stable for the duration of a drag.
 */
export function setTime(
  document: EditorDocument,
  limits: RobotLimits,
  index: number,
  timeMs: number,
): EditorDocument {
  const keyframes = keyframesOf(document);
  const low = keyframes[index - 1]?.timeMs ?? 0;
  const high = keyframes[index + 1]?.timeMs ?? limits.maxTimeMs;
  const next = Math.round(clamp(timeMs, low, high));
  return withKeyframeAt(document, index, (frame) => ({ ...frame, timeMs: next }));
}

export interface EasePatch {
  easeInType?: EaseType;
  easeOutType?: EaseType;
  easeInMs?: number;
  easeOutMs?: number;
}

export function setEase(
  document: EditorDocument,
  limits: RobotLimits,
  index: number,
  patch: EasePatch,
): EditorDocument {
  const window = (ms: number | undefined, current: number) =>
    ms === undefined ? current : Math.round(clamp(ms, 0, limits.maxTimeMs));
  // an ease type this robot's firmware doesn't know is not a curve it would
  // play — the patch is dropped rather than written and rejected on save
  const type = (next: EaseType | undefined, current: EaseType) =>
    next === undefined || next > limits.maxEaseType ? current : next;
  return withKeyframeAt(document, index, (frame) => ({
    ...frame,
    easeInType: type(patch.easeInType, frame.easeInType),
    easeOutType: type(patch.easeOutType, frame.easeOutType),
    easeInMs: window(patch.easeInMs, frame.easeInMs),
    easeOutMs: window(patch.easeOutMs, frame.easeOutMs),
  }));
}

/** Where a column at `timeMs` sits once inserted — also where to select. */
export function insertionIndexFor(keyframes: Keyframe[], timeMs: number): number {
  const after = keyframes.findIndex((frame) => frame.timeMs > timeMs);
  return after === -1 ? keyframes.length : after;
}

/** Ease used by a column added mid-edit: the payload's own default shape. */
const ADDED_EASE = { easeInType: 1, easeOutType: 1, easeInMs: 150, easeOutMs: 150 } as const;

/** Long enough to be a motion, short enough to be retimed in one drag. */
const NEW_DURATION_MS = 1000;

/**
 * The document `/animations/new` opens on: two motionless columns, unnamed.
 *
 * Two rather than one because a single keyframe has no duration for the canvas
 * to draw across, leaving the author nothing to grab. The pose is the midpoint
 * of the robot's range — the closest the validation profile gets to neutral,
 * which is otherwise a rig fact carried in the model's own glTF extras.
 */
export function newDocument(limits: RobotLimits): EditorDocument {
  const neutral = Array.from({ length: limits.channels }, () => Math.round(limits.maxAngle / 2));
  return {
    name: "",
    description: "",
    payload: {
      schemaVersion: 1,
      keyframes: [
        { timeMs: 0, angles: neutral, ...ADDED_EASE },
        { timeMs: NEW_DURATION_MS, angles: [...neutral], ...ADDED_EASE },
      ],
    },
  };
}

/**
 * Insert a column at `timeMs`, holding the pose the animation already has there.
 *
 * Sampling the pose rather than defaulting it means adding a keyframe changes
 * nothing about the motion until something is dragged — the keyframe is a place
 * to edit, not an edit in itself. At the robot's ceiling the document comes
 * back unchanged; the UI disables the affordance rather than relying on this.
 */
export function addKeyframeAt(
  document: EditorDocument,
  limits: RobotLimits,
  timeMs: number,
): EditorDocument {
  const keyframes = keyframesOf(document);
  if (keyframes.length >= limits.maxKeyframes || keyframes.length === 0) return document;

  const at = Math.round(clamp(timeMs, 0, limits.maxTimeMs));
  const pose = sample(keyframes, at).map((angle) => Math.round(clamp(angle, 0, limits.maxAngle)));
  const inserted: Keyframe = { timeMs: at, angles: pose, ...ADDED_EASE };

  const next = [...keyframes];
  next.splice(insertionIndexFor(keyframes, at), 0, inserted);
  return withKeyframes(document, next);
}

/** Drop a column. The last one stays: a payload needs at least one keyframe. */
export function removeKeyframe(document: EditorDocument, index: number): EditorDocument {
  const keyframes = keyframesOf(document);
  if (keyframes.length <= 1 || keyframes[index] === undefined) return document;
  return withKeyframes(
    document,
    keyframes.filter((_unused, at) => at !== index),
  );
}

/** A document and the `updatedAt` it was edited on top of — `null` to overwrite. */
export interface SaveRequest {
  document: EditorDocument;
  expectedUpdatedAt: Date | null;
}

/**
 * The document as the API takes it: trimmed to match `nameSchema` /
 * `descriptionSchema`, so what comes back is what was sent and the fresh
 * snapshot does not read as dirty.
 */
function writtenFields(document: EditorDocument) {
  const description = document.description.trim();
  return {
    name: document.name.trim(),
    description: description === "" ? null : description,
    payload: document.payload,
  };
}

export interface UpdateInput {
  id: string;
  name: string;
  description: string | null;
  payload: EditorPayload;
  expectedUpdatedAt?: Date;
}

/**
 * The `animations.update` input for a save. Omitting `expectedUpdatedAt` —
 * rather than sending `null` — is what makes the overwrite branch of a conflict
 * unguarded; the input is optional server-side.
 */
export function updateInputFor(id: string, request: SaveRequest): UpdateInput {
  return {
    id,
    ...writtenFields(request.document),
    ...(request.expectedUpdatedAt === null ? {} : { expectedUpdatedAt: request.expectedUpdatedAt }),
  };
}

export interface CreateInput {
  robotSlug: string;
  name: string;
  description?: string;
  payload: EditorPayload;
}

/**
 * The `animations.create` input for the first save of a new animation.
 *
 * There is no guard to send — nothing exists yet to be stale against — and the
 * robot comes from the route rather than the document, because which robot an
 * animation is for is fixed at creation and never edited afterwards.
 */
export function createInputFor(robotSlug: string, request: SaveRequest): CreateInput {
  const { description, ...written } = writtenFields(request.document);
  return {
    robotSlug,
    ...written,
    // omitted rather than null: `description` is optional on create
    ...(description === null ? {} : { description }),
  };
}
