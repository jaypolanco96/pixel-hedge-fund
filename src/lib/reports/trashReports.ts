import type { QuoteResponse, SignalResponse } from '$lib/data/types';

export interface TrashReport {
	title: string;
	body: string;
	sample: boolean;
	thesisLabel: string;
}

function money(n: number | undefined | null, digits = 4): string {
	if (n == null || !Number.isFinite(n)) return '—';
	return n.toFixed(digits);
}

function stamp(): string {
	return new Date().toLocaleString('en-US', {
		timeZone: 'America/New_York',
		hour12: true
	});
}

/**
 * Build a discarded "busted thesis" research note from live Chart Desk bias.
 * Narrative post-mortem only — no invented fills or live P&L figures.
 */
export function buildTrashReport(opts: {
	signal: SignalResponse | null;
	quote: QuoteResponse | null;
	displaySymbol: string;
	decimals?: number;
}): TrashReport {
	const { signal, quote, displaySymbol } = opts;
	const digits = opts.decimals ?? 4;
	const sample = !!(signal?.sample || quote?.sample || !signal);
	const sym = signal?.symbol ?? quote?.display ?? displaySymbol;
	const mark = quote?.mark ?? quote?.price ?? signal?.last;
	const dataTag = sample ? '*** SAMPLE CONTEXT ***' : `LIVE CONTEXT / ${signal?.provider.toUpperCase()}`;

	if (!signal) {
		return {
			title: 'Discarded scrap — no tape',
			thesisLabel: 'UNFILED',
			sample: true,
			body: [
				'╔══════════════════════════════════════╗',
				'║  PHF · BUSTED THESIS BIN             ║',
				'║  (crumpled · not a live P&L ticket)  ║',
				'╚══════════════════════════════════════╝',
				'',
				`PAIR: ${sym}`,
				`FISHED: ${stamp()} ET`,
				'',
				'Tape wire quiet — nothing on the Chart Desk to autopsy.',
				'This scrap stays unlabeled until signal returns.',
				'',
				'— Research pit · discard only —'
			].join('\n')
		};
	}

	const bias = signal.bias;
	const conf = signal.confluence;
	const band = signal.confluenceBand;
	const structure = signal.structure;
	const aligned = signal.mtf.aligned;
	const regime = signal.mtf.regime;
	const setup = signal.mtf.setup;
	const rsi = signal.rsi;
	const macdHist = signal.macd.hist;
	const atrPct = signal.atr.pct;
	const riskPct = signal.risk.risk_pct;
	const stDir = signal.supertrend.direction === 1 ? 'UP' : 'DOWN';

	// Counter-thesis relative to current desk bias — what we threw away.
	let thesisSide: 'LONG' | 'SHORT' | 'BREAKOUT-LONG' | 'FADE-SHORT';
	let thesisName: string;
	let whyWrong: string[];
	let riskIfSized: string[];

	if (bias === 'LONG') {
		thesisSide = aligned ? 'FADE-SHORT' : 'SHORT';
		thesisName = aligned
			? `Counter-trend SHORT fade vs ${sym} (regime+setup already LONG)`
			: `Lone SHORT call while setup=${setup} / regime=${regime}`;
		whyWrong = [
			`Desk bias flipped / held LONG — Supertrend ${stDir}, close vs EMA55 supports bulls.`,
			`Confluence now ${conf}/6 (${band}); structure tag: ${structure}.`,
			aligned
				? 'MTF aligned LONG — the fade was fighting both 15m setup and 4h regime.'
				: `MTF not fully aligned (regime ${regime} / setup ${setup}) but tape still refused the short.`,
			`Momentum: RSI ${rsi.toFixed(1)}, MACD hist ${macdHist.toFixed(4)} — not the soft tape the short needed.`
		];
		riskIfSized = [
			`If the pit had sized that SHORT into ST risk (~${riskPct.toFixed(2)}% to stop), a squeeze through`,
			`mark ${money(mark, digits)} toward TP1 ${money(signal.risk.tp1, digits)} would have been a clean`,
			'research miss — capital burned on a thesis the desk already discarded.',
			`ATR ${atrPct.toFixed(2)}% (${signal.atr.state}) — volatility would have amplified the pain.`
		];
	} else if (bias === 'SHORT') {
		thesisSide = aligned ? 'BREAKOUT-LONG' : 'LONG';
		thesisName = aligned
			? `Hero LONG / breakout chase vs ${sym} (regime+setup already SHORT)`
			: `Stubborn LONG while setup=${setup} / regime=${regime}`;
		whyWrong = [
			`Desk bias held SHORT — Supertrend ${stDir}, price under the bullish EMA stack.`,
			`Confluence ${conf}/6 (${band}); structure: ${structure}.`,
			aligned
				? 'MTF aligned SHORT — buying strength was catching a falling knife on both frames.'
				: `Mixed MTF (regime ${regime} / setup ${setup}) still never confirmed a long.`,
			`RSI ${rsi.toFixed(1)}, MACD hist ${macdHist.toFixed(4)} — bounce thesis never got follow-through.`
		];
		riskIfSized = [
			`Sizing that LONG against ST (~${riskPct.toFixed(2)}% risk) into mark ${money(mark, digits)}`,
			`with TP1 ${money(signal.risk.tp1, digits)} on the short side of the book means the long would`,
			'have been the wrong side of the aisle — a classic "hope trade" the CIO bins.',
			`Vol state ${signal.atr.state} (ATR ${atrPct.toFixed(2)}%) would have chewed margin fast.`
		];
	} else {
		// FLAT — busted breakout / failed confluence story
		thesisSide = structure === 'rejection' ? 'BREAKOUT-LONG' : 'LONG';
		thesisName =
			structure === 'rejection'
				? `Failed breakout / rejection chase on ${sym}`
				: `Forced directional bet while desk FLAT on ${sym}`;
		whyWrong = [
			`Chart Desk is FLAT — no mandate bias. Supertrend ${stDir}, confluence only ${conf}/6 (${band}).`,
			`Structure tag: ${structure}. Regime ${regime} vs setup ${setup} (aligned=${aligned ? 'yes' : 'no'}).`,
			'Someone tried to force a story the tape would not underwrite.',
			`RSI ${rsi.toFixed(1)}, MACD hist ${macdHist.toFixed(4)} — mixed, not a clean impulse.`
		];
		riskIfSized = [
			`A sized "conviction" entry near ${money(mark, digits)} with ~${riskPct.toFixed(2)}% ST distance`,
			'would have been research theater: stop noise, no edge, CIO glare.',
			`ATR ${atrPct.toFixed(2)}% (${signal.atr.state}) — chopping FLAT tape punishes oversized hope.`,
			'Lesson filed: no confluence, no size. Bin it.'
		];
	}

	const lines = [
		'╔══════════════════════════════════════╗',
		'║  PHF · BUSTED THESIS BIN             ║',
		'║  crumpled research · NOT a P&L ticket║',
		'╚══════════════════════════════════════╝',
		'',
		`PAIR:     ${sym}`,
		`CONTEXT:  ${dataTag}`,
		`FISHED:   ${stamp()} ET`,
		`STATUS:   DISCARDED — proven wrong vs live desk`,
		'',
		'── WHAT THE THESIS WAS ────────────────',
		`LABEL:    ${thesisSide}`,
		thesisName,
		'',
		'── WHY IT WAS WRONG ───────────────────',
		...whyWrong.map((l) => `• ${l}`),
		'',
		'── LIVE DESK SNAPSHOT (evidence) ──────',
		`Bias:        ${bias}`,
		`Confluence:  ${conf}/6 (${band})`,
		`MTF:         regime ${regime} / setup ${setup} / aligned=${aligned ? 'YES' : 'NO'}`,
		`Structure:   ${structure}`,
		`Supertrend:  ${money(signal.supertrend.value, digits)} (${stDir})`,
		`EMA21/55:    ${money(signal.ema['21'], digits)} / ${money(signal.ema['55'], digits)}`,
		`Mark/last:   ${money(mark, digits)}`,
		'',
		'── RISK IF IT HAD BEEN SIZED UP ───────',
		...riskIfSized,
		'',
		'NARRATIVE ONLY — no fictional fills, no fake P&L.',
		'We keep the scar tissue; we do not keep the position.',
		'',
		'— Research pit · trash chute · PHF —'
	];

	return {
		title: 'Busted thesis / wrong call',
		thesisLabel: thesisSide,
		sample,
		body: lines.join('\n')
	};
}
