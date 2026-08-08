<!--
  The same editor as the edit route, opened on nothing. The first Save creates
  the animation and the screen settles onto its own URL from there.
-->
<script lang="ts">
  import AnimationEditorScreen from "$lib/components/animation-editor/AnimationEditorScreen.svelte";

  let { data } = $props();
</script>

<!-- No visibility until there is an animation to have one; the first Save
     reads it back off the row it creates. -->
<AnimationEditorScreen animation={null} robot={data.robot} limits={data.limits} visibility={null} />
