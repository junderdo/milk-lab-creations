<!--
  "Remixed from ⟨source⟩" — the same line on the detail page and in the editor
  header, so a fork says where it came from wherever you meet it. Renders
  nothing at all for an original.
-->
<script lang="ts">
  import { resolve } from "$app/paths";
  import { remixOriginOf, type RemixProvenance } from "$lib/animation/remix";

  interface Props {
    provenance: RemixProvenance;
    class?: string;
  }

  let { provenance, class: className = "" }: Props = $props();
  const origin = $derived(remixOriginOf(provenance));
</script>

{#if origin.kind !== "none"}
  <p class="text-sm text-gray-600 dark:text-gray-400 {className}">
    Remixed from
    {#if origin.kind === "known"}
      <a href={resolve("/animations/[id]", { id: origin.id })} class="underline">{origin.name}</a>
    {:else}
      <span class="italic">an original that is no longer available</span>
    {/if}
  </p>
{/if}
