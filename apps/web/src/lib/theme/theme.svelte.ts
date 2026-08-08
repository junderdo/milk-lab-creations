/**
 * The one live theme, as reactive state.
 *
 * Mutable and side-effecting, unlike `theme.ts`: it owns the class on the
 * document element and the slot in storage, both of which are singular by
 * nature. Components read `theme.current` and call `theme.toggle()`; nothing else
 * touches the class.
 *
 * Read at module load rather than in an effect, so the first render — including
 * the toggle's own icon and label — already agrees with what the inline script
 * in `app.html` painted. On the server there is no storage to read and the
 * default stands.
 *
 * Only an explicit choice is stored. A visitor who has never picked keeps
 * following the default, which leaves it something we can still change.
 */

import {
  applyTheme,
  localThemeStorage,
  otherTheme,
  readTheme,
  writeTheme,
  type Theme,
} from "./theme";

function createThemeController() {
  const storage = localThemeStorage();
  let current = $state<Theme>(readTheme(storage));

  function choose(next: Theme): void {
    current = next;
    writeTheme(storage, next);
    if (typeof document !== "undefined") applyTheme(document.documentElement, next);
  }

  return {
    get current(): Theme {
      return current;
    },
    toggle: () => {
      choose(otherTheme(current));
    },
  };
}

export const theme = createThemeController();
