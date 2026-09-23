<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import ElevatorScene from '$lib/scene/ElevatorScene.svelte';

	const toHome = $derived(page.url.searchParams.get('to') === 'home');
	let reduceMotion = $state(false);

	onMount(() => {
		reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
	});
</script>

{#key toHome ? 'down' : 'up'}
	<ElevatorScene
		{reduceMotion}
		direction={toHome ? 'down' : 'up'}
		onArrive={() => goto(toHome ? '/' : '/floor')}
	/>
{/key}
