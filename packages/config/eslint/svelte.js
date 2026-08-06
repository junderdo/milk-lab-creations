import svelte from "eslint-plugin-svelte";
import tseslint from "typescript-eslint";
import base from "./base.js";

export default [
  ...base,
  ...svelte.configs["flat/recommended"],
  ...svelte.configs["flat/prettier"],
  {
    // svelte-eslint-parser hands <script> contents to a sub-parser; without
    // this it uses espree and chokes on TS syntax inside `<script lang="ts">`.
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
];
