/**
 * How a channel looks, wherever its curve is drawn.
 *
 * Curves overlap constantly — four servos crossing the same 0–180 axis — so
 * hue is the only thing separating them, and the sparkline on a card and the
 * curve in the editor have to agree or the card stops being a preview of the
 * thing you are about to edit. Hence one list, read by both.
 *
 * Classes are written out in full rather than composed from a hue: Tailwind
 * scans source text, and a class built at runtime is a class that never ships.
 */

export interface ChannelStyle {
  /** The curve itself. */
  stroke: string;
  /** Dots, chips and readouts — the same hue as the curve. */
  text: string;
  border: string;
}

/**
 * Indexed by channel. Each pair is tuned light/dark rather than one colour that
 * washes out in one theme.
 */
export const CHANNEL_STYLES: ChannelStyle[] = [
  {
    stroke: "stroke-sky-600 dark:stroke-sky-400",
    text: "text-sky-600 dark:text-sky-400",
    border: "border-sky-600 dark:border-sky-400",
  },
  {
    stroke: "stroke-violet-600 dark:stroke-violet-400",
    text: "text-violet-600 dark:text-violet-400",
    border: "border-violet-600 dark:border-violet-400",
  },
  {
    stroke: "stroke-amber-600 dark:stroke-amber-400",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-600 dark:border-amber-400",
  },
  {
    stroke: "stroke-emerald-600 dark:stroke-emerald-400",
    text: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-600 dark:border-emerald-400",
  },
];

/** Wraps rather than running out: a robot with more channels than hues repeats. */
export function styleFor(channel: number): ChannelStyle {
  const style = CHANNEL_STYLES[channel % CHANNEL_STYLES.length];
  if (style === undefined) throw new Error("CHANNEL_STYLES must not be empty");
  return style;
}

/**
 * The same hues as hex, for three.js materials the Tailwind classes can't
 * reach. Kept beside CHANNEL_STYLES so the ring around an ear and the curve in
 * the timeline cannot drift apart: sky/violet/amber/emerald, 600s on the light
 * canvas, 400s on the dark one.
 */
const CHANNEL_HEX: { light: string; dark: string }[] = [
  { light: "#0284c7", dark: "#38bdf8" },
  { light: "#7c3aed", dark: "#a78bfa" },
  { light: "#d97706", dark: "#fbbf24" },
  { light: "#059669", dark: "#34d399" },
];

export function hexFor(channel: number, dark: boolean): string {
  const hex = CHANNEL_HEX[channel % CHANNEL_HEX.length];
  if (hex === undefined) throw new Error("CHANNEL_HEX must not be empty");
  return dark ? hex.dark : hex.light;
}
