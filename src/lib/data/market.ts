/** Bybit-first public market data with BloFin as the only exchange fallback. */
import { env } from '$env/dynamic/private';
import type { CandlesResponse, QuoteResponse, Tf } from './types';
import {
	fetchBybitCandles,
	fetchBybitQuote,
	fetchBybitQuotesFor,
	fetchBybitSpotLeveragedQuotes,
	fetchBybitSpotQuotesFor,
	fetchBybitTopVolumeQuotes
} from './bybit';
import {
	fetchBloFinPublicCandles,
	fetchBloFinPublicQuote,
	fetchBloFinTopVolumeQuotes
} from './blofin';
import { DEFAULT_DISPLAY, SYMBOLS, resolveSymbol, spotWireSymbol } from './symbols';

export type TapeMarket = 'futures' | 'spot';

/** Local dev keeps the labeled fallback; production always requires live exchange data. */
const productionRuntime = process.env.NODE_ENV === 'production' || env.VERCEL === '1' || env.VERCEL === 'true';
export const MARKET_LIVE_ONLY = productionRuntime || String(env.PHF_LIVE_ONLY ?? '').toLowerCase() === 'true';

function requireLive<T extends { sample: boolean }>(data: T, label: string): T {
	if (MARKET_LIVE_ONLY && data.sample) throw new Error(`${label} live data unavailable`);
	return data;
}

export async function fetchQuote(symbolInput?: string | null): Promise<QuoteResponse> {
	const bybit = await fetchBybitQuote(symbolInput);
	if (!bybit.sample) return bybit;
	const blofin = await fetchBloFinPublicQuote(symbolInput);
	return requireLive(blofin.sample ? bybit : blofin, 'Quote');
}

export async function fetchCandles(
	symbolInput: string | null | undefined,
	tf: Tf,
	limit = 300
): Promise<CandlesResponse> {
	const bybit = await fetchBybitCandles(symbolInput, tf, limit);
	if (!bybit.sample) return bybit;
	const blofin = await fetchBloFinPublicCandles(symbolInput, tf, limit);
	return requireLive(blofin.sample ? bybit : blofin, 'Candle');
}

/** Merge the two permitted public venues by symbol and retain the strongest quote. */
export async function fetchTapeQuotes(market: TapeMarket = 'futures'): Promise<QuoteResponse[]> {
	if (market === 'spot') {
		const [bybitBase, leveraged] = await Promise.all([
			fetchBybitSpotQuotesFor(SYMBOLS),
			fetchBybitSpotLeveragedQuotes()
		]);
		const base = MARKET_LIVE_ONLY
			? [...bybitBase.values()].filter((quote) => !quote.sample)
			: SYMBOLS.map((def) => bybitBase.get(def.display));
		return [...base, ...leveraged].filter((quote): quote is QuoteResponse => !!quote && (!MARKET_LIVE_ONLY || !quote.sample));
	}

	const [bybitBase, bybitTop, blofinTop] = await Promise.all([
		fetchBybitQuotesFor(SYMBOLS),
		fetchBybitTopVolumeQuotes(20),
		fetchBloFinTopVolumeQuotes(20)
	]);
	const top = new Map<string, QuoteResponse>();
	for (const quote of [...bybitTop, ...blofinTop].filter((item) => !MARKET_LIVE_ONLY || !item.sample)) {
		const previous = top.get(quote.display);
		if (!previous || (quote.volume24h ?? 0) > (previous.volume24h ?? 0)) top.set(quote.display, quote);
	}
	const base = MARKET_LIVE_ONLY
		? [...bybitBase.values()].filter((quote) => !quote.sample)
		: SYMBOLS.map((def) => bybitBase.get(def.display)).filter((quote): quote is QuoteResponse => !!quote);
	return [
		...([...top.values()].sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0))),
		...base.filter((quote) => !top.has(quote.display))
	];
}

export async function healthCheck(): Promise<{
	ok: boolean;
	providers: Record<string, string>;
	cache: string;
}> {
	try {
		const quote = await fetchQuote(DEFAULT_DISPLAY);
		return {
			ok: !quote.sample,
			providers: {
				bybit: quote.provider === 'bybit' && !quote.sample ? 'up' : 'fallback',
				blofin: quote.provider === 'blofin' && !quote.sample ? 'up' : 'fallback'
			},
			cache: 'public'
		};
	} catch {
		return { ok: false, providers: { bybit: 'down', blofin: 'unknown' }, cache: 'miss' };
	}
}

export function displayMarketSymbol(symbol: string, market: TapeMarket): string {
	return market === 'spot' ? spotWireSymbol(symbol) : resolveSymbol(symbol).bybit;
}
