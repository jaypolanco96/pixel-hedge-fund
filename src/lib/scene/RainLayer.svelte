<script lang="ts">
	let { intensity = 0 }: { intensity: number } = $props();

	const drops = $derived(
		Array.from({ length: Math.floor(40 + intensity * 60) }, (_, i) => ({
			id: i,
			left: (i * 37 + (i % 7) * 13) % 100,
			delay: (i * 0.07) % 1.8,
			dur: 0.45 + (i % 5) * 0.08,
			len: 8 + (i % 4) * 4,
			opacity: 0.25 + (i % 3) * 0.15
		}))
	);
</script>

{#if intensity > 0.05}
	<div class="rain" style:--intensity={intensity} aria-hidden="true">
		{#each drops as d (d.id)}
			<span
				class="drop"
				style:left="{d.left}%"
				style:--delay="{d.delay}s"
				style:--dur="{d.dur}s"
				style:--len="{d.len}px"
				style:opacity={d.opacity * intensity}
			></span>
		{/each}
		<div class="glass-sheen"></div>
	</div>
{/if}

<style>
	.rain {
		position: absolute;
		inset: 0;
		pointer-events: none;
		overflow: hidden;
		z-index: 5;
	}
	.drop {
		position: absolute;
		top: -20px;
		width: 2px;
		height: var(--len);
		background: linear-gradient(180deg, transparent, rgba(168, 197, 216, 0.85));
		animation: fall var(--dur) linear var(--delay) infinite;
		image-rendering: pixelated;
	}
	@keyframes fall {
		0% {
			transform: translateY(0) translateX(0);
		}
		100% {
			transform: translateY(220px) translateX(12px);
		}
	}
	.glass-sheen {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			115deg,
			transparent 40%,
			rgba(168, 197, 216, calc(0.08 * var(--intensity))) 50%,
			transparent 60%
		);
		mix-blend-mode: screen;
	}
</style>
