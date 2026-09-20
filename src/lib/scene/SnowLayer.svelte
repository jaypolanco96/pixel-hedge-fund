<script lang="ts">
	let {
		intensity = 0,
		reduceMotion = false
	}: {
		intensity: number;
		reduceMotion?: boolean;
	} = $props();

	const flakes = $derived(
		Array.from({ length: Math.floor(28 + intensity * 40) }, (_, i) => ({
			id: i,
			left: (i * 41 + (i % 11) * 7) % 100,
			delay: (i * 0.11) % 3.2,
			dur: 2.8 + (i % 6) * 0.45,
			size: 2 + (i % 3),
			drift: 8 + (i % 5) * 4,
			opacity: 0.35 + (i % 4) * 0.12
		}))
	);
</script>

{#if intensity > 0.05}
	<div
		class="snow"
		class:static={reduceMotion}
		style:--intensity={intensity}
		aria-hidden="true"
	>
		{#each flakes as f (f.id)}
			<span
				class="flake"
				style:left="{f.left}%"
				style:--delay="{f.delay}s"
				style:--dur="{f.dur}s"
				style:--size="{f.size}px"
				style:--drift="{f.drift}px"
				style:opacity={f.opacity * Math.min(1, intensity + 0.15)}
			></span>
		{/each}
		<div class="glass-frost"></div>
	</div>
{/if}

<style>
	.snow {
		position: absolute;
		inset: 0;
		pointer-events: none;
		overflow: hidden;
		z-index: 5;
	}
	.flake {
		position: absolute;
		top: -12px;
		width: var(--size);
		height: var(--size);
		background: #eef6ff;
		box-shadow: 0 0 1px rgba(255, 255, 255, 0.6);
		image-rendering: pixelated;
		border-radius: 1px;
		animation: drift var(--dur) linear var(--delay) infinite;
	}
	@keyframes drift {
		0% {
			transform: translateY(0) translateX(0);
		}
		50% {
			transform: translateY(110px) translateX(var(--drift));
		}
		100% {
			transform: translateY(220px) translateX(calc(var(--drift) * -0.4));
		}
	}
	.glass-frost {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			180deg,
			rgba(200, 220, 255, calc(0.04 * var(--intensity))) 0%,
			transparent 35%,
			rgba(220, 235, 255, calc(0.06 * var(--intensity))) 100%
		);
		mix-blend-mode: screen;
	}
	.snow.static .flake {
		animation: none;
		top: auto;
		/* Static dusting along the glass when motion is reduced */
		bottom: calc((var(--delay) / 3.2) * 70%);
		opacity: calc(0.2 + var(--intensity) * 0.25);
	}
	@media (prefers-reduced-motion: reduce) {
		.flake {
			animation: none;
			top: auto;
			bottom: calc((var(--delay) / 3.2) * 70%);
		}
	}
</style>
