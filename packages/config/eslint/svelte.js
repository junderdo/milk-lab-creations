import globals from "globals";
import svelte from "eslint-plugin-svelte";
import tseslint from "typescript-eslint";
import base from "./base.js";

export default [
  ...base,
  ...svelte.configs["flat/recommended"],
  ...svelte.configs["flat/prettier"],
  {
    // This preset is for web apps: `window`, `matchMedia`, `requestAnimationFrame`
    // and friends are ambient. SSR-only code still has to browser-gate itself —
    // that's a SvelteKit concern, not something `no-undef` can catch.
    languageOptions: { globals: globals.browser },
  },
  {
    // svelte-eslint-parser hands <script> contents to a sub-parser; without
    // this it uses espree and chokes on TS syntax inside `<script lang="ts">`.
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
];
