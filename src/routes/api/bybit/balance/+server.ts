import { json } from '@sveltejs/kit';
import { fetchBybitBalance } from '$lib/data/bybit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const data = await fetchBybitBalance();
	return json(data, { headers: { 'Cache-Control': 'no-store' } });
};
