<!--
  The second door: registration, permanently reachable from the profile page.

  A dismissal silences the *prompt*, never the feature — and this row is what
  makes that structural rather than a promise. `resolveRegistration` takes no
  dismissal input, so this row cannot be hidden by the key that closes the modal
  (`docs/spec/profile-and-devices.md` §3.1, §8.5, §10.3).

  Ears that cannot identify themselves get the row **visible but disabled, with
  the reason as page text** — ADR-0001's precedent. A missing row is a mystery;
  a disabled one with a sentence is an answer (§8.6).
-->
<script lang="ts">
  import { NAME_MAX } from "@milklab/api/limits";
  import type { Registration } from "$lib/devices/registration";
  import { commitName } from "$lib/profile/name";

  interface Props {
    registration: Registration;
    save: (serial: string, name: string) => Promise<void>;
  }

  let { registration, save }: Props = $props();

  let draft = $state("");
  let saving = $state(false);
  let error = $state<string | null>(null);

  async function submit(serial: string): Promise<void> {
    const decision = commitName(draft, "", "A name for your ears");
    if (decision.kind !== "save") {
      error = decision.kind === "invalid" ? decision.message : null;
      return;
    }
    saving = true;
    try {
      await save(serial, decision.name);
      draft = "";
      error = null;
    } catch {
      error = "Could not register those ears. Please try again.";
    } finally {
      saving = false;
    }
  }
</script>

<!-- `registered` renders nothing: the pair is already in the table above, with
     the "connected now" pill saying so. `unknown` renders nothing either — it
     is either no live connection, or a list we could not fetch, and the table
     above already says so in that second case rather than saying it twice. -->
{#if registration.kind === "unregistered" || registration.kind === "unregisterable"}
  {@const disabled = registration.kind === "unregisterable"}
  <div class="space-y-2 rounded-md border border-gray-200 p-4 dark:border-gray-800">
    <h3 class="text-sm font-semibold text-gray-900 dark:text-white">
      Register the ears you're connected to
    </h3>

    {#if registration.kind === "unregisterable"}
      <p class="text-sm text-gray-600 dark:text-gray-400">{registration.reason}</p>
    {:else}
      <p class="font-mono text-xs text-gray-500 dark:text-gray-500">{registration.serial}</p>
    {/if}

    <form
      onsubmit={(event) => {
        event.preventDefault();
        if (registration.kind === "unregistered") void submit(registration.serial);
      }}
      class="flex flex-wrap items-start gap-2"
    >
      <input
        bind:value={draft}
        {disabled}
        maxlength={NAME_MAX}
        placeholder="Blep"
        aria-label="A name for your ears"
        class="min-w-0 flex-1 rounded-md border border-gray-300 bg-transparent px-2 py-1.5 text-sm disabled:opacity-60 focus:outline-2 focus:outline-gray-900 dark:border-gray-700 dark:focus:outline-white"
      />
      <button
        type="submit"
        disabled={disabled || saving}
        class="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-60 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
      >
        {saving ? "Registering…" : "Register"}
      </button>
    </form>

    <p aria-live="polite" class="text-sm text-red-700 dark:text-red-400 {error ? '' : 'sr-only'}">
      {error ?? ""}
    </p>
  </div>
{/if}
