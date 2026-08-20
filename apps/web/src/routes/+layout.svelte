<script lang="ts">
  import "../app.css";
  import { resolve } from "$app/paths";
  import favicon from "$lib/assets/favicon.svg";
  import logo from "$lib/assets/milk-lab-logo.svg";
  import { setAccessToken, trpc } from "$lib/trpc";
  import DeviceRegistrationDialog from "$lib/components/device-registration-dialog/DeviceRegistrationDialog.svelte";
  import EarsChip from "$lib/components/ears-chip/EarsChip.svelte";
  import ThemeToggle from "$lib/components/theme-toggle/ThemeToggle.svelte";
  import UserAvatar from "$lib/components/user-avatar/UserAvatar.svelte";
  import { registerDevice, type RegisterDeps } from "$lib/devices/actions";
  import { dismissals } from "$lib/devices/dismissed.svelte";
  import { registrationPrompt, resolveRegistration } from "$lib/devices/registration";
  import { deviceStore } from "$lib/devices/store.svelte";
  import { ears } from "$lib/ears/connection.svelte";

  let { data, children } = $props();

  // hand the server-minted access token to the in-memory browser client
  $effect(() => {
    setAccessToken(data.accessToken ?? null);
  });

  // the store is browser-only — module state is shared across requests on the
  // server — so the server-rendered pass reads the load data directly
  $effect.pre(() => deviceStore.seed(data.devices));
  const devices = $derived(deviceStore.all ?? data.devices);

  const registration = $derived(resolveRegistration(ears.state, devices));

  /**
   * Derived, never fired. This becomes true when its inputs agree, whenever
   * that is, and every outcome flips it back on its own: Save pushes the row
   * into the store, "Not now" writes the dismissal key, and a disconnect drops
   * the connected state. Nothing ever writes `open = false`, so no dialog can
   * be left open against a connection that is gone
   * (`docs/spec/profile-and-devices.md` §10.4).
   */
  const prompt = $derived(
    registrationPrompt(registration, dismissals.storage, data.me?.id ?? null),
  );

  const registerDeps: RegisterDeps = {
    api: {
      register: (input) => trpc().devices.register.mutate(input),
      list: () => trpc().devices.list.query(),
    },
    store: deviceStore,
  };
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
        {#if data.me}
          <a href={resolve("/my")} class="text-sm text-gray-600 hover:underline dark:text-gray-400"
            >My animations</a
          >
        {/if}
      </div>
      <div class="flex items-center gap-3">
        <EarsChip />
        <ThemeToggle />
        {#if data.me}
          <a
            href={resolve("/profile")}
            class="flex items-center gap-2 text-sm text-gray-600 hover:underline dark:text-gray-400"
          >
            <UserAvatar userId={data.me.id} avatar={data.me.avatar} />
            {data.me.displayName}
          </a>
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

<!-- mounted under `{#if}` rather than held open behind a prop: a pair swap
     always passes through `disconnected`, because `connect()` early-returns
     unless the status is disconnected, so conditional mounting means a new pair
     always gets a fresh input. The correctness comes from the structure rather
     than from keying and remembering to (§10.8). -->
{#if prompt && data.me && ears.state.status === "connected"}
  {@const serial = prompt.serial}
  {@const userId = data.me.id}
  <DeviceRegistrationDialog
    {serial}
    deviceName={ears.state.deviceName}
    save={(name) => registerDevice(registerDeps, serial, name)}
    dismiss={() => dismissals.dismiss(userId, serial)}
  />
{/if}
