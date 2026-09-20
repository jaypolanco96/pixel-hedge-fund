<script lang="ts">
	import type { Bias, QuoteResponse } from '$lib/data/types';
	import { resolveSymbol } from '$lib/data/symbols';

	let {
		quotes = [],
		activeDisplay = 'SOLUSDT',
		bias = 'FLAT'
	}: {
		quotes?: QuoteResponse[];
		activeDisplay?: string;
		bias?: Bias;
	} = $props();

	function fmtPrice(q: QuoteResponse): string {
		const def = resolveSymbol(q.display);
		return q.price.toFixed(def.decimals);
	}

	function fmtChg(q: QuoteResponse): string {
		if (q.change24h == null) return '';
		return `${q.change24h >= 0 ? '+' : ''}${q.change24h.toFixed(2)}%`;
	}

	const items = $derived.by(() => {
		const rows =
			quotes.length > 0
				? quotes.map((q) => {
						const tag = q.sample ? ' SAMPLE' : '';
						return `${q.display} ${fmtPrice(q)} ${fmtChg(q)}${tag}`.trim();
					})
				: [`${activeDisplay} —`];
		const active = quotes.find((q) => q.display === activeDisplay);
		const markLine = active
			? `${resolveSymbol(active.display).kraken} MARK ${active.mark.toFixed(resolveSymbol(active.display).decimals)}${active.sample ? ' SAMPLE' : ''}`
			: `${resolveSymbol(activeDisplay).kraken} MARK —`;
		const anySample = quotes.some((q) => q.sample);
		const allSample = quotes.length > 0 && quotes.every((q) => q.sample);
		return [
			...rows,
			markLine,
			`DESK ${activeDisplay} · BIAS ${bias}`,
			'RESEARCH / DISCIPLINE / RETURNS',
			'RISK FIRST · SIZE SECOND',
			allSample ? 'SAMPLE DATA' : anySample ? 'MIXED LIVE / SAMPLE' : 'KRAKEN FUTURES LIVE'
		];
	});
</script>

<div class="tape" data-bias={bias}>
	<div class="track">
		{#each [0, 1] as copy}
			<div class="sequence" aria-hidden={copy === 1}>
				{#each items as item}<span>{item}</span><i>◆</i>{/each}
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
