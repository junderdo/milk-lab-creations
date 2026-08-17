<!-- PROTOTYPE — throwaway, prototype/profile-and-registration. -->
<script lang="ts">
  import { avatarOf, avatarSvg, type PresetKey } from "./PROTOTYPE-avatars";

  let {
    token = null,
    userId = "prototype-user",
    preset,
    size = "size-8",
  }: { token?: string | null; userId?: string; preset?: PresetKey; size?: string } = $props();

  const key = $derived(preset ?? avatarOf(token, userId));
</script>

<span class="{size} inline-block shrink-0 overflow-hidden rounded-full">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- prototype: our own SVG string -->
  {@html avatarSvg(key)}
</span>
