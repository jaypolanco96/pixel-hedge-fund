<script lang="ts">
	import { goto } from '$app/navigation';
	import HomeScene from '$lib/scene/HomeScene.svelte';
</script>

<HomeScene onEnter={() => goto('/elevator')} />
