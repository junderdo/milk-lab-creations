/**
 * The theme as it survives a reload: what a stored value means, what an absent
 * or corrupt one falls back to, and what ends up on the root element.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  applyTheme,
  otherTheme,
  readTheme,
  themeFrom,
  writeTheme,
  type ThemeStorage,
} from "./theme";

/** A `localStorage` stand-in that can be told to fail the way a blocked origin does. */
function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  let failing = false;
  const refuse = () => {
    if (failing) throw new Error("SecurityError");
  };
  return {
    items,
    fail() {
      failing = true;
    },
    getItem(key: string) {
      refuse();
      return items.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      refuse();
      items.set(key, value);
    },
  } satisfies ThemeStorage & Record<string, unknown>;
}

/** The slice of an element `applyTheme` touches, as a spy. */
function fakeRoot(initial: string[] = []) {
  const classes = new Set(initial);
  return {
    classes,
    classList: {
      add: (name: string) => void classes.add(name),
      remove: (name: string) => void classes.delete(name),
    },
  };
}

describe("themeFrom", () => {
  it("reads the two themes it writes", () => {
    expect(themeFrom("light")).toBe("light");
    expect(themeFrom("dark")).toBe("dark");
  });

  it("falls back to the default for anything else", () => {
    expect(themeFrom(null)).toBe(DEFAULT_THEME);
    expect(themeFrom("")).toBe(DEFAULT_THEME);
    expect(themeFrom("DARK")).toBe(DEFAULT_THEME);
    expect(themeFrom("solarized")).toBe(DEFAULT_THEME);
  });
});

describe("the default", () => {
  it("is dark", () => {
    expect(DEFAULT_THEME).toBe("dark");
  });
});

describe("readTheme", () => {
  it("is the default for a first-time visitor", () => {
    expect(readTheme(fakeStorage())).toBe(DEFAULT_THEME);
  });

  it("is what was last written", () => {
    const storage = fakeStorage();
    writeTheme(storage, "light");
    expect(readTheme(storage)).toBe("light");
  });

  it("is the default when storage refuses to answer", () => {
    const storage = fakeStorage({ [THEME_STORAGE_KEY]: "light" });
    storage.fail();
    expect(readTheme(storage)).toBe(DEFAULT_THEME);
  });
});

describe("writeTheme", () => {
  it("survives a storage that throws", () => {
    const storage = fakeStorage();
    storage.fail();
    expect(() => {
      writeTheme(storage, "light");
    }).not.toThrow();
  });
});

describe("otherTheme", () => {
  it("is what the toggle switches to", () => {
    expect(otherTheme("dark")).toBe("light");
    expect(otherTheme("light")).toBe("dark");
  });
});

/**
 * The inline script that beats first paint can't import this module, so it
 * repeats the key and the default. This is what notices when they drift.
 */
describe("the no-flash script in app.html", () => {
  const html = readFileSync(new URL("../../app.html", import.meta.url), "utf8");

  it("reads the key this module writes", () => {
    expect(html).toContain(`localStorage.getItem("${THEME_STORAGE_KEY}")`);
  });

  it("falls back to the same default", () => {
    expect(html).toContain(`!== "${otherTheme(DEFAULT_THEME)}"`);
  });
});

describe("applyTheme", () => {
  it("marks the root dark", () => {
    const root = fakeRoot();
    applyTheme(root, "dark");
    expect(root.classes.has("dark")).toBe(true);
  });

  it("unmarks it for light", () => {
    const root = fakeRoot(["dark"]);
    applyTheme(root, "light");
    expect(root.classes.has("dark")).toBe(false);
  });

  it("leaves other classes alone", () => {
    const root = fakeRoot(["hydrated"]);
    applyTheme(root, "dark");
    applyTheme(root, "light");
    expect([...root.classes]).toEqual(["hydrated"]);
  });
});
