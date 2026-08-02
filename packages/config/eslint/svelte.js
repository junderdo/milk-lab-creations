import svelte from "eslint-plugin-svelte";
import base from "./base.js";

export default [
  ...base,
  ...svelte.configs["flat/recommended"],
  ...svelte.configs["flat/prettier"],
];
