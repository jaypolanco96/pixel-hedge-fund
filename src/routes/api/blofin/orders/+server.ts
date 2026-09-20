import { json } from '@sveltejs/kit';
import { fetchOrders } from '$lib/data/blofin';
import { runWithRequestExchangeAuth } from '$lib/server/requestExchangeAuth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, fetch }) => {
	return runWithRequestExchangeAuth(request, async () => {
		const data = await fetchOrders(() => fetch('/blofin-snapshot.json'));
		return json(data, {
			status: data.ok ? 200 : 503,
			headers: { 'Cache-Control': 'no-store' }
		});
	});
};
