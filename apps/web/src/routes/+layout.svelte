<script lang="ts">
  import "../app.css";
  import { resolve } from "$app/paths";
  import favicon from "$lib/assets/favicon.svg";
  import { setAccessToken } from "$lib/trpc";
  import ThemeToggle from "$lib/components/theme-toggle/ThemeToggle.svelte";

  let { data, children } = $props();

  // hand the server-minted access token to the in-memory browser client
  $effect(() => {
    setAccessToken(data.accessToken ?? null);
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<!-- A flex column so a page can claim the rest of the viewport with `flex-1`
     rather than subtracting this header's height from 100vh. -->
<div class="flex min-h-screen flex-col bg-white dark:bg-gray-950">
  <header class="shrink-0 border-b border-gray-200 dark:border-gray-800">
    <nav class="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
      <div class="flex items-center gap-6">
        <a href={resolve("/")} class="font-bold text-gray-900 dark:text-white">Milk Lab Creations</a
        >
        <a href={resolve("/")} class="text-sm text-gray-600 hover:underline dark:text-gray-400"
          >Gallery</a
        >
        {#if data.me}
          <a href={resolve("/my")} class="text-sm text-gray-600 hover:underline dark:text-gray-400"
            >My animations</a
          >
        {/if}
      </div>
      <div class="flex items-center gap-3">
        <ThemeToggle />
        {#if data.me}
          <span class="text-sm text-gray-600 dark:text-gray-400">{data.me.displayName}</span>
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
