/**
 * Which of the two palettes the UI is painted in, and how that choice survives
 * a reload.
 *
 * The choice is device-local, not account-level: it belongs to the screen being
 * looked at, so a phone and a desktop can disagree and neither needs a session.
 * That makes `localStorage` the whole persistence layer, and every call to it is
 * wrapped — a private window or a blocked origin costs the preference, never a
 * render.
 *
 * Dark is the default, so an unreadable or absent value means dark. Tailwind is
 * configured for class-based dark mode (`app.css`), so applying a theme is one
 * class on the document element.
 */

export type Theme = "light" | "dark";

export const DEFAULT_THEME: Theme = "dark";

/** Also read by the inline script in `app.html`; the two must not drift. */
export const THEME_STORAGE_KEY = "milklab:theme";

const DARK_CLASS = "dark";

/** The slice of `Storage` a theme needs — the seam tests substitute. */
export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The slice of an `Element` a theme touches. */
export interface ThemeRoot {
  classList: { add(name: string): void; remove(name: string): void };
}

function isTheme(value: string): value is Theme {
  return value === "light" || value === "dark";
}

/**
 * A theme out of a stored string.
 *
 * A boundary parse rather than a cast: what comes back is whatever an older
 * build of this app — or a devtools console — left behind.
 */
export function themeFrom(raw: string | null): Theme {
  return raw !== null && isTheme(raw) ? raw : DEFAULT_THEME;
}

export function readTheme(storage: ThemeStorage): Theme {
  try {
    return themeFrom(storage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

export function writeTheme(storage: ThemeStorage, theme: Theme): void {
  try {
    storage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // a blocked origin costs the preference for next visit, not this one
  }
}

/** What the toggle switches to. */
export function otherTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

export function applyTheme(root: ThemeRoot, theme: Theme): void {
  if (theme === "dark") root.classList.add(DARK_CLASS);
  else root.classList.remove(DARK_CLASS);
}

/** `localStorage`, or a stand-in when the browser refuses to hand it over. */
export function localThemeStorage(): ThemeStorage {
  try {
    // absent during SSR, and an access that throws outright on a blocked origin
    if (globalThis.localStorage !== undefined) return globalThis.localStorage;
  } catch {
    // an access that throws outright on a blocked origin
  }
  return { getItem: () => null, setItem: () => {} };
}
