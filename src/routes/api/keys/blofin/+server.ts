import { json } from '@sveltejs/kit';
import { upsertBloFinSecrets } from '$lib/server/exchangeSecrets';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
	}
	if (!body || typeof body !== 'object') {
		return json({ ok: false, error: 'Body must be an object' }, { status: 400 });
	}

	const status = await upsertBloFinSecrets({
		apiKey: body.apiKey != null ? String(body.apiKey) : undefined,
		apiSecret: body.apiSecret != null ? String(body.apiSecret) : undefined,
		passphrase: body.passphrase != null ? String(body.passphrase) : undefined,
		baseUrl: body.baseUrl != null ? String(body.baseUrl) : undefined
	});

	if (!status.configured) {
		return json(
			{
				ok: false,
				error: 'BloFin requires apiKey, apiSecret, and passphrase',
				blofin: status
			},
			{ status: 400, headers: { 'Cache-Control': 'no-store' } }
		);
	}

	return json(
		{ ok: true, blofin: status, message: 'BloFin keys saved (masked)' },
		{ headers: { 'Cache-Control': 'no-store' } }
	);
};
