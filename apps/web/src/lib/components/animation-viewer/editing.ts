/**
 * The seam between the 3D viewer and the editor for in-3D editing (spec §3.2).
 *
 * The viewer owns picking, hover, selection and ring gestures; the editor owns
 * the document. What crosses the seam is raw gesture facts — a drag started, a
 * channel wants this angle, the pointer was released — so the auto-key rule
 * and undo granularity stay in the screen next to every other edit path.
 *
 * Absent everywhere but the editor: the detail-page viewer never passes it.
 */
export interface ViewerEditing {
  /** The servo range, for the arc sweep and the per-move clamp. */
  maxAngle: number;
  /**
   * False when a drag would need to auto-key and the robot is at its keyframe
   * cap — rings stop starting drags, the same way the timeline's add
   * affordance disables.
   */
  canEditAngles: boolean;
  /** A ring was grabbed. The editor pauses playback before the first move. */
  ondragstart: () => void;
  /** The drag wants this angle — per move, raw degrees; the document clamps. */
  onangle: (channel: number, angle: number) => void;
  /** The drag was released: close the undo step. */
  oncommit: () => void;
  /** Ear selection changed — the channels to highlight, or null for none. */
  onselect: (channels: number[] | null) => void;
}
