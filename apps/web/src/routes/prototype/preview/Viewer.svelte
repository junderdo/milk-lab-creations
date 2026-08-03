<!-- PROTOTYPE — Canvas wrapper (Threlte hooks must live inside <Canvas>). -->
<script lang="ts">
	import { Canvas } from '@threlte/core';
	import Scene from './Scene.svelte';
	import type { PlaybackState } from './proto.svelte';

	let { pb }: { pb: PlaybackState } = $props();
</script>

<div class="h-full w-full">
	<Canvas renderMode="manual">
		<Scene {pb} />
	</Canvas>
</div>
