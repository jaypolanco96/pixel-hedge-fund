<script lang="ts">
	import type { QuoteResponse, Side } from '$lib/data/types';

	let {
		open = $bindable(false),
		quote = null,
		priceDecimals = 2,
		activeDisplay = 'SOLUSDT'
	}: {
		open?: boolean;
		quote?: QuoteResponse | null;
		priceDecimals?: number;
		activeDisplay?: string;
	} = $props();

	let side = $state<Side>('long');
	let entry = $state(0);
	let exitPx = $state(0);
	let size = $state(1);
	let leverage = $state(10);
	let feeBps = $state(4); // round-trip bps optional
	let seeded = $state(false);

	const priceMove = $derived.by(() => {
		if (!entry || !exitPx) return 0;
		return side === 'long' ? exitPx - entry : entry - exitPx;
	});
	const pnlUsd = $derived(priceMove * size);
	const notional = $derived(entry * size);
	const margin = $derived(leverage > 0 ? notional / leverage : 0);
	const feeUsd = $derived(notional * (feeBps / 10000) * 2); // entry+exit
	const netPnl = $derived(pnlUsd - feeUsd);
	const pnlPctPrice = $derived(entry ? (priceMove / entry) * 100 : 0);
	const pnlPctMargin = $derived(margin ? (netPnl / margin) * 100 : 0);
	/** Rough isolated liq: entry * (1 ± 1/lev) ignoring fees/maintenance */
	const liqEst = $derived.by(() => {
		if (!entry || leverage < 1) return null;
		const buf = 1 / leverage;
		return side === 'long' ? entry * (1 - buf) : entry * (1 + buf);
	});

	function close() {
		open = false;
	}

	function onKey(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
		}
	}

	function fmt(n: number | null | undefined, d = 2) {
		if (n == null || !Number.isFinite(n)) return '—';
		return n.toFixed(d);
	}

	function seedFromQuote() {
		const m = quote?.mark || quote?.price;
		if (m && Number.isFinite(m)) {
			entry = Number(m.toFixed(priceDecimals));
			exitPx = Number((m * (side === 'long' ? 1.02 : 0.98)).toFixed(priceDecimals));
			seeded = true;
		}
	}

	$effect(() => {
		if (!open) {
			seeded = false;
			return;
		}
		if (!seeded) seedFromQuote();
	});
</script>

<svelte:window onkeydown={onKey} />

{#if open}
	<div class="backdrop" role="presentation" onclick={close}></div>
	<div class="console" role="dialog" aria-modal="true" aria-label="Profit calculator">
		<header class="titlebar">
			<div class="leds"><i class="on"></i><i></i><i></i></div>
			<strong>P&amp;L CALC · {activeDisplay}</strong>
			<button type="button" class="x" onclick={close} aria-label="Close profit calculator">×</button>
		</header>

		<div class="body">
			<div class="sides">
				<button type="button" class:on={side === 'long'} onclick={() => (side = 'long')}>LONG</button>
				<button
					type="button"
					class:on={side === 'short'}
					class="short"
					onclick={() => (side = 'short')}>SHORT</button
				>
			</div>

			<div class="grid">
				<label
					>ENTRY<input type="number" step="any" bind:value={entry} aria-label="Entry price" /></label
				>
				<label
					>EXIT<input type="number" step="any" bind:value={exitPx} aria-label="Exit price" /></label
				>
				<label
					>SIZE<input type="number" min="0" step="any" bind:value={size} aria-label="Size" /></label
				>
				<label
					>LEVERAGE<input
						type="number"
						min="1"
						max="1000"
						step="1"
						bind:value={leverage}
						aria-label="Leverage"
					/></label
				>
				<label class="wide"
					>FEES (bps/side)<input
						type="number"
						min="0"
						step="0.1"
						bind:value={feeBps}
						aria-label="Fee basis points per side"
					/></label
				>
			</div>

			<button type="button" class="seed" onclick={seedFromQuote}>SEED FROM MARK</button>

			<dl class="results">
				<div>
					<dt>$ P&amp;L (gross)</dt>
					<dd class={pnlUsd >= 0 ? 'pos' : 'neg'}>{pnlUsd >= 0 ? '+' : ''}{fmt(pnlUsd, 2)}</dd>
				</div>
				<div>
					<dt>FEES (est.)</dt>
					<dd class="neg">−{fmt(feeUsd, 2)}</dd>
				</div>
				<div>
					<dt>$ P&amp;L (net)</dt>
					<dd class={netPnl >= 0 ? 'pos' : 'neg'}>{netPnl >= 0 ? '+' : ''}{fmt(netPnl, 2)}</dd>
				</div>
				<div>
					<dt>% PRICE</dt>
					<dd class={pnlPctPrice >= 0 ? 'pos' : 'neg'}
						>{pnlPctPrice >= 0 ? '+' : ''}{fmt(pnlPctPrice, 3)}%</dd
					>
				</div>
				<div>
					<dt>% MARGIN</dt>
					<dd class={pnlPctMargin >= 0 ? 'pos' : 'neg'}
						>{pnlPctMargin >= 0 ? '+' : ''}{fmt(pnlPctMargin, 2)}%</dd
					>
				</div>
				<div>
					<dt>NOTIONAL</dt>
					<dd>${fmt(notional, 2)}</dd>
				</div>
				<div>
					<dt>MARGIN</dt>
					<dd>${fmt(margin, 2)}</dd>
				</div>
				<div>
					<dt>LIQ (rough)</dt>
					<dd class="neg">{liqEst == null ? '—' : fmt(liqEst, priceDecimals)}</dd>
				</div>
			</dl>
			<p class="hint">Isolated rough liq ≈ entry ± 1/lev. Esc / × closes.</p>
		</div>
		<footer>DESK CALCULATOR · offline math only</footer>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 200000;
		background: rgba(8, 4, 2, 0.62);
	}
	.console {
		position: fixed;
		z-index: 200001;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(400px, calc(100vw - 24px));
		max-height: min(700px, calc(100vh - 24px));
		display: flex;
		flex-direction: column;
		background: #0e1206;
		color: #b8e0be;
		border: 4px solid #3a5a3a;
		box-shadow:
			0 0 0 2px #0a120a,
			8px 8px 0 rgba(0, 0, 0, 0.55),
			inset 0 0 40px rgba(120, 255, 140, 0.06);
		font-family: var(--mono, 'Courier New', monospace);
	}
	.titlebar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		background: #141f0c;
		border-bottom: 2px solid #3a5a3a;
		font-size: 10px;
		letter-spacing: 0.08em;
	}
	.leds {
		display: flex;
		gap: 4px;
	}
	.leds i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #1a2e1a;
		border: 1px solid #3a5a3a;
	}
	.leds i.on {
		background: #7dffb0;
		box-shadow: 0 0 6px #7dffb0;
	}
	.titlebar strong {
		flex: 1;
	}
	.x {
		background: transparent;
		border: 1px solid #3a5a3a;
		color: #b8e0be;
		width: 24px;
		height: 24px;
		cursor: pointer;
		font-size: 16px;
	}
	.body {
		padding: 12px;
		overflow: auto;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.sides {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
	}
	.sides button {
		padding: 8px;
		background: #0a140a;
		border: 2px solid #3a5a3a;
		color: #6a8a6a;
		font: 10px var(--mono, monospace);
		letter-spacing: 0.1em;
		cursor: pointer;
	}
	.sides button.on {
		background: #1a3a28;
		border-color: #4a8a62;
		color: #7dffb0;
	}
	.sides button.short.on {
		background: #3a1a18;
		border-color: #8a4a42;
		color: #ff8a7a;
	}
	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.grid label {
		display: flex;
		flex-direction: column;
		gap: 3px;
		font-size: 7px;
		letter-spacing: 0.06em;
		opacity: 0.9;
	}
	.grid label.wide {
		grid-column: 1 / -1;
	}
	.grid input {
		background: #0a140a;
		border: 1px solid #3a5a3a;
		color: #b8e0be;
		font: 11px var(--mono, monospace);
		padding: 6px 8px;
	}
	.seed {
		align-self: flex-start;
		background: #1a2a14;
		border: 1px solid #4a6a3a;
		color: #9dffc0;
		font: 8px var(--mono, monospace);
		padding: 5px 10px;
		cursor: pointer;
		letter-spacing: 0.06em;
	}
	.results {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px 10px;
		margin: 0;
		padding: 8px;
		background: #0a140a;
		border: 1px solid #3a5a3a;
	}
	.results div {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 8px;
	}
	.results dt {
		opacity: 0.6;
	}
	.results dd {
		margin: 0;
		font-size: 12px;
		font-weight: 700;
	}
	.pos {
		color: #7dffb0;
	}
	.neg {
		color: #ff8a7a;
	}
	.hint {
		margin: 0;
		font-size: 8px;
		opacity: 0.65;
	}
	footer {
		padding: 6px 10px;
		border-top: 2px solid #3a5a3a;
		font-size: 7px;
		opacity: 0.7;
		background: #0a140a;
	}
</style>
