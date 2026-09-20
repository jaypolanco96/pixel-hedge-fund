<script lang="ts">
	let {
		active = false,
		frame = 0
	}: {
		active?: boolean;
		frame?: number;
	} = $props();

	const pose = $derived.by(() => {
		if (!active) return 'hidden';
		if (frame < 4) return 'enter';
		if (frame < 28) return 'play';
		return 'exit';
	});

	const notePhase = $derived(frame % 4);
	const walkX = $derived(
		pose === 'enter' ? -40 + frame * 14 : pose === 'exit' ? 20 + (frame - 28) * 12 : 18
	);
</script>

{#if active}
	<div
		class="mariachi"
		data-pose={pose}
		style:--mx={`${walkX}px`}
		aria-label="Rare mariachi band performing on the floor"
	>
		<div class="band">
			{#each [0, 1, 2] as i}
				<div class="player" style:--i={i} class:strum={pose === 'play' && (frame + i) % 2 === 0}>
					<div class="sombrero"></div>
					<div class="face"></div>
					<div class="body"></div>
					<div class="guitar"></div>
				</div>
			{/each}
		</div>
		{#if pose === 'play'}
			<div class="notes" aria-hidden="true">
				<span style:--n={notePhase}>♪</span>
				<span style:--n={(notePhase + 1) % 4}>♫</span>
				<span style:--n={(notePhase + 2) % 4}>♬</span>
			</div>
		{/if}
		<div class="banner">MARIACHI!</div>
	</div>
{/if}

<style>
	.mariachi {
		position: absolute;
		left: 50%;
		bottom: 70px;
		z-index: 14;
		transform: translateX(calc(-50% + var(--mx, 0px)));
		pointer-events: none;
		image-rendering: pixelated;
		filter: drop-shadow(2px 2px 0 rgba(10, 5, 2, 0.45));
	}
	.mariachi[data-pose='exit'] {
		opacity: 0.55;
	}
	.band {
		display: flex;
		gap: 6px;
		align-items: flex-end;
	}
	.player {
		position: relative;
		width: 28px;
		height: 42px;
	}
	.sombrero {
		position: absolute;
		top: 0;
		left: 2px;
		width: 24px;
		height: 8px;
		background: #c9a03a;
		border: 2px solid #5a4018;
		border-radius: 50% 50% 20% 20%;
		z-index: 2;
	}
	.sombrero::after {
		content: '';
		position: absolute;
		left: 6px;
		top: -5px;
		width: 10px;
		height: 7px;
		background: #a87828;
		border: 1px solid #5a4018;
	}
	.face {
		position: absolute;
		top: 8px;
		left: 8px;
		width: 12px;
		height: 10px;
		background: #c88752;
		border: 1px solid #4a2d1e;
		z-index: 1;
	}
	.body {
		position: absolute;
		top: 18px;
		left: 5px;
		width: 18px;
		height: 16px;
		background: #2a4060;
		border: 2px solid #1a2838;
		clip-path: polygon(10% 0, 90% 0, 100% 100%, 0 100%);
	}
	.body::before {
		content: '';
		position: absolute;
		inset: 2px 4px;
		border: 1px solid #d7ae63;
		opacity: 0.7;
	}
	.guitar {
		position: absolute;
		top: 22px;
		left: 14px;
		width: 14px;
		height: 8px;
		background: #8b5a2b;
		border: 1px solid #3a2418;
		border-radius: 40%;
		transform-origin: left center;
	}
	.player.strum .guitar {
		transform: rotate(-18deg);
	}
	.notes {
		position: absolute;
		top: -14px;
		left: 8px;
		right: 0;
		display: flex;
		gap: 8px;
		color: #efc66f;
		font-size: 12px;
		text-shadow: 1px 1px #2a1c10;
	}
	.notes span {
		animation: note-float 0.8s ease-in-out infinite;
		animation-delay: calc(var(--n) * 0.12s);
	}
	@keyframes note-float {
		50% {
			transform: translateY(-4px);
			opacity: 0.7;
		}
	}
	.banner {
		margin-top: 2px;
		text-align: center;
		font: 7px/1 var(--mono, monospace);
		letter-spacing: 0.12em;
		color: #1a1512;
		background: #efc66f;
		border: 2px solid #5a4018;
		padding: 2px 6px;
	}
	@media (prefers-reduced-motion: reduce) {
		.notes span,
		.player.strum .guitar {
			animation: none !important;
			transform: none !important;
		}
	}
</style>
