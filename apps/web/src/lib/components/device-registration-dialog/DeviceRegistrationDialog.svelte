<!--
  The registration moment: the question asked the instant the user has proved
  they hold this pair.

  Interrupting is the point. Registration *is* naming, and this is the only
  moment the question is cheap to answer — a banner that can be scrolled past
  turns a one-input action into a thing to get around to
  (`docs/spec/profile-and-devices.md` §8.4).

  It is mounted under `{#if}` by its owner rather than held open behind a prop,
  and it never closes itself: **every gesture writes one of the two outcomes**,
  and the prompt is derived from what those writes change. Esc and the backdrop
  therefore dismiss — a closing gesture that wrote nothing could not close it,
  because the verdict would still say to ask (§10.4).
-->
<script lang="ts">
  import { NAME_MAX } from "@milklab/api/limits";
  import { commitName } from "$lib/profile/name";

  interface Props {
    /** Captured at prompt time — never re-read from a connection that may be gone. */
    serial: string;
    /** The advertised model name, which is why a per-unit one is worth asking for. */
    deviceName: string;
    save: (name: string) => Promise<void>;
    dismiss: () => void;
  }

  let { serial, deviceName, save, dismiss }: Props = $props();

  let draft = $state("");
  let saving = $state(false);
  let error = $state<string | null>(null);
  let nameInput = $state<HTMLInputElement | null>(null);
  const titleId = $props.id();

  $effect(() => {
    nameInput?.focus();
  });

  async function submit(): Promise<void> {
    // against "" as the current name: there is nothing to be unchanged from,
    // so an empty draft is the `invalid` this shares with the rename fields
    const decision = commitName(draft, "", "A name for your ears");
    if (decision.kind !== "save") {
      error = decision.kind === "invalid" ? decision.message : null;
      return;
    }
    saving = true;
    try {
      await save(decision.name);
    } catch {
      // nothing closes the dialog here: the list is unchanged, so the verdict
      // stays true and it stays open by itself
      error = "Could not register those ears. Please try again.";
    } finally {
      saving = false;
    }
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === "Escape") dismiss();
  }}
/>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
  onclick={(event) => {
    if (event.target === event.currentTarget) dismiss();
  }}
>
  <div
    class="w-full max-w-md space-y-4 rounded-md bg-white p-5 shadow-xl dark:bg-gray-950"
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
  >
    <div class="space-y-1">
      <h2 id={titleId} class="text-lg font-bold text-gray-900 dark:text-white">Name these ears?</h2>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Every pair advertises itself as <span class="font-medium">{deviceName}</span>, so a name of
        your own is the only way to tell two pairs apart.
      </p>
      <p class="font-mono text-xs text-gray-500 dark:text-gray-500">{serial}</p>
    </div>

    <form
      onsubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      class="space-y-4"
    >
      <label class="block space-y-1">
        <span class="text-sm font-medium text-gray-900 dark:text-white">A name for your ears</span>
        <input
          bind:this={nameInput}
          bind:value={draft}
          maxlength={NAME_MAX}
          placeholder="Blep"
          class="w-full rounded-md border border-gray-300 bg-transparent px-2 py-1.5 text-sm focus:outline-2 focus:outline-gray-900 dark:border-gray-700 dark:focus:outline-white"
        />
      </label>

      <p aria-live="polite" class="text-sm text-red-700 dark:text-red-400 {error ? '' : 'sr-only'}">
        {error ?? ""}
      </p>

      <div class="flex flex-wrap justify-end gap-3">
        <!-- "Not now" rather than "Later" or "Skip": it is the honest
             description of what the button does — this pair, not asked again -->
        <button
          type="button"
          onclick={dismiss}
          class="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Not now
        </button>
        <button
          type="submit"
          disabled={saving}
          class="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-60 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  </div>
</div>
