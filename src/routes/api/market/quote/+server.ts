import { json, error } from '@sveltejs/kit';
import { fetchQuote } from '$lib/data/market';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const symbol = url.searchParams.get('symbol');
	try {
		const data = await fetchQuote(symbol);
		return json(data, { headers: { 'Cache-Control': 'no-store' } });
	} catch (cause) {
		error(503, new Error(`LIVE_MARKET_UNAVAILABLE: ${cause instanceof Error ? cause.message : 'Bybit and BloFin did not return live quote data'}`));
	}
};
