import { json } from '@sveltejs/kit';
import { setMarginMode } from '$lib/data/blofin';
import { runWithRequestExchangeAuth } from '$lib/server/requestExchangeAuth';
import type { RequestHandler } from './$types';
import type { BloFinSetMarginModeBody } from '$lib/data/blofinTypes';

export const POST: RequestHandler = async ({ request }) => {
	return runWithRequestExchangeAuth(request, async () => {
		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return json({ ok: false, error: 'Invalid JSON body' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
		}
		if (!body || typeof body !== 'object' || Array.isArray(body)) {
			return json({ ok: false, error: 'Body must be an object' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
		}
		const result = await setMarginMode(body as BloFinSetMarginModeBody);
		return json(result, {
			status: result.ok ? 200 : 400,
			headers: { 'Cache-Control': 'no-store' }
		});
	});
};
