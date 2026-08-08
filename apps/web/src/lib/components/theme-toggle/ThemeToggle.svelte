<!--
  Flips the UI between the two palettes and remembers the choice on this device.

  The icon shows the theme you'd switch to, not the one you're in — the button
  is the action, and its label says so for anyone not reading the icon.
-->
<script lang="ts">
  import { Moon, Sun } from "@lucide/svelte";
  import { theme } from "$lib/theme/theme.svelte";
  import { otherTheme } from "$lib/theme/theme";

  const next = $derived(otherTheme(theme.current));
</script>

<button
  type="button"
  onclick={() => {
    theme.toggle();
  }}
  aria-label="Switch to {next} theme"
  title="Switch to {next} theme"
  class="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
>
  {#if next === "dark"}
    <Moon class="size-4" aria-hidden="true" />
  {:else}
    <Sun class="size-4" aria-hidden="true" />
  {/if}
</button>
