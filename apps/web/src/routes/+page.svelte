<script lang="ts">
  import Accordion from "$lib/components/accordion/with-chevron.svelte";

  let { data } = $props();
</script>

<main class="min-h-screen bg-white dark:bg-gray-950 px-4 py-16">
  <div class="mx-auto max-w-md space-y-8">
    <header class="text-center space-y-2">
      <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Milk Lab Creations</h1>
      <p class="text-sm text-gray-600 dark:text-gray-400">
        {data.greeting.message} · {data.greeting.at.toLocaleTimeString()}
      </p>
    </header>
    <Accordion />
  </div>
</main>
