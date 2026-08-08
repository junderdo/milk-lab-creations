<!--
  The editor screen: reshape an animation on the graph timeline and save it.

  Mounted per animation (the route keys on the id), so `animation` and `limits`
  are fixed for this component's life and the session state below can be opened
  once from them. A `null` animation is one that does not exist yet: the same
  screen, opened on a default document, whose first Save creates it. Everything
  downstream of that — undo, drafts, the leave guard, the conflict dialog —
  works the same either way, which is the reason it is this component and not
  a second one.

  All document state lives in `AnimationEditor` (`$lib/editor/editor-state`),
  which is immutable — every edit reassigns `editor`, which is both how Svelte
  sees the change and where the undo stack gets its steps. This file is the
  wiring: pointer events in, one mutation out, and the two dialogs a save can
  produce.

  View state — playhead, selection, channel visibility — deliberately stays out
  of the editor. It is not part of the document, so it is not dirty, not saved
  and not undoable; undo only moves it as a side effect, to show what it did.
-->
<script lang="ts">
  import { Redo2, Undo2 } from "@lucide/svelte";
  import { onDestroy, onMount, untrack } from "svelte";
  import { beforeNavigate, goto, replaceState } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { channelLabelsFor, modelUrlFor } from "$lib/animation/robots";
  import AnimationSparkline from "$lib/components/animation-sparkline/AnimationSparkline.svelte";
  import AnimationTimeline from "$lib/components/animation-timeline/AnimationTimeline.svelte";
  import type AnimationViewer from "$lib/components/animation-viewer/AnimationViewer.svelte";
  import EditorDialog from "./EditorDialog.svelte";
  import {
    createInputFor,
    DESCRIPTION_MAX,
    insertionIndexFor,
    NAME_MAX,
    newDocument,
    updateInputFor,
    type RobotLimits,
  } from "$lib/editor/document";
  import {
    DraftWriter,
    draftKeyFor,
    localDraftStorage,
    takeDraft,
    type DraftOffer,
  } from "$lib/editor/draft";
  import { AnimationEditor, type LoadedAnimation } from "$lib/editor/editor-state";
  import { leaveDecision, type LeaveTarget } from "$lib/editor/leave-guard";
  import { humanizedSince } from "$lib/format/relative-time";
  import { saveFailureFrom } from "$lib/editor/save-error";
  import { trpc } from "$lib/trpc";

  interface Props {
    /** `null` opens a brand-new animation, created by its first Save. */
    animation: LoadedAnimation | null;
    /** Which robot this animation drives — fixed at creation, never edited. */
    robot: { slug: string; name: string };
    limits: RobotLimits;
  }

  let { animation, robot, limits }: Props = $props();

  // Read once, deliberately: the route keys on the animation id, so a different
  // animation is a different mount. `untrack` says that rather than leaving a
  // "did you mean a derived?" warning for the next reader to re-litigate.
  const opened = untrack(() => animation);
  const openedLimits = untrack(() => limits);
  const openedRobot = untrack(() => robot);
  const labels = channelLabelsFor(openedRobot.slug, openedLimits.channels);
  const modelUrl = modelUrlFor(openedRobot.slug);

  // Not deeply proxied: Svelte leaves class instances alone, so reactivity is
  // exactly the reassignments below and never a half-applied mutation mid-drag.
  let editor = $state(
    opened === null
      ? AnimationEditor.forNewAnimation(newDocument(openedLimits), openedLimits)
      : AnimationEditor.open(opened, openedLimits),
  );

  let playheadMs = $state(0);
  let selectedIndex = $state<number | null>(null);

  let nameInput: HTMLInputElement | undefined = $state();
  let descriptionInput: HTMLTextAreaElement | undefined = $state();

  const draftKey = draftKeyFor(opened?.id ?? null);
  const draftStorage = localDraftStorage();
  // Reassigned once, if a create turns the shared "new" slot into this
  // animation's own — every other reference is to whichever writer is current.
  let draftWriter = new DraftWriter({ storage: draftStorage, key: draftKey });

  // Answered before the document is allowed to move: writing a draft over the
  // one being offered would destroy the very work the dialog is offering back.
  let draftOffer = $state<DraftOffer | null>(null);
  let draftChecked = $state(false);

  onMount(() => {
    draftOffer = takeDraft(draftStorage, draftKey, {
      document: editor.document,
      updatedAt: editor.baseUpdatedAt,
    });
    draftChecked = true;
  });

  $effect(() => {
    const { document, dirty, baseUpdatedAt } = editor;
    if (!draftChecked || draftOffer !== null) return;
    // clean means there is nothing a draft could recover — including after a
    // save, which is one of the two moments a draft is meant to disappear
    if (dirty) draftWriter.documentChanged(document, baseUpdatedAt);
    else draftWriter.discard();
  });

  // An in-app navigation away never hides the tab, so the debounce would
  // otherwise swallow the last second of work.
  onDestroy(() => draftWriter.flush());

  function flushDraftIfHidden() {
    if (globalThis.document.visibilityState === "hidden") draftWriter.flush();
  }

  function restoreDraft() {
    if (draftOffer === null) return;
    editor = editor.draftRestored(draftOffer.draft.document);
    draftOffer = null;
  }

  function discardDraft() {
    draftWriter.discard();
    draftOffer = null;
  }

  let leaveTarget = $state<LeaveTarget | null>(null);
  let confirmedLeave = false;

  beforeNavigate((navigation) => {
    const decision = leaveDecision({
      dirty: editor.dirty,
      confirmed: confirmedLeave,
      willUnload: navigation.willUnload,
      to: navigation.to?.url ?? null,
      viaHistory: navigation.type === "popstate",
    });
    if (decision.kind === "allow") return;
    navigation.cancel();
    if (decision.kind === "ask") leaveTarget = decision.leave;
  });

  function leaveAnyway() {
    const target = leaveTarget;
    leaveTarget = null;
    if (target === null) return;
    confirmedLeave = true;
    // the cancel put the editor's entry back on the stack, so a Back has to be
    // answered with a Back — navigating to the same URL would stack a new entry
    if (target.viaHistory) history.back();
    // already a resolved URL — it is the destination the guard just cancelled
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    else void goto(target.url);
  }

  /** Take an undo/redo result and go and show what it moved. */
  function applyHistoryMove(moved: AnimationEditor) {
    if (moved === editor) return;
    const reveal = moved.reveal;
    editor = moved;

    if (reveal === null) return;
    if (reveal.kind === "keyframe") {
      selectedIndex = reveal.index;
      playheadMs = reveal.timeMs;
      return;
    }
    const field = reveal.field === "name" ? nameInput : descriptionInput;
    field?.focus();
  }

  function onHistoryKeydown(event: KeyboardEvent) {
    // Deliberately intercepted even inside the name and description fields: the
    // text is part of the document, typing is already an undo step, and letting
    // the browser's own field-level undo run alongside would give one gesture
    // two conflicting histories.
    if (dialogOpen) return; // a shortcut is not blocked by `inert`
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "z") {
      event.preventDefault();
      applyHistoryMove(event.shiftKey ? editor.redone() : editor.undone());
    } else if (key === "y") {
      event.preventDefault();
      applyHistoryMove(editor.redone());
    }
  }

  // Same lazy-chunk treatment as the detail page: the viewer is ~150-200 kB of
  // three.js and the editor is usable before it arrives.
  let Viewer: typeof AnimationViewer | null = $state(null);
  let viewerReady = $state(false);
  let viewerFailed = $state(false);

  // `void`, not an async callback: onMount treats a returned promise as a
  // cleanup function, and this one has nothing to clean up.
  onMount(() => {
    void (async () => {
      try {
        const module = await import("$lib/components/animation-viewer/AnimationViewer.svelte");
        Viewer = module.default;
      } catch {
        viewerFailed = true;
      }
    })();
  });

  const showPlaceholder = $derived(!viewerReady || viewerFailed);

  // `inert` rather than an overlay alone: every one of these dialogs is a
  // decision about the document, and a Tab key that reaches the timeline behind
  // it would let the document move while the question is still open.
  const dialogOpen = $derived(
    draftOffer !== null || editor.conflict !== null || leaveTarget !== null,
  );

  const primaryButtonClasses =
    "rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200";

  const secondaryButtonClasses =
    "rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800";

  const historyButtonClasses =
    "rounded-md border border-gray-300 p-1.5 text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800";

  function addKeyframe(timeMs: number) {
    if (editor.atKeyframeCap) return;
    const landsAt = insertionIndexFor(editor.keyframes, Math.round(timeMs));
    editor = editor.addKeyframeAt(timeMs);
    selectedIndex = landsAt;
  }

  function removeKeyframe(index: number) {
    editor = editor.removeKeyframe(index);
    selectedIndex = null;
  }

  /**
   * Run whatever save the editor has queued.
   *
   * Reads `pendingRequest` from the state machine rather than assembling one
   * here, so a first save and a conflict overwrite go down the identical path —
   * the only difference between them is whether the guard is attached, which is
   * the machine's business.
   */
  async function runPendingSave(started: AnimationEditor) {
    const request = started.pendingRequest;
    if (request === null) return; // nothing to save, or a save already in flight
    const id = started.animationId;
    editor = started;

    try {
      const saved =
        id === null
          ? await trpc().animations.create.mutate(createInputFor(robot.slug, request))
          : await trpc().animations.update.mutate(updateInputFor(id, request));
      // `editor`, not `started`: edits made while the save was in flight are
      // kept, and stay dirty until they are saved in their own right.
      editor = editor.saveSucceeded(saved);
      if (id === null) adoptCreated(saved.id);
    } catch (thrown) {
      const failure = saveFailureFrom(thrown);
      editor =
        failure.kind === "conflict"
          ? editor.saveConflicted(failure.server)
          : editor.saveFailed(failure.message);
    }
  }

  /**
   * The animation now exists: settle onto its own URL and its own draft slot.
   *
   * `replaceState` rather than a navigation — the session in front of the user
   * is already the right one, and reloading it would throw away the undo stack
   * and the viewer chunk to arrive at exactly what is on screen. The URL still
   * has to change, so a refresh or a shared link lands on the animation rather
   * than on a second blank editor.
   *
   * The shared "new" slot is discarded rather than moved: the document is on
   * the server now, so there is nothing left for a draft to recover, and
   * leaving it behind would offer this work back to the next new animation.
   */
  function adoptCreated(id: string) {
    draftWriter.discard();
    draftWriter = new DraftWriter({ storage: draftStorage, key: draftKeyFor(id) });
    replaceState(resolve("/animations/[id]/edit", { id }), {});
  }

  async function save() {
    await runPendingSave(editor.saveStarted());
  }

  async function overwrite() {
    await runPendingSave(editor.overwriteRequested());
  }

  function discardMine() {
    editor = editor.serverAdopted();
    selectedIndex = null;
  }
</script>

<svelte:head>
  <title>{editor.isNew ? "New animation" : `Editing ${editor.document.name}`}</title>
</svelte:head>
<svelte:window onkeydown={onHistoryKeydown} onpagehide={() => draftWriter.flush()} />
<svelte:document onvisibilitychange={flushDraftIfHidden} />

<!-- An app shell above `lg` — the preview takes what header and footer leave;
     below it the page stacks and scrolls again, per spec §3.1. -->
<main class="flex flex-col lg:min-h-0 lg:flex-1" inert={dialogOpen}>
  <header class="shrink-0 space-y-2 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
    <div class="flex flex-wrap items-center gap-3">
      <div class="min-w-0 flex-1">
        <label class="sr-only" for="animation-name">Name</label>
        <input
          bind:this={nameInput}
          id="animation-name"
          type="text"
          maxlength={NAME_MAX}
          value={editor.document.name}
          oninput={(event) => (editor = editor.setName(event.currentTarget.value))}
          onblur={() => (editor = editor.editCommitted())}
          placeholder="Name this animation"
          class="w-full rounded-md border border-transparent bg-transparent text-xl font-bold text-gray-900 hover:border-gray-300 focus:border-gray-400 focus:outline-none dark:text-white dark:hover:border-gray-700 dark:focus:border-gray-600"
        />
      </div>

      <div class="flex shrink-0 items-center gap-3">
        <!-- Buttons as well as shortcuts: this is the only place the stack
             is visible at all, and a pointer has no Ctrl+Z. -->
        <span class="flex items-center gap-1">
          <button
            type="button"
            onclick={() => applyHistoryMove(editor.undone())}
            disabled={!editor.canUndo}
            title="Undo"
            aria-label="Undo"
            class={historyButtonClasses}
          >
            <Undo2 class="h-4 w-4" />
          </button>
          <button
            type="button"
            onclick={() => applyHistoryMove(editor.redone())}
            disabled={!editor.canRedo}
            title="Redo"
            aria-label="Redo"
            class={historyButtonClasses}
          >
            <Redo2 class="h-4 w-4" />
          </button>
        </span>
        <span class="text-sm text-gray-500 dark:text-gray-400">
          {#if editor.saving}
            Saving…
          {:else if editor.dirty}
            Unsaved changes
          {:else if editor.isNew}
            Not saved yet
          {:else}
            Saved
          {/if}
        </span>
        <!-- Leaving goes to the animation's own page once it has one, and to
             the list it will join until then. -->
        {#if editor.animationId === null}
          <a href={resolve("/my")} class={secondaryButtonClasses}>Cancel</a>
        {:else}
          <a
            href={resolve("/animations/[id]", { id: editor.animationId })}
            class={secondaryButtonClasses}
          >
            Done
          </a>
        {/if}
        <button
          type="button"
          onclick={() => void save()}
          disabled={!editor.canSave}
          class="{primaryButtonClasses} disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>

    <!-- Only once there is something to save: a new editor opens nameless by
         design, and greeting it with an error would be scolding the author for
         not having typed yet. -->
    {#if editor.nameIsEmpty && editor.dirty}
      <p class="text-sm text-red-600 dark:text-red-400">
        An animation needs a name before it can be saved.
      </p>
    {/if}

    <div class="flex items-start gap-3">
      <label class="sr-only" for="animation-description">Description</label>
      <textarea
        bind:this={descriptionInput}
        id="animation-description"
        rows="1"
        maxlength={DESCRIPTION_MAX}
        value={editor.document.description}
        oninput={(event) => (editor = editor.setDescription(event.currentTarget.value))}
        onblur={() => (editor = editor.editCommitted())}
        placeholder="Describe it (optional)"
        class="min-w-0 flex-1 rounded-md border border-gray-300 bg-transparent p-2 text-sm text-gray-700 focus:outline-none dark:border-gray-700 dark:text-gray-300"
      ></textarea>
      <p class="shrink-0 pt-2 text-xs text-gray-400 dark:text-gray-500">
        {editor.document.description.length} / {DESCRIPTION_MAX}
      </p>
    </div>

    {#if editor.errorMessage !== null}
      <div
        role="alert"
        class="flex items-center justify-between gap-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
      >
        <span>{editor.errorMessage}</span>
        <span class="flex gap-3">
          <button type="button" class="underline" onclick={() => void save()}>Try again</button>
          <button
            type="button"
            class="underline"
            onclick={() => (editor = editor.errorDismissed())}
          >
            Dismiss
          </button>
        </span>
      </div>
    {/if}
  </header>

  <!-- Definite height either way — fixed aspect while the page stacks, the
       leftover column once it doesn't — so the viewer arriving causes no layout
       shift; until then the curves hold the space. -->
  <section
    class="relative aspect-[4/3] overflow-hidden bg-gray-100 lg:aspect-auto lg:min-h-0 lg:flex-1 dark:bg-gray-900"
  >
    {#if Viewer && modelUrl && !viewerFailed && editor.keyframes.length > 0}
      <Viewer
        keyframes={editor.keyframes}
        {modelUrl}
        bind:currentTimeMs={playheadMs}
        transport={false}
        onready={() => (viewerReady = true)}
        onerror={() => (viewerFailed = true)}
      />
    {/if}
    {#if showPlaceholder}
      <AnimationSparkline
        keyframes={editor.keyframes}
        label="Motion curves for {editor.document.name}"
        class="absolute inset-0 h-full w-full p-6 opacity-60"
      />
      <div
        class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500"
      >
        {viewerFailed ? "Preview unavailable" : "Loading preview…"}
      </div>
    {/if}
  </section>

  <footer class="min-w-0 shrink-0 border-t border-gray-200 px-4 py-3 dark:border-gray-800">
    <AnimationTimeline
      keyframes={editor.keyframes}
      {limits}
      {labels}
      bind:playheadMs
      bind:selectedIndex
      nearCap={editor.nearKeyframeCap}
      atCap={editor.atKeyframeCap}
      onangle={(index, channel, angle) => (editor = editor.setAngle(index, channel, angle))}
      ontime={(index, timeMs) => (editor = editor.setTime(index, timeMs))}
      onease={(index, patch) => (editor = editor.setEase(index, patch))}
      onremove={removeKeyframe}
      onadd={addKeyframe}
      oncommit={() => (editor = editor.editCommitted())}
    />
  </footer>
</main>

{#if draftOffer !== null}
  <!--
    Before editing begins, and only when the draft says something the server
    copy does not. Restoring a stale draft is still allowed: what it collides
    with is settled at save time by the conflict dialog below, not here.
  -->
  <EditorDialog
    title="You have unsaved changes from {humanizedSince(draftOffer.draft.savedAt)}"
    confirm={{ label: "Restore draft", onclick: restoreDraft }}
    dismiss={{ label: "Discard draft", onclick: discardDraft }}
  >
    They were left on this device and never saved.
    {#if draftOffer.stale}
      This animation has been changed elsewhere since then, so restoring may bring back work that is
      out of date — you will be asked again when you save.
    {/if}
  </EditorDialog>
{/if}

{#if editor.conflict !== null}
  <!--
    Two choices, no merge. The record the server rejected us with is already in
    hand, so "load newest" needs no refetch — and the realistic blast radius is
    one person in two tabs.
  -->
  <EditorDialog
    title="This animation was changed elsewhere"
    confirm={{ label: "Overwrite", onclick: () => void overwrite() }}
    dismiss={{ label: "Discard mine, load newest", onclick: discardMine }}
  >
    Probably another tab or device. Saving now would overwrite
    <b class="font-medium">{editor.conflict.name}</b>, saved
    {editor.conflict.updatedAt.toLocaleString()}.
  </EditorDialog>
{/if}

{#if leaveTarget !== null}
  <EditorDialog
    title="You have unsaved changes"
    confirm={{ label: "Stay", onclick: () => (leaveTarget = null) }}
    dismiss={{ label: "Leave", onclick: leaveAnyway }}
  >
    They are kept as a draft on this device, so you can pick them up here again — but they have not
    been saved.
  </EditorDialog>
{/if}
