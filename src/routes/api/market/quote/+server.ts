import { json } from '@sveltejs/kit';
import { fetchQuote } from '$lib/data/market';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const symbol = url.searchParams.get('symbol');
	const data = await fetchQuote(symbol);
	return json(data, {
		headers: { 'Cache-Control': 'public, max-age=5' }
	});
};
