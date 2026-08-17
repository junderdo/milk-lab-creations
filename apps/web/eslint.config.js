import config from "@milklab/config/eslint/svelte";

// PROTOTYPE — throwaway, prototype/profile-and-registration. The variants are
// selected by a query string, which `resolve()` cannot express, so the prototype
// files (and the header they hang off) opt out of the navigation rule. Goes away
// with the branch.
export default [
  ...config,
  {
    files: ["**/PROTOTYPE-*.svelte", "src/routes/+layout.svelte"],
    rules: { "svelte/no-navigation-without-resolve": "off" },
  },
];
