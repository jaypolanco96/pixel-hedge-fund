/**
 * Public Kraken Futures helpers (server-only).
 * See `$lib/data/symbols` for Display → PF_* perpetual mapping.
 */
import type { Bar, CandlesResponse, QuoteResponse, Tf } from './types';
import { sampleCandles, sampleQuote } from './sample';
import { resolveSymbol, SYMBOLS, type SymbolDef } from './symbols';

export { resolveSymbol, SYMBOLS, DEFAULT_DISPLAY, TAPE_DISPLAYS } from './symbols';

/** @deprecated use resolveSymbol — kept for call sites expecting SOL lock */
export const KRAKEN_SYMBOL = 'PF_SOLUSD';
export const DISPLAY_SYMBOL = 'SOLUSDT';
export const CANONICAL = 'CRYPTO:KRAKENFUT:PF_SOLUSD';

const TICKERS_URL = 'https://futures.kraken.com/derivatives/api/v3/tickers';
const CHARTS_URL = 'https://futures.kraken.com/api/charts/v1/trade';

const TF_MAP: Record<Tf, string> = {
	'1m': '1m',
	'5m': '5m',
	'15m': '15m',
	'1h': '1h',
	'4h': '4h',
	'1d': '1d'
};

type TickRow = {
	symbol: string;
	last?: number;
	markPrice?: number;
	bid?: number;
	ask?: number;
	lastTime?: string;
	change24h?: number;
};

let tickersCache: { at: number; rows: TickRow[] } | null = null;
const quoteCache = new Map<string, { at: number; data: QuoteResponse }>();
const candleCache = new Map<string, { at: number; data: CandlesResponse }>();
const TTL_MS = 15_000;

async function loadTickers(): Promise<TickRow[]> {
	if (tickersCache && Date.now() - tickersCache.at < TTL_MS) return tickersCache.rows;
	const res = await fetch(TICKERS_URL, {
		headers: { Accept: 'application/json' },
		signal: AbortSignal.timeout(8000)
	});
	if (!res.ok) throw new Error(`tickers HTTP ${res.status}`);
	const body = (await res.json()) as { tickers?: TickRow[] };
	const rows = body.tickers ?? [];
	tickersCache = { at: Date.now(), rows };
	return rows;
}

function quoteFromTick(def: SymbolDef, tick: TickRow): QuoteResponse {
	const last = Number(tick.last);
	return {
		symbol: def.canonical,
		display: def.display,
		price: last,
		mark: Number(tick.markPrice ?? tick.last),
		bid: Number(tick.bid ?? tick.last),
		ask: Number(tick.ask ?? tick.last),
		t: tick.lastTime ? Date.parse(tick.lastTime) : Date.now(),
		provider: 'kraken-futures',
		sample: false,
		change24h: tick.change24h
	};
}

export async function fetchQuote(symbolInput?: string | null): Promise<QuoteResponse> {
	const def = resolveSymbol(symbolInput);
	const hit = quoteCache.get(def.kraken);
	if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

	try {
		const rows = await loadTickers();
		const tick = rows.find((t) => t.symbol === def.kraken);
		if (!tick || tick.last == null) throw new Error(`${def.kraken} missing from tickers`);
		const data = quoteFromTick(def, tick);
		quoteCache.set(def.kraken, { at: Date.now(), data });
		return data;
	} catch (err) {
		if (hit) return { ...hit.data };
		console.warn(`[Tape Wire] quote ${def.display} fallback → SAMPLE`, err);
		return sampleQuote(def.display);
	}
}

/** Live quotes for the multi-crypto ticker tape — SAMPLE-labeled per miss. */
export async function fetchTapeQuotes(): Promise<QuoteResponse[]> {
	try {
		const rows = await loadTickers();
		return SYMBOLS.map((def) => {
			const tick = rows.find((t) => t.symbol === def.kraken);
			if (!tick || tick.last == null) {
				console.warn(`[Tape Wire] tape ${def.display} missing → SAMPLE`);
				return sampleQuote(def.display);
			}
			const data = quoteFromTick(def, tick);
			quoteCache.set(def.kraken, { at: Date.now(), data });
			return data;
		});
	} catch (err) {
		console.warn('[Tape Wire] tape batch fallback → SAMPLE per symbol', err);
		return SYMBOLS.map((def) => sampleQuote(def.display));
	}
}

export async function fetchCandles(
	symbolInput: string | null | undefined,
	tf: Tf,
	limit = 300
): Promise<CandlesResponse> {
	const def = resolveSymbol(symbolInput);
	const resolution = TF_MAP[tf] ?? '15m';
	const key = `${def.kraken}:${resolution}:${limit}`;
	const hit = candleCache.get(key);
	if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

	try {
		const url = `${CHARTS_URL}/${def.kraken}/${resolution}`;
		const res = await fetch(url, {
			headers: { Accept: 'application/json' },
			signal: AbortSignal.timeout(12_000)
		});
		if (!res.ok) throw new Error(`charts HTTP ${res.status}`);
		const body = (await res.json()) as {
			candles?: Array<{
				time: number;
				open: string | number;
				high: string | number;
				low: string | number;
				close: string | number;
				volume: string | number;
			}>;
		};
		const raw = body.candles ?? [];
		if (!raw.length) throw new Error('empty candles');

		const bars: Bar[] = raw.slice(-limit).map((c) => ({
			t: Number(c.time),
			o: Number(c.open),
			h: Number(c.high),
			l: Number(c.low),
			c: Number(c.close),
			v: Number(c.volume)
		}));

		const data: CandlesResponse = {
			symbol: def.canonical,
			display: def.display,
			tf,
			provider: 'kraken-futures',
			sample: false,
			bars
		};
		candleCache.set(key, { at: Date.now(), data });
		return data;
	} catch (err) {
		if (hit) return hit.data;
		console.warn(`[Tape Wire] candles ${def.display} fallback → SAMPLE`, err);
		return sampleCandles(tf, limit, def.display);
	}
}

export async function healthCheck(): Promise<{
	ok: boolean;
	providers: Record<string, string>;
	cache: string;
}> {
	try {
		const q = await fetchQuote(DISPLAY_SYMBOL);
		return {
			ok: !q.sample,
			providers: { 'kraken-futures': q.sample ? 'sample' : 'up' },
			cache: quoteCache.size ? 'ok' : 'cold'
		};
	} catch {
		return { ok: false, providers: { 'kraken-futures': 'down' }, cache: 'miss' };
	}
}
