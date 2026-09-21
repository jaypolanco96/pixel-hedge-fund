import { json } from '@sveltejs/kit';
import { placeSpotOrder } from '$lib/data/blofin';
import type { BloFinSpotPlaceOrderBody } from '$lib/data/blofinTypes';
import { runWithRequestExchangeAuth } from '$lib/server/requestExchangeAuth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as BloFinSpotPlaceOrderBody;
		const result = await runWithRequestExchangeAuth(request, () => placeSpotOrder(body));
		return json(result, { status: result.ok ? 200 : 400, headers: { 'Cache-Control': 'no-store' } });
	} catch (error) {
		return json({ ok: false, error: error instanceof Error ? error.message : 'Invalid request' }, { status: 400 });
	}
};
