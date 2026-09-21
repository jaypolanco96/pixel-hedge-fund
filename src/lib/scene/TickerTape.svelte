<script lang="ts">
	import { dev } from '$app/environment';
	import type { Bias, QuoteResponse } from '$lib/data/types';
	import { SYMBOLS, resolveSymbol, spotWireSymbol } from '$lib/data/symbols';

	let {
		quotes = [],
		activeDisplay = 'SOLUSDT',
		market = 'futures',
		bias = 'FLAT'
	}: {
		quotes?: QuoteResponse[];
		activeDisplay?: string;
		market?: 'futures' | 'spot';
		bias?: Bias;
	} = $props();

	function fmtPrice(q: QuoteResponse): string {
		const def = resolveSymbol(q.display);
		const known = SYMBOLS.some((s) => s.display === q.display);
		return q.price.toFixed(q.decimals ?? (known ? def.decimals : q.price < 1 ? 8 : 4));
	}

	function label(q: QuoteResponse): string {
		return q.label ? `${q.label}.${q.venue ?? 'WIRE'}` : market === 'spot' ? spotWireSymbol(q.display) : q.display;
	}

	function fmtChg(q: QuoteResponse): string {
		if (q.change24h == null) return '';
		return `${q.change24h >= 0 ? '+' : ''}${q.change24h.toFixed(2)}%`;
	}

	const items = $derived.by(() => {
		const rows =
			quotes.length > 0
				? quotes.map((q) => {
						return `${label(q)} ${fmtPrice(q)} ${fmtChg(q)}`.trim();
					})
				: [`${activeDisplay} -`];
		const active = quotes.find((q) => q.display === activeDisplay);
		const activeDef = resolveSymbol(activeDisplay);
		const activeLabel = active?.label
			? `${active.label}.${active.venue ?? 'WIRE'}`
			: market === 'spot'
				? spotWireSymbol(activeDisplay)
				: activeDef.bybit;
		const markLine = active
			? `${activeLabel} MARK ${active.mark.toFixed(active.decimals ?? activeDef.decimals)}`
			: `${market === 'spot' ? spotWireSymbol(activeDisplay) : activeDef.bybit} MARK -`;
		return [
			...rows,
			markLine,
			`DESK ${activeDisplay} . BIAS ${bias}`,
			'RESEARCH / DISCIPLINE / RETURNS',
			'RISK FIRST . SIZE SECOND',
			dev ? 'SAMPLE' : 'LIVE'
		];
	});
</script>

<div class="tape" data-bias={bias}>
	<div class="track">
		{#each [0, 1] as copy}
			<div class="sequence" aria-hidden={copy === 1}>
				{#each items as item}<span>{item}</span><i>*</i>{/each}
			</div>
		{/each}
	</div>
</div>

<style>
	.tape {
		height: 20px;
		overflow: hidden;
		background: #14130e;
		border-block: 2px solid #70512c;
		color: #79dfa0;
		font: 8px var(--mono, monospace);
		letter-spacing: 0.08em;
		box-shadow: inset 0 0 8px #000;
		display: flex;
		align-items: center;
	}
	.tape[data-bias='SHORT'] {
		color: #f47764;
	}
	.tape[data-bias='FLAT'] {
		color: #d8bb71;
	}
	.track {
		display: flex;
		width: max-content;
		animation: scroll 48s linear infinite;
	}
	.sequence {
		display: flex;
		align-items: center;
		white-space: nowrap;
	}
	.sequence span {
		padding: 0 12px;
	}
	.sequence i {
		font-style: normal;
		opacity: 0.35;
		font-size: 5px;
	}
	@keyframes scroll {
		to {
			transform: translateX(-50%);
		}
	}
	@media (max-width: 768px) {
		.tape {
			height: 24px;
			font-size: 10px;
		}
		.sequence span {
			padding: 0 10px;
		}
	}
	@media (max-width: 480px) {
		.tape {
			height: 22px;
			font-size: 9px;
			letter-spacing: 0.04em;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.track {
			animation: none;
		}
	}
</style>
