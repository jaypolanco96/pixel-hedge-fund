<script lang="ts">
	import MiniChart from './MiniChart.svelte';
	import { SYMBOLS } from '$lib/data/symbols';
	import {
		loadDeskNotes,
		saveDeskNotes,
		newDeskNoteId,
		type DeskNote
	} from '$lib/persist/deskNotes';
	import type { Bar, QuoteResponse, SignalResponse } from '$lib/data/types';

	type Tab = 'chart' | 'quote' | 'signal' | 'watch' | 'notes';

	let {
		open = $bindable(false),
		bars = [],
		quote = null,
		signal = null,
		tapeQuotes = [],
		activeDisplay = 'SOLUSDT',
		priceDecimals = 2,
		onSelectSymbol = (_d: string) => {}
	}: {
		open?: boolean;
		bars?: Bar[];
		quote?: QuoteResponse | null;
		signal?: SignalResponse | null;
		tapeQuotes?: QuoteResponse[];
		activeDisplay?: string;
		priceDecimals?: number;
		onSelectSymbol?: (display: string) => void;
	} = $props();

	let tab = $state<Tab>('chart');
	let notes = $state<DeskNote[]>([]);
	let draft = $state('');

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

	function fmt(n: number | undefined | null, d = priceDecimals) {
		if (n == null || !Number.isFinite(n)) return '-';
		return n.toFixed(d);
	}

	function fmtTime(t: number) {
		try {
			return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
		} catch {
			return '-';
		}
	}

	function addNote() {
		const text = draft.trim();
		if (!text) return;
		const next: DeskNote[] = [
			{ id: newDeskNoteId(), text, createdAt: Date.now(), symbol: activeDisplay },
			...notes
		].slice(0, 40);
		notes = next;
		saveDeskNotes(next);
		draft = '';
	}

	function removeNote(id: string) {
		const next = notes.filter((n) => n.id !== id);
		notes = next;
		saveDeskNotes(next);
	}

	$effect(() => {
		if (!open) return;
		notes = loadDeskNotes();
	});

	const bias = $derived(signal?.bias ?? 'FLAT');
	const recentPrints = $derived(
		[...tapeQuotes]
			.filter((q) => q?.t)
			.sort((a, b) => (b.t ?? 0) - (a.t ?? 0))
			.slice(0, 8)
	);
</script>

<svelte:window onkeydown={onKey} />

{#if open}
	<div class="backdrop" role="presentation" onclick={close}></div>
	<div
		class="console"
		role="dialog"
		aria-modal="true"
		aria-label="Desk CRT terminal"
	>
		<header class="titlebar">
			<div class="leds">
				<i class:on={!quote?.sample}></i>
				<i class:live={!quote?.sample && !!quote}></i>
				<i class:ok={!!signal}></i>
			</div>
			<strong>DESK CRT . {activeDisplay}</strong>
			<button type="button" class="x" onclick={close} aria-label="Close desk CRT">x</button>
		</header>

		<nav class="tabs" aria-label="CRT sections">
			{#each [
				['chart', 'CHART'],
				['quote', 'QUOTE'],
				['signal', 'SIGNAL'],
				['watch', 'WATCH'],
				['notes', 'NOTES']
			] as [id, label]}
				<button
					type="button"
					class:active={tab === id}
					onclick={() => (tab = id as Tab)}>{label}</button
				>
			{/each}
		</nav>

		<div class="body">
			{#if tab === 'chart'}
				<section class="panel chart-panel">
					<h3>15M CANDLES . {activeDisplay}</h3>
					<div class="chart-wrap">
						<MiniChart
							{bars}
							{bias}
							label={`${activeDisplay} . ${!signal ? 'CONNECTING' : signal.sample ? 'SAMPLE' : 'LIVE DESK'}`}
							showLevels={!!signal}
							stop={signal?.risk.stop}
							tp1={signal?.risk.tp1}
							tp2={signal?.risk.tp2}
						/>
					</div>
					{#if signal}
						<p class="meta">
							SL {fmt(signal.risk.stop)} . TP1 {fmt(signal.risk.tp1)} . TP2 {fmt(signal.risk.tp2)}
							. {signal.sample ? 'SAMPLE' : signal.provider.toUpperCase()}
						</p>
					{:else}
						<p class="empty">Waiting on tape wire...</p>
					{/if}
				</section>
			{:else if tab === 'quote'}
				<section class="panel">
					<h3>TICKER READOUT</h3>
					{#if quote}
						<div class="equity">
							<small>{quote.display} . {quote.symbol}</small>
							<strong>{fmt(quote.price)}</strong>
							<em
								>{quote.sample ? 'SAMPLE' : `${quote.provider.toUpperCase()} LIVE`} . mark {fmt(quote.mark)} . {fmtTime(
									quote.t
								)}</em
							>
						</div>
						<dl>
							<div><dt>BID</dt><dd>{fmt(quote.bid)}</dd></div>
							<div><dt>ASK</dt><dd>{fmt(quote.ask)}</dd></div>
							<div><dt>SPREAD</dt><dd>{fmt((quote.ask ?? 0) - (quote.bid ?? 0), Math.max(priceDecimals, 4))}</dd></div>
							<div>
								<dt>24H DELTA</dt>
								<dd class={quote.change24h != null && quote.change24h >= 0 ? 'pos' : 'neg'}>
									{quote.change24h == null
										? '-'
										: `${quote.change24h >= 0 ? '+' : ''}${quote.change24h.toFixed(2)}%`}
								</dd>
							</div>
							<div><dt>PROVIDER</dt><dd>{quote.provider}</dd></div>
						</dl>
					{:else}
						<p class="empty">No quote - connecting...</p>
					{/if}
				</section>
			{:else if tab === 'signal'}
				<section class="panel">
					<h3>TA SIGNAL SNAPSHOT</h3>
					{#if signal}
						<div class="bias-row" data-bias={signal.bias}>
							<strong>{signal.bias}</strong>
							<span>conf {signal.confluence}/6 . {signal.confluenceBand}</span>
							<em>{signal.sample ? 'SAMPLE' : 'LIVE'} . {signal.tf}</em>
						</div>
						<dl>
							<div><dt>LAST</dt><dd>{fmt(signal.last)}</dd></div>
							<div><dt>RSI</dt><dd>{signal.rsi.toFixed(1)}</dd></div>
							<div>
								<dt>EMA 21/55</dt>
								<dd>{fmt(signal.ema['21'])} / {fmt(signal.ema['55'])}</dd>
							</div>
							<div>
								<dt>SUPERTRND</dt>
								<dd>
									{fmt(signal.supertrend.value)}
									{signal.supertrend.direction === 1 ? '↑' : '↓'}
								</dd>
							</div>
							<div><dt>MACD HIST</dt><dd>{signal.macd.hist.toFixed(3)}</dd></div>
							<div>
								<dt>ATR / VOL</dt>
								<dd>{signal.atr.pct.toFixed(2)}% {signal.atr.state.toUpperCase()}</dd>
							</div>
							<div><dt>STRUCTURE</dt><dd>{signal.structure.toUpperCase()}</dd></div>
							<div>
								<dt>MTF</dt>
								<dd>
									4H {signal.mtf.regime} / 15M {signal.mtf.setup}
									{signal.mtf.aligned ? ' . ALIGNED' : ' . COUNTER'}
								</dd>
							</div>
							<div><dt>SL</dt><dd class="neg">{fmt(signal.risk.stop)}</dd></div>
							<div><dt>TP1 / TP2</dt><dd>{fmt(signal.risk.tp1)} / {fmt(signal.risk.tp2)}</dd></div>
						</dl>
					{:else}
						<p class="empty">No signal yet.</p>
					{/if}
				</section>
			{:else if tab === 'watch'}
				<section class="panel">
					<h3>WATCHLIST . SWITCH PAIR</h3>
					<ul class="watch">
						{#each SYMBOLS as s (s.display)}
							{@const tq = tapeQuotes.find((q) => q.display === s.display)}
							<li class:active={s.display === activeDisplay}>
								<button type="button" onclick={() => onSelectSymbol(s.display)}>
									<span class="sym">{s.display}</span>
									<span class="px">{tq ? fmt(tq.price, s.decimals) : '-'}</span>
									<span class="tag">{tq?.sample ? 'SAMPLE' : tq ? 'LIVE' : '...'}</span>
								</button>
							</li>
						{/each}
					</ul>
				</section>
			{:else}
				<section class="panel">
					<h3>NOTES / RECENT PRINTS</h3>
					<div class="prints">
						<small>TAPE PRINTS</small>
						{#if recentPrints.length === 0}
							<p class="empty">No tape ticks yet.</p>
						{:else}
							<ul>
								{#each recentPrints as p (p.display)}
									<li>
										<b>{p.display}</b>
										<span>{fmt(p.price, SYMBOLS.find((s) => s.display === p.display)?.decimals ?? 2)}</span>
										<em>{p.sample ? 'SAMPLE' : fmtTime(p.t)}</em>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
					<form
						class="note-form"
						onsubmit={(e) => {
							e.preventDefault();
							addNote();
						}}
					>
						<input
							bind:value={draft}
							maxlength="200"
							placeholder="Scratch note..."
							aria-label="Desk note"
						/>
						<button type="submit">ADD</button>
					</form>
					<ul class="notes">
						{#each notes as n (n.id)}
							<li>
								<div>
									{#if n.symbol}<span class="sym">{n.symbol}</span>{/if}
									{n.text}
									<em>{fmtTime(n.createdAt)}</em>
								</div>
								<button type="button" class="del" onclick={() => removeNote(n.id)} aria-label="Delete note"
									>x</button
								>
							</li>
						{:else}
							<li class="empty-li">No notes yet - scribble above.</li>
						{/each}
					</ul>
				</section>
			{/if}
		</div>
		<footer>Esc / x closes . office CRT . real tape only</footer>
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
		width: min(540px, calc(100vw - 24px));
		max-height: min(760px, calc(100vh - 24px));
		display: flex;
		flex-direction: column;
		background: #06120d;
		color: #72e3a3;
		border: 4px solid #2f5a42;
		box-shadow:
			0 0 0 2px #0a1a12,
			8px 8px 0 rgba(0, 0, 0, 0.55),
			inset 0 0 40px rgba(40, 255, 140, 0.08);
		font-family: var(--mono, 'Courier New', monospace);
		text-shadow: 0 0 4px rgba(80, 255, 150, 0.25);
	}
	.titlebar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		background: #0c1f16;
		border-bottom: 2px solid #2f5a42;
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
		background: #1a2e24;
		border: 1px solid #3a5a48;
	}
	.leds i.on {
		background: #c9a040;
	}
	.leds i.live {
		background: #3ecf7a;
		box-shadow: 0 0 6px #3ecf7a;
	}
	.leds i.ok {
		background: #5a9eef;
	}
	.titlebar strong {
		flex: 1;
	}
	.x {
		background: transparent;
		border: 1px solid #2f5a42;
		color: #72e3a3;
		width: 24px;
		height: 24px;
		cursor: pointer;
		font-size: 16px;
		line-height: 1;
	}
	.x:hover {
		background: #143226;
	}
	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
		padding: 6px 8px;
		background: #0a1a12;
		border-bottom: 2px solid #2f5a42;
	}
	.tabs button {
		background: #0c1f16;
		border: 1px solid #2f5a42;
		color: #5aa87a;
		font: 8px/1 var(--mono, monospace);
		letter-spacing: 0.06em;
		padding: 5px 8px;
		cursor: pointer;
	}
	.tabs button.active {
		background: #143226;
		color: #9dffc0;
		border-color: #4a8a62;
	}
	.body {
		flex: 1;
		overflow: auto;
		padding: 10px 12px 12px;
	}
	.panel h3 {
		margin: 0 0 10px;
		font-size: 10px;
		letter-spacing: 0.1em;
		color: #9dffc0;
	}
	.chart-wrap {
		height: 180px;
		border: 2px solid #1a3a2a;
		background: #07110d;
	}
	.meta {
		margin: 8px 0 0;
		font-size: 8px;
		opacity: 0.85;
	}
	.equity {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 12px;
		padding: 10px;
		background: #0a1a12;
		border: 2px solid #2f5a42;
	}
	.equity small {
		font-size: 8px;
		opacity: 0.75;
	}
	.equity strong {
		font-size: 22px;
		color: #b8ffd0;
	}
	.equity em {
		font-size: 8px;
		font-style: normal;
		opacity: 0.7;
	}
	dl {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px 12px;
		margin: 0;
	}
	dl div {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		padding: 4px 0;
		border-bottom: 1px solid rgba(47, 90, 66, 0.45);
		font-size: 9px;
	}
	dt {
		opacity: 0.65;
	}
	dd {
		margin: 0;
		font-weight: 700;
	}
	.pos {
		color: #7dffb0;
	}
	.neg {
		color: #ff8a7a;
	}
	.bias-row {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 10px;
		margin-bottom: 12px;
		padding: 8px 10px;
		background: #0a1a12;
		border: 2px solid #2f5a42;
	}
	.bias-row[data-bias='LONG'] strong {
		color: #7dffb0;
	}
	.bias-row[data-bias='SHORT'] strong {
		color: #ff8a7a;
	}
	.bias-row[data-bias='FLAT'] strong {
		color: #e9c76d;
	}
	.bias-row span,
	.bias-row em {
		font-size: 8px;
		font-style: normal;
		opacity: 0.8;
	}
	.watch {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.watch button {
		width: 100%;
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: 10px;
		align-items: center;
		padding: 7px 8px;
		background: #0a1a12;
		border: 1px solid #2f5a42;
		color: #72e3a3;
		font: 9px var(--mono, monospace);
		cursor: pointer;
		text-align: left;
	}
	.watch li.active button {
		border-color: #efc870;
		background: #143226;
		color: #b8ffd0;
	}
	.watch .tag {
		font-size: 7px;
		opacity: 0.7;
	}
	.prints {
		margin-bottom: 12px;
		padding: 8px;
		background: #0a1a12;
		border: 1px solid #2f5a42;
	}
	.prints small {
		display: block;
		margin-bottom: 6px;
		font-size: 7px;
		letter-spacing: 0.08em;
		opacity: 0.7;
	}
	.prints ul,
	.notes {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.prints li {
		display: grid;
		grid-template-columns: 70px 1fr auto;
		gap: 8px;
		font-size: 8px;
		padding: 3px 0;
		border-bottom: 1px solid rgba(47, 90, 66, 0.35);
	}
	.prints em {
		font-style: normal;
		opacity: 0.6;
	}
	.note-form {
		display: flex;
		gap: 6px;
		margin-bottom: 8px;
	}
	.note-form input {
		flex: 1;
		background: #0a1a12;
		border: 1px solid #2f5a42;
		color: #72e3a3;
		font: 9px var(--mono, monospace);
		padding: 6px 8px;
	}
	.note-form button {
		background: #143226;
		border: 1px solid #4a8a62;
		color: #9dffc0;
		font: 8px var(--mono, monospace);
		padding: 0 10px;
		cursor: pointer;
	}
	.notes li {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		padding: 6px 0;
		border-bottom: 1px solid rgba(47, 90, 66, 0.35);
		font-size: 8px;
	}
	.notes .sym {
		display: inline-block;
		margin-right: 6px;
		color: #e9c76d;
	}
	.notes em {
		display: block;
		margin-top: 2px;
		font-style: normal;
		opacity: 0.55;
		font-size: 7px;
	}
	.del {
		background: transparent;
		border: 1px solid #5a3a3a;
		color: #ff8a7a;
		cursor: pointer;
		width: 22px;
		height: 22px;
		flex-shrink: 0;
	}
	.empty,
	.empty-li {
		font-size: 9px;
		opacity: 0.65;
		margin: 8px 0;
	}
	footer {
		padding: 6px 10px;
		border-top: 2px solid #2f5a42;
		font-size: 7px;
		opacity: 0.7;
		background: #0a1a12;
	}
</style>
