<!--
  "Remixed from ⟨source⟩" — the same line on the detail page and in the editor
  header, so a fork says where it came from wherever you meet it.
-->
<script lang="ts">
  import { resolve } from "$app/paths";
  import { remixOriginOf, type RemixProvenance } from "$lib/animation/remix";

  interface Props {
    provenance: RemixProvenance;
  }

  let { provenance }: Props = $props();
  const origin = $derived(remixOriginOf(provenance));
</script>

{#if origin.kind === "known"}
  <p class="text-sm text-gray-600 dark:text-gray-400">
    Remixed from
    <a href={resolve("/animations/[id]", { id: origin.id })} class="underline">{origin.name}</a>
  </p>
{:else if origin.kind === "unavailable"}
  <p class="text-sm text-gray-600 dark:text-gray-400">
    Remixed from <span class="italic">an original that is no longer available</span>
  </p>
{/if}
