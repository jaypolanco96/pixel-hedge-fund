<script lang="ts">
	import type { Bar, Bias } from '$lib/data/types';

	let {
		bars = [],
		bias = 'FLAT',
		label = 'PF_SOLUSD · 15M',
		showLevels = false,
		stop,
		tp1,
		tp2
	}: {
		bars?: Bar[];
		bias?: Bias;
		label?: string;
		showLevels?: boolean;
		stop?: number;
		tp1?: number;
		tp2?: number;
	} = $props();

	const view = $derived(bars.slice(-38));
	const lo = $derived.by(() => {
		const values = view.flatMap((b) => [b.l, showLevels ? stop ?? b.l : b.l, showLevels ? tp2 ?? b.l : b.l]);
		return values.length ? Math.min(...values) : 0;
	});
	const hi = $derived.by(() => {
		const values = view.flatMap((b) => [b.h, showLevels ? tp2 ?? b.h : b.h, showLevels ? stop ?? b.h : b.h]);
		return values.length ? Math.max(...values) : 1;
	});
	const range = $derived(Math.max(hi - lo, 0.0001));

	function y(value: number) {
		return 63 - ((value - lo) / range) * 48;
	}
</script>

<div class="mini-chart" data-bias={bias}>
	<div class="screen-label">{label}</div>
	<svg viewBox="0 0 180 70" preserveAspectRatio="none" aria-label="Live 15 minute candle snippet">
		<g class="grid">
			<path d="M0 18H180M0 34H180M0 50H180M45 8V68M90 8V68M135 8V68" />
		</g>
		{#each view as b, i}
			{@const x = 4 + i * (172 / Math.max(view.length, 1))}
			{@const up = b.c >= b.o}
			<line class:up class:down={!up} x1={x} x2={x} y1={y(b.h)} y2={y(b.l)} />
			<rect class:up class:down={!up} x={x - 1.5} y={Math.min(y(b.o), y(b.c))} width="3" height={Math.max(1.5, Math.abs(y(b.o) - y(b.c)))} />
		{/each}
		{#if showLevels && stop != null}
			<line class="level stop" x1="0" x2="180" y1={y(stop)} y2={y(stop)} />
		{/if}
		{#if showLevels && tp1 != null}
			<line class="level tp" x1="0" x2="180" y1={y(tp1)} y2={y(tp1)} />
		{/if}
		{#if showLevels && tp2 != null}
			<line class="level tp two" x1="0" x2="180" y1={y(tp2)} y2={y(tp2)} />
		{/if}
	</svg>
	<div class="scan"></div>
</div>

<style>
	.mini-chart {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: #07110d;
		color: #70e6a8;
		font-family: var(--mono, monospace);
	}
	.screen-label {
		position: absolute;
		top: 2px;
		left: 4px;
		z-index: 2;
		font-size: 5px;
		letter-spacing: 0.08em;
		opacity: 0.8;
	}
	svg { width: 100%; height: 100%; overflow: visible; }
	.grid path { fill: none; stroke: rgba(88, 160, 125, 0.15); stroke-width: 0.5; }
	line.up, rect.up { stroke: #73f3aa; fill: #73f3aa; stroke-width: 0.8; }
	line.down, rect.down { stroke: #ff745f; fill: #ff745f; stroke-width: 0.8; }
	.level { stroke-width: 0.8; stroke-dasharray: 3 2; }
	.level.stop { stroke: #ff745f; }
	.level.tp { stroke: #f7cf74; }
	.level.two { opacity: 0.55; }
	.scan {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: repeating-linear-gradient(0deg, transparent 0 2px, rgba(0,0,0,.2) 2px 3px);
		box-shadow: inset 0 0 14px rgba(40, 255, 130, 0.12);
	}
</style>
