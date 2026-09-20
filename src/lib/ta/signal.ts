import type {
	Bar,
	Bias,
	ConfluenceBand,
	SignalResponse,
	StructureTag,
	VolState
} from '$lib/data/types';
import { atr, ema, lastFinite, macd, rsi, supertrend } from './indicators';

function biasFrom(stDir: 1 | -1, close: number, ema55: number): Bias {
	if (stDir === 1 && close > ema55) return 'LONG';
	if (stDir === -1 && close < ema55) return 'SHORT';
	return 'FLAT';
}

function volState(atrPct: number): VolState {
	if (atrPct < 0.6) return 'quiet';
	if (atrPct > 2.5) return 'wild';
	return 'normal';
}

function confluenceBand(score: number): ConfluenceBand {
	if (score >= 5) return 'high';
	if (score >= 3) return 'tradeable';
	return 'weak';
}

function structureTag(
	bias: Bias,
	close: number,
	ema21: number,
	ema55: number,
	rsiVal: number,
	macdHist: number,
	highs: number[],
	lows: number[]
): StructureTag {
	const priorHigh = Math.max(...highs.slice(-20, -1));
	const priorLow = Math.min(...lows.slice(-20, -1));

	if (bias === 'LONG') {
		if (close > priorHigh && macdHist > 0) return 'breakout';
		if (close <= Math.max(ema21, ema55) && close >= Math.min(ema21, ema55) && rsiVal > 45) {
			return 'pullback';
		}
	}
	if (bias === 'SHORT') {
		if (close < priorLow && macdHist < 0) return 'breakout';
		if (close >= Math.min(ema21, ema55) && close <= Math.max(ema21, ema55) && rsiVal < 55) {
			return 'rejection';
		}
		if (
			(close > ema21 || close > ema55) &&
			rsiVal < 55 &&
			highs[highs.length - 1] > Math.max(ema21, ema55)
		) {
			return 'rejection';
		}
	}
	return 'none';
}

export function computeSignal(
	setupBars: Bar[],
	regimeBars: Bar[],
	opts: { sample: boolean; provider: 'kraken-futures' | 'sample'; symbol?: string }
): SignalResponse {
	const closes = setupBars.map((b) => b.c);
	const highs = setupBars.map((b) => b.h);
	const lows = setupBars.map((b) => b.l);

	const ema21s = ema(closes, 21);
	const ema55s = ema(closes, 55);
	const rsis = rsi(closes, 14);
	const atr14s = atr(highs, lows, closes, 14);
	const macds = macd(closes);
	const st = supertrend(highs, lows, closes, 10, 3);

	const i = closes.length - 1;
	const close = closes[i];
	const e21 = lastFinite(ema21s);
	const e55 = lastFinite(ema55s);
	const rsiVal = lastFinite(rsis);
	const atr14 = lastFinite(atr14s);
	const macdLine = lastFinite(macds.line);
	const macdSig = lastFinite(macds.signal);
	const macdHist = lastFinite(macds.hist);
	const stVal = lastFinite(st.value);
	const stDir = (st.direction[i] ?? 1) as 1 | -1;

	const setupBias = biasFrom(stDir, close, e55);

	const rCloses = regimeBars.map((b) => b.c);
	const rHighs = regimeBars.map((b) => b.h);
	const rLows = regimeBars.map((b) => b.l);
	const rEma55s = ema(rCloses, 55);
	const rSt = supertrend(rHighs, rLows, rCloses, 10, 3);
	const ri = rCloses.length - 1;
	const regimeBias =
		ri >= 0
			? biasFrom((rSt.direction[ri] ?? 1) as 1 | -1, rCloses[ri], lastFinite(rEma55s))
			: 'FLAT';

	let score = 0;
	if ((stDir === 1 && close > e55) || (stDir === -1 && close < e55)) score += 1;
	if ((setupBias === 'LONG' && e21 > e55) || (setupBias === 'SHORT' && e21 < e55)) score += 1;
	if (setupBias === 'LONG' && rsiVal >= 45 && rsiVal <= 70) score += 1;
	if (setupBias === 'SHORT' && rsiVal >= 30 && rsiVal <= 55) score += 1;
	if ((setupBias === 'LONG' && macdHist > 0) || (setupBias === 'SHORT' && macdHist < 0)) score += 1;
	if (setupBias !== 'FLAT' && setupBias === regimeBias) score += 1;

	const atrPct = close > 0 ? (atr14 / close) * 100 : 0;
	const structure = structureTag(setupBias, close, e21, e55, rsiVal, macdHist, highs, lows);

	const stop = stVal;
	const riskPct = close > 0 ? (Math.abs(close - stop) / close) * 100 : 0;
	const riskDist = Math.abs(close - stop);
	const tp1 = setupBias === 'SHORT' ? close - 1.5 * riskDist : close + 1.5 * riskDist;
	const tp2 = setupBias === 'SHORT' ? close - 2.5 * riskDist : close + 2.5 * riskDist;

	const bias: Bias = setupBias;

	return {
		symbol: opts.symbol ?? 'SOLUSDT',
		tf: '15m',
		asof: new Date().toISOString(),
		last: close,
		bias,
		mtf: {
			regime: regimeBias,
			setup: setupBias,
			aligned: setupBias !== 'FLAT' && setupBias === regimeBias
		},
		supertrend: { value: +stVal.toFixed(4), direction: stDir },
		ema: { '21': +e21.toFixed(4), '55': +e55.toFixed(4) },
		rsi: +rsiVal.toFixed(2),
		macd: {
			line: +macdLine.toFixed(4),
			signal: +macdSig.toFixed(4),
			hist: +macdHist.toFixed(4)
		},
		atr: {
			'14': +atr14.toFixed(4),
			pct: +atrPct.toFixed(3),
			state: volState(atrPct)
		},
		structure,
		confluence: score,
		confluenceBand: confluenceBand(score),
		risk: {
			stop: +stop.toFixed(4),
			risk_pct: +riskPct.toFixed(3),
			tp1: +tp1.toFixed(4),
			tp2: +tp2.toFixed(4),
			rr_tp1: 1.5
		},
		sample: opts.sample,
		provider: opts.provider
	};
}
