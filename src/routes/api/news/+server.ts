import { json } from '@sveltejs/kit';
import { fetchNewsForSymbol } from '$lib/data/news';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const symbol = url.searchParams.get('symbol');
	const data = await fetchNewsForSymbol(symbol);
	return json(data, {
		headers: { 'Cache-Control': 'no-store' }
	});
};
