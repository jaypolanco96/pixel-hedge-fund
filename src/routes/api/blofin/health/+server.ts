import { json } from '@sveltejs/kit';
import { checkHealth } from '$lib/data/blofin';
import { runWithRequestExchangeAuth } from '$lib/server/requestExchangeAuth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, fetch }) => {
	return runWithRequestExchangeAuth(request, async () => {
		const data = await checkHealth(() => fetch('/blofin-snapshot.json'));
		return json(data, {
			headers: { 'Cache-Control': 'no-store' }
		});
	});
};
