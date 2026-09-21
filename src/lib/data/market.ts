/** Bybit-first public market data with BloFin as the only exchange fallback. */
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
import { sampleQuote } from './sample';

export type TapeMarket = 'futures' | 'spot';

export async function fetchQuote(symbolInput?: string | null): Promise<QuoteResponse> {
	const bybit = await fetchBybitQuote(symbolInput);
	if (!bybit.sample) return bybit;
	const blofin = await fetchBloFinPublicQuote(symbolInput);
	return blofin.sample ? bybit : blofin;
}

export async function fetchCandles(
	symbolInput: string | null | undefined,
	tf: Tf,
	limit = 300
): Promise<CandlesResponse> {
	const bybit = await fetchBybitCandles(symbolInput, tf, limit);
	if (!bybit.sample) return bybit;
	const blofin = await fetchBloFinPublicCandles(symbolInput, tf, limit);
	return blofin.sample ? bybit : blofin;
}

/** Merge the two permitted public venues by symbol and retain the strongest quote. */
export async function fetchTapeQuotes(market: TapeMarket = 'futures'): Promise<QuoteResponse[]> {
	if (market === 'spot') {
		const [bybitBase, leveraged] = await Promise.all([
			fetchBybitSpotQuotesFor(SYMBOLS),
			fetchBybitSpotLeveragedQuotes()
		]);
		return [...SYMBOLS.map((def) => bybitBase.get(def.display) ?? sampleQuote(def.display)), ...leveraged];
	}

	const [bybitBase, bybitTop, blofinTop] = await Promise.all([
		fetchBybitQuotesFor(SYMBOLS),
		fetchBybitTopVolumeQuotes(20),
		fetchBloFinTopVolumeQuotes(20)
	]);
	const top = new Map<string, QuoteResponse>();
	for (const quote of [...bybitTop, ...blofinTop]) {
		const previous = top.get(quote.display);
		if (!previous || (quote.volume24h ?? 0) > (previous.volume24h ?? 0)) top.set(quote.display, quote);
	}
	return [
		...([...top.values()].sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0))),
		...SYMBOLS.map((def) => bybitBase.get(def.display) ?? sampleQuote(def.display)).filter((quote) => !top.has(quote.display))
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
			providers: { bybit: quote.provider === 'bybit' && !quote.sample ? 'up' : 'fallback' },
			cache: 'public'
		};
	} catch {
		return { ok: false, providers: { bybit: 'down', blofin: 'unknown' }, cache: 'miss' };
	}
}

export function displayMarketSymbol(symbol: string, market: TapeMarket): string {
	return market === 'spot' ? spotWireSymbol(symbol) : resolveSymbol(symbol).bybit;
}
