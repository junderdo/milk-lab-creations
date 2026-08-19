<!--
  A user's face, wherever their name is.

  Decorative by design: every site that draws this also draws the display name
  beside it, so an alt text here would make a screen reader say the name twice.
-->
<script lang="ts">
  import { AVATAR_ART } from "$lib/avatar/art";
  import { avatarOf } from "$lib/avatar/avatar";

  interface Props {
    userId: string;
    /** The stored token, or null for a user who has never chosen one. */
    avatar?: string | null;
    /** Tailwind sizing, since the only thing that varies between sites is scale. */
    size?: string;
  }

  let { userId, avatar = null, size = "size-6" }: Props = $props();

  const preset = $derived(avatarOf(avatar, userId));
</script>

<img src={AVATAR_ART[preset]} alt="" class="{size} shrink-0 rounded-full" />
