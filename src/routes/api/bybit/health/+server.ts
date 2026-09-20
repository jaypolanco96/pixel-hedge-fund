import { json } from '@sveltejs/kit';
import { checkBybitHealth } from '$lib/data/bybit';
import { runWithRequestExchangeAuth } from '$lib/server/requestExchangeAuth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	return runWithRequestExchangeAuth(request, async () => {
		const data = await checkBybitHealth();
		return json(data, { headers: { 'Cache-Control': 'no-store' } });
	});
};
