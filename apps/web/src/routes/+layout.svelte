<script lang="ts">
  import "../app.css";
  import { resolve } from "$app/paths";
  import favicon from "$lib/assets/favicon.svg";
  import logo from "$lib/assets/milk-lab-logo.svg";
  import { setAccessToken } from "$lib/trpc";
  import ThemeToggle from "$lib/components/theme-toggle/ThemeToggle.svelte";
  // PROTOTYPE — throwaway, prototype/profile-and-registration. The real chip is
  // replaced by a fake one per variant: the chip's shape is half the question
  // (spec §7), and Web Bluetooth cannot run under WSL2 anyway.
  import { page } from "$app/state";
  import Avatar from "$lib/profile/PROTOTYPE-Avatar.svelte";
  import ChipA from "$lib/profile/PROTOTYPE-ChipA.svelte";
  import ChipB from "$lib/profile/PROTOTYPE-ChipB.svelte";
  import ChipC from "$lib/profile/PROTOTYPE-ChipC.svelte";
  import { proto } from "$lib/profile/PROTOTYPE-profile.svelte";
  import { avatarOf } from "$lib/profile/PROTOTYPE-avatars";

  let { data, children } = $props();

  const variant = $derived(page.url.searchParams.get("variant") ?? "A");
  // PROTOTYPE — a variant in the URL stands in for a session, so the prototype
  // runs on the dev server without Cognito.
  const signedIn = $derived(Boolean(data.me) || page.url.searchParams.has("variant"));
  const avatarKey = $derived(avatarOf(proto.avatar, proto.userId));

  // hand the server-minted access token to the in-memory browser client
  $effect(() => {
    setAccessToken(data.accessToken ?? null);
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<!-- A flex column so a page can claim the rest of the viewport with `flex-1`
     rather than subtracting this header's height from 100vh.

     A page that marks itself `data-editor-shell` gets the frame pinned to the
     viewport instead of merely floored at it: `min-h-dvh` lets content grow the
     page and scroll, which is right everywhere except a shell, where growing is
     exactly the bug — the panes stop dividing a window and start dividing their
     own overflow, and the timeline lands below the fold. -->
<div
  class="flex min-h-dvh flex-col bg-white editor-shell:has-[[data-editor-shell]]:h-dvh editor-shell:has-[[data-editor-shell]]:overflow-hidden dark:bg-gray-950"
>
  <header class="shrink-0 border-b border-gray-200 dark:border-gray-800">
    <nav class="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
      <div class="flex items-center gap-6">
        <a href={resolve("/")}>
          <!-- The logo is black line art on transparent, so dark mode inverts it
               rather than shipping a second file. -->
          <img src={logo} alt="Milk Lab Creations" class="h-12 w-auto dark:invert" />
        </a>
        <a href={resolve("/")} class="text-sm text-gray-600 hover:underline dark:text-gray-400"
          >Gallery</a
        >
        {#if signedIn}
          <!-- PROTOTYPE — the nav label follows the variant: B and C absorb the
               profile into /my, A keeps /my as the animations list. -->
          <a
            href={`${resolve("/my")}?variant=${variant}`}
            class="text-sm text-gray-600 hover:underline dark:text-gray-400"
          >
            {variant === "A" ? "My animations" : "My stuff"}
          </a>
        {/if}
      </div>
      <div class="flex items-center gap-3">
        {#if variant === "A"}
          <ChipA />
        {:else if variant === "B"}
          <ChipB />
        {:else}
          <ChipC />
        {/if}
        <ThemeToggle />
        {#if signedIn}
          <!-- PROTOTYPE — how you reach the profile, per variant: A hangs it off
               the name (a settings page), B off a tab, C off the avatar. -->
          {#if variant === "A"}
            <a
              href={`${resolve("/my")}?variant=A&pane=profile`}
              class="flex items-center gap-2 text-sm text-gray-600 hover:underline dark:text-gray-400"
            >
              <Avatar preset={avatarKey} size="size-6" />
              {proto.displayName}
            </a>
          {:else if variant === "B"}
            <a
              href={`${resolve("/my")}?variant=B&tab=profile`}
              class="flex items-center gap-2 text-sm"
            >
              <Avatar preset={avatarKey} size="size-6" />
              <span class="text-gray-600 dark:text-gray-400">{proto.displayName}</span>
            </a>
          {:else}
            <a href={`${resolve("/my")}?variant=C`} aria-label="Profile">
              <Avatar preset={avatarKey} size="size-8" />
            </a>
          {/if}
          <form method="POST" action="/auth/logout">
            <button class="text-sm text-gray-600 hover:underline dark:text-gray-400"
              >Sign out</button
            >
          </form>
        {:else}
          <a
            href={resolve("/auth/login")}
            data-sveltekit-reload
            class="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
            >Sign in with Google</a
          >
        {/if}
      </div>
    </nav>
  </header>

  <div class="flex min-h-0 flex-1 flex-col">
    {@render children()}
  </div>
</div>
