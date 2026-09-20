import type { Bar, QuoteResponse, CandlesResponse } from './types';
import { resolveSymbol, type SymbolDef } from './symbols';

/** Labeled SAMPLE fallback — never silent fake live prices. */

export function sampleQuote(symbolInput?: string | null): QuoteResponse {
	const def = resolveSymbol(symbolInput);
	const jitter =
		Math.sin(Date.now() / 8000) * def.sampleMid * 0.004 +
		Math.cos(Date.now() / 13000) * def.sampleMid * 0.002;
	const price = +((def.sampleMid + jitter).toFixed(def.decimals));
	const tick = Math.max(price * 0.0001, Math.pow(10, -def.decimals));
	return {
		symbol: def.canonical,
		display: def.display,
		price,
		mark: price,
		bid: +(price - tick).toFixed(def.decimals),
		ask: +(price + tick).toFixed(def.decimals),
		t: Date.now(),
		provider: 'sample',
		sample: true,
		change24h: -1.2
	};
}

export function sampleBars(def: SymbolDef, tfMs: number, count = 200): Bar[] {
	const bars: Bar[] = [];
	let c = def.sampleMid;
	const now = Date.now();
	const start = now - count * tfMs;
	const amp = def.sampleMid * 0.016;
	for (let i = 0; i < count; i++) {
		const t = start + i * tfMs;
		const drift = Math.sin(i / 18) * amp + Math.cos(i / 7) * amp * 0.5;
		const o = c;
		const n = def.sampleMid + drift + Math.sin(i / 3) * amp * 0.2;
		const h = Math.max(o, n) + amp * 0.2;
		const l = Math.min(o, n) - amp * 0.2;
		c = n;
		bars.push({
			t,
			o: +o.toFixed(def.decimals + 1),
			h: +h.toFixed(def.decimals + 1),
			l: +l.toFixed(def.decimals + 1),
			c: +c.toFixed(def.decimals + 1),
			v: 800 + (i % 40) * 55
		});
	}
	return bars;
}

export function sampleCandles(tf: string, limit = 200, symbolInput?: string | null): CandlesResponse {
	const def = resolveSymbol(symbolInput);
	const tfMs: Record<string, number> = {
		'1m': 60_000,
		'5m': 300_000,
		'15m': 900_000,
		'1h': 3_600_000,
		'4h': 14_400_000,
		'1d': 86_400_000
	};
	return {
		symbol: def.canonical,
		display: def.display,
		tf: (tf as CandlesResponse['tf']) || '15m',
		provider: 'sample',
		sample: true,
		bars: sampleBars(def, tfMs[tf] ?? 900_000, Math.min(limit, 500))
	};
}
