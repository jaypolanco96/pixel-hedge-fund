import { json } from '@sveltejs/kit';
import { fetchTapeQuotes, MARKET_LIVE_ONLY, type TapeMarket } from '$lib/data/market';
import type { RequestHandler } from './$types';

/** Multi-crypto ticker tape quotes from the permitted live exchanges. */
export const GET: RequestHandler = async ({ url }) => {
	const market: TapeMarket = url.searchParams.get('market') === 'spot' ? 'spot' : 'futures';
	const quotes = await fetchTapeQuotes(market);
	return json(
		{ market, quotes, liveOnly: MARKET_LIVE_ONLY },
		{ headers: { 'Cache-Control': 'no-store' } }
	);
};
