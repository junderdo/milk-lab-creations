<!--
  Keyed on the animation id: SvelteKit reuses a page component when only a
  route parameter changes, and an editor session belongs to one animation. The
  key makes navigating from one edit route to another a fresh session rather
  than one holding the previous animation's document.
-->
<script lang="ts">
  import AnimationEditorScreen from "$lib/components/animation-editor/AnimationEditorScreen.svelte";

  let { data } = $props();
</script>

{#key data.animation.id}
  <AnimationEditorScreen animation={data.animation} limits={data.limits} />
{/key}
