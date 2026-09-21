import { json } from '@sveltejs/kit';
import { fetchTapeQuotes, type TapeMarket } from '$lib/data/market';
import type { RequestHandler } from './$types';

/** Multi-crypto ticker tape quotes (live where possible, SAMPLE-labeled per miss). */
export const GET: RequestHandler = async ({ url }) => {
	const market: TapeMarket = url.searchParams.get('market') === 'spot' ? 'spot' : 'futures';
	const quotes = await fetchTapeQuotes(market);
	return json(
		{ market, quotes },
		{ headers: { 'Cache-Control': 'public, max-age=5' } }
	);
};
