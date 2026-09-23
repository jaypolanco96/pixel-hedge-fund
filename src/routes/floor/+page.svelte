<script lang="ts">
	import { onMount } from 'svelte';
	import TradingFloor from '$lib/scene/TradingFloor.svelte';

	// Set by ElevatorScene right before navigating here (only for the "arriving at the floor" ride,
	// where the elevator itself keeps its doors shut - see openDoorsOnArrival in ElevatorScene.svelte).
	// Consuming it here makes the elevator's closed doors feel like they open directly into the floor.
	let showDoors = $state(false);
	let doorsOpen = $state(false);

	onMount(() => {
		let flag: string | null = null;
		try {
			flag = sessionStorage.getItem('phf-door-open-on-floor');
			if (flag) sessionStorage.removeItem('phf-door-open-on-floor');
		} catch {
			/* private mode, etc. */
		}
		if (!flag) return;
		showDoors = true;
		const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
		const openTimer = setTimeout(() => { doorsOpen = true; }, reduceMotion ? 0 : 120);
		const hideTimer = setTimeout(() => { showDoors = false; }, reduceMotion ? 300 : 900);
		return () => {
			clearTimeout(openTimer);
			clearTimeout(hideTimer);
		};
	});
</script>

<TradingFloor />

{#if showDoors}
	<div class="floor-doors" aria-hidden="true">
		<div class="door left" class:open={doorsOpen}></div>
		<div class="door right" class:open={doorsOpen}></div>
	</div>
{/if}

<style>
	.floor-doors {
		position: fixed;
		inset: 0;
		z-index: 900;
		pointer-events: none;
		overflow: hidden;
	}
	.door {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 50%;
		background: linear-gradient(90deg, #6a6155 0%, #474036 90%);
		border: 4px solid #17130f;
		box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.35);
		transition: transform 0.7s cubic-bezier(0.6, 0, 0.4, 1);
	}
	.door.left {
		left: 0;
		transform: translateX(0);
	}
	.door.left.open {
		transform: translateX(-101%);
	}
	.door.right {
		right: 0;
		transform: translateX(0);
	}
	.door.right.open {
		transform: translateX(101%);
	}
	@media (prefers-reduced-motion: reduce) {
		.door {
			transition: none;
		}
	}
</style>
