import { json } from '@sveltejs/kit';
import { fetchBybitBalance } from '$lib/data/bybit';
import { runWithRequestExchangeAuth } from '$lib/server/requestExchangeAuth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	return runWithRequestExchangeAuth(request, async () => {
		const data = await fetchBybitBalance();
		return json(data, { headers: { 'Cache-Control': 'no-store' } });
	});
};
