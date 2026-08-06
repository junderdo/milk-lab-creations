import { defineConfig } from "vitest/config";

/**
 * Standalone rather than folded into vite.config.ts: vitest 3 carries vite 7
 * types while the app builds on vite 8, and composing the two makes the
 * SvelteKit plugin array unassignable. Keeping them apart sidesteps that, and
 * costs nothing while the suite is pure logic — the interpolator is numeric
 * code with no DOM and no WebGL. Testing components will mean revisiting this.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
