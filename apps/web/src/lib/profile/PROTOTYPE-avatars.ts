/**
 * PROTOTYPE — throwaway, prototype/profile-and-registration.
 *
 * Eight colourways drawn inline instead of the eight SVG asset files spec §1
 * calls for: the art direction is an open product question, and the prototype
 * only needs "eight distinguishable things in a picker".
 */

export const PRESET_KEYS = [
  "cat-01",
  "cat-02",
  "cat-03",
  "cat-04",
  "cat-05",
  "cat-06",
  "cat-07",
  "cat-08",
] as const;

export type PresetKey = (typeof PRESET_KEYS)[number];

interface Colourway {
  readonly name: string;
  readonly fur: string;
  readonly inner: string;
  readonly eye: string;
  readonly bg: string;
}

export const PRESETS: Record<PresetKey, Colourway> = {
  "cat-01": { name: "Milk", fur: "#f8fafc", inner: "#fbcfe8", eye: "#0f172a", bg: "#e2e8f0" },
  "cat-02": { name: "Soot", fur: "#334155", inner: "#7dd3fc", eye: "#fde047", bg: "#0f172a" },
  "cat-03": { name: "Marmalade", fur: "#fb923c", inner: "#fed7aa", eye: "#166534", bg: "#7c2d12" },
  "cat-04": { name: "Matcha", fur: "#86efac", inner: "#ecfccb", eye: "#14532d", bg: "#14532d" },
  "cat-05": { name: "Blueberry", fur: "#818cf8", inner: "#c7d2fe", eye: "#1e1b4b", bg: "#312e81" },
  "cat-06": { name: "Cocoa", fur: "#78350f", inner: "#d6a77a", eye: "#fef3c7", bg: "#451a03" },
  "cat-07": { name: "Bubblegum", fur: "#f472b6", inner: "#fbcfe8", eye: "#500724", bg: "#831843" },
  "cat-08": { name: "Static", fur: "#a3a3a3", inner: "#e5e5e5", eye: "#171717", bg: "#404040" },
};

/**
 * Spec §1: there is no "no avatar" state. NULL is absorbed here, never rendered
 * as an empty slot.
 */
export function avatarOf(token: string | null, userId: string): PresetKey {
  const key = token?.startsWith("preset:") ? token.slice("preset:".length) : null;
  if (key && (PRESET_KEYS as readonly string[]).includes(key)) return key as PresetKey;
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) % 100000;
  return PRESET_KEYS[hash % PRESET_KEYS.length]!;
}

export function avatarSvg(key: PresetKey): string {
  const { fur, inner, eye, bg } = PRESETS[key];
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="presentation">
    <rect width="64" height="64" rx="32" fill="${bg}" />
    <path d="M16 30 L14 12 L28 22 Z" fill="${fur}" />
    <path d="M18 27 L17 17 L26 23 Z" fill="${inner}" />
    <path d="M48 30 L50 12 L36 22 Z" fill="${fur}" />
    <path d="M46 27 L47 17 L38 23 Z" fill="${inner}" />
    <circle cx="32" cy="38" r="17" fill="${fur}" />
    <circle cx="26" cy="36" r="2.6" fill="${eye}" />
    <circle cx="38" cy="36" r="2.6" fill="${eye}" />
    <path d="M29 44 Q32 47 35 44" stroke="${eye}" stroke-width="1.8" fill="none" stroke-linecap="round" />
  </svg>`;
}
