import type { Bar, QuoteResponse, SignalResponse } from '$lib/data/types';

export type FaxReportId =
	| 'bias_brief'
	| 'supertrend_ema'
	| 'risk_card'
	| 'mtf_memo'
	| 'session_tape';

export interface FaxReportOption {
	id: FaxReportId;
	title: string;
	blurb: string;
}

export const FAX_REPORTS: FaxReportOption[] = [
	{
		id: 'bias_brief',
		title: 'Bias & confluence desk brief',
		blurb: 'Mandate bias, confluence band, structure tag, MACD/RSI snapshot.'
	},
	{
		id: 'supertrend_ema',
		title: 'Supertrend / EMA structure sheet',
		blurb: 'ST value & direction, EMA21/55 stack, last close vs structure.'
	},
	{
		id: 'risk_card',
		title: 'Risk card (SL · TP1/TP2 · ATR)',
		blurb: 'Stop, targets, risk %, ATR vol state — Chart Desk numbers only.'
	},
	{
		id: 'mtf_memo',
		title: 'Multi-timeframe alignment memo',
		blurb: '15m setup vs 4h regime alignment and tradeability note.'
	},
	{
		id: 'session_tape',
		title: 'Session tape / funding-style summary',
		blurb: 'Quote mark, 24h change, sample flag. Honest labels — no invented prices.'
	}
];

function line(s: string): string {
	return s;
}

function money(n: number | undefined | null, digits = 4): string {
	if (n == null || !Number.isFinite(n)) return '—';
	return n.toFixed(digits);
}

function pct(n: number | undefined | null, digits = 2): string {
	if (n == null || !Number.isFinite(n)) return '—';
	return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

function stamp(): string {
	return new Date().toLocaleString('en-US', {
		timeZone: 'America/New_York',
		hour12: true
	});
}

function header(title: string, symbol: string, sample: boolean): string[] {
	return [
		'════════════════════════════════════════',
		'  PIXEL HEDGE FUND · CHART DESK FAX',
		`  ${title.toUpperCase()}`,
		`  PAIR: ${symbol}   ${sample ? '*** SAMPLE DATA ***' : 'LIVE / KRAKEN FUTURES'}`,
		`  PRINTED: ${stamp()} ET`,
		'════════════════════════════════════════',
		''
	];
}

function footer(sample: boolean): string[] {
	return [
		'',
		'────────────────────────────────────────',
		sample
			? 'NOTE: SAMPLE — numbers are not live venue marks.'
			: 'NOTE: Prefer Chart Desk signal; never invent fills.',
		'PHF · Discipline · Research · Returns',
		'════════════════════════════════════════'
	];
}

function lastBarsNote(bars: Bar[]): string {
	if (!bars.length) return 'Candles: unavailable this print.';
	const last = bars[bars.length - 1];
	return `Last 15m bar O/H/L/C: ${money(last.o)} / ${money(last.h)} / ${money(last.l)} / ${money(last.c)}`;
}

export function buildFaxReport(
	id: FaxReportId,
	opts: {
		signal: SignalResponse | null;
		quote: QuoteResponse | null;
		bars: Bar[];
		displaySymbol: string;
		decimals?: number;
	}
): { title: string; body: string; sample: boolean } {
	const { signal, quote, bars, displaySymbol } = opts;
	const digits = opts.decimals ?? 4;
	const sample = !!(signal?.sample || quote?.sample || !signal);
	const sym = signal?.symbol ?? quote?.display ?? displaySymbol;
	const option = FAX_REPORTS.find((r) => r.id === id)!;
	const lines: string[] = [...header(option.title, sym, sample)];

	switch (id) {
		case 'bias_brief': {
			if (!signal) {
				lines.push('NO SIGNAL PAYLOAD — fax idle. Re-poll Tape Wire.');
				break;
			}
			lines.push(
				line(`BIAS:          ${signal.bias}`),
				line(`CONFLUENCE:    ${signal.confluence}/5  (${signal.confluenceBand})`),
				line(`STRUCTURE:     ${signal.structure}`),
				line(`RSI(14):       ${money(signal.rsi, 2)}`),
				line(
					`MACD:          line ${money(signal.macd.line)}  sig ${money(signal.macd.signal)}  hist ${money(signal.macd.hist)}`
				),
				line(`LAST (signal): ${money(signal.last, digits)}`),
				'',
				line(lastBarsNote(bars)),
				'',
				signal.confluenceBand === 'high'
					? 'DESK READ: High confluence — mandate desks may open.'
					: signal.confluenceBand === 'tradeable'
						? 'DESK READ: Tradeable band — selective desks considering / open.'
						: 'DESK READ: Weak confluence — watching / no invented fill.'
			);
			break;
		}
		case 'supertrend_ema': {
			if (!signal) {
				lines.push('NO SIGNAL — cannot print Supertrend / EMA sheet.');
				break;
			}
			const stArrow = signal.supertrend.direction === 1 ? 'BULL ↑' : 'BEAR ↓';
			const emaStack =
				signal.ema['21'] > signal.ema['55']
					? 'EMA21 > EMA55 (bullish stack)'
					: signal.ema['21'] < signal.ema['55']
						? 'EMA21 < EMA55 (bearish stack)'
						: 'EMA21 ≈ EMA55 (flat stack)';
			lines.push(
				line(`SUPERTREND:    ${money(signal.supertrend.value, digits)}  ${stArrow}`),
				line(`EMA 21:       ${money(signal.ema['21'], digits)}`),
				line(`EMA 55:       ${money(signal.ema['55'], digits)}`),
				line(`STACK:        ${emaStack}`),
				line(`CLOSE vs ST:  last ${money(signal.last, digits)} · stop/ST ${money(signal.risk.stop, digits)}`),
				line(`STRUCTURE:    ${signal.structure}`),
				'',
				line(lastBarsNote(bars))
			);
			break;
		}
		case 'risk_card': {
			if (!signal) {
				lines.push('NO SIGNAL — risk card blank.');
				break;
			}
			lines.push(
				line(`SIDE BIAS:     ${signal.bias}`),
				line(`STOP (ST):     ${money(signal.risk.stop, digits)}`),
				line(`TP1 (1.5R):    ${money(signal.risk.tp1, digits)}`),
				line(`TP2 (2.5R):    ${money(signal.risk.tp2, digits)}`),
				line(`RISK %:        ${money(signal.risk.risk_pct, 3)}%`),
				line(`RR @ TP1:      ${money(signal.risk.rr_tp1, 2)}`),
				line(`ATR(14):       ${money(signal.atr['14'], digits)}  (${money(signal.atr.pct, 3)}%)`),
				line(`VOL STATE:     ${signal.atr.state.toUpperCase()}`),
				'',
				line('Invalidation: Supertrend flip against position side.')
			);
			break;
		}
		case 'mtf_memo': {
			if (!signal) {
				lines.push('NO SIGNAL — MTF memo unavailable.');
				break;
			}
			lines.push(
				line(`SETUP (15m):   ${signal.mtf.setup}`),
				line(`REGIME (4h):   ${signal.mtf.regime}`),
				line(`ALIGNED:       ${signal.mtf.aligned ? 'YES' : 'NO'}`),
				line(`BIAS:          ${signal.bias}`),
				line(`CONFLUENCE:    ${signal.confluence}/5 (${signal.confluenceBand})`),
				'',
				signal.mtf.aligned
					? 'MEMO: Setup and regime agree — higher-quality desk bias.'
					: 'MEMO: Setup/regime diverge — prefer watching over forcing a fill.',
				'',
				line(`As-of: ${signal.asof}`)
			);
			break;
		}
		case 'session_tape': {
			const qSample = quote?.sample ?? true;
			lines.push(
				line(`DISPLAY:       ${quote?.display ?? displaySymbol}`),
				line(`VENUE SYM:     ${quote?.symbol ?? '—'}`),
				line(`PROVIDER:      ${quote?.provider ?? '—'}`),
				line(`MARK:          ${quote ? money(quote.mark, digits) : '—'}${qSample ? '  [SAMPLE]' : ''}`),
				line(`LAST/PRICE:    ${quote ? money(quote.price, digits) : '—'}${qSample ? '  [SAMPLE]' : ''}`),
				line(`BID / ASK:     ${quote ? money(quote.bid, digits) : '—'} / ${quote ? money(quote.ask, digits) : '—'}`),
				line(`24H CHANGE:    ${pct(quote?.change24h ?? null)}`),
				line(`QUOTE TS:      ${quote?.t ? new Date(quote.t).toISOString() : '—'}`),
				'',
				line(
					qSample
						? 'FUNDING-STYLE NOTE: SAMPLE tape — do not treat as live funding or mark.'
						: 'FUNDING-STYLE NOTE: Live Kraken Futures mark/bid/ask. Funding rate not in this feed.'
				),
				'',
				signal
					? line(
							`CHART DESK: bias ${signal.bias} · conf ${signal.confluence}/5 · ATR ${signal.atr.state}`
						)
					: line('CHART DESK: signal not loaded for this print.')
			);
			break;
		}
	}

	lines.push(...footer(sample));
	return { title: option.title, body: lines.join('\n'), sample };
}

export function faxHtmlDocument(title: string, body: string, sample: boolean): string {
	const safe = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${title} — PHF Fax</title>
<style>
  body { background:#e8e0d0; color:#1a1410; font-family:"Courier New",monospace; margin:24px; }
  pre { white-space:pre-wrap; font-size:12px; line-height:1.35; border:2px dashed #666; padding:16px; background:#f7f2e6; }
  .badge { display:inline-block; padding:2px 8px; background:${sample ? '#c45c4a' : '#2e6d4d'}; color:#fff; font-size:11px; margin-bottom:8px; }
  @media print { body { margin:0; } pre { border:none; } }
</style>
</head>
<body>
  <div class="badge">${sample ? 'SAMPLE' : 'LIVE'}</div>
  <h1 style="font-size:14px;letter-spacing:.08em;">PIXEL HEDGE FUND · FAX PRINT</h1>
  <pre>${safe}</pre>
  <script>window.onload=()=>{ try{ window.print(); }catch(e){} };<\/script>
</body>
</html>`;
}
