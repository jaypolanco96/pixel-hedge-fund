import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import {
	isVercelEnv,
	upsertBloFinSecrets,
	validateBloFinSecretsInput
} from '$lib/server/exchangeSecrets';
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

	const input = {
		apiKey: body.apiKey != null ? String(body.apiKey) : undefined,
		apiSecret: body.apiSecret != null ? String(body.apiSecret) : undefined,
		passphrase: body.passphrase != null ? String(body.passphrase) : undefined,
		brokerId: body.brokerId != null ? String(body.brokerId) : undefined,
		baseUrl: body.baseUrl != null ? String(body.baseUrl) : undefined
	};

	// Only a local dev server keeps keys on disk; any built server validates and lets the browser session hold them.
	const persist = dev && !isVercelEnv();
	const status = persist ? await upsertBloFinSecrets(input) : validateBloFinSecretsInput(input);

	if (!status.configured) {
		return json(
			{
				ok: false,
				error: 'BloFin requires apiKey, apiSecret, and passphrase',
				blofin: status,
				persistence: persist ? 'server-file' : 'browser-session'
			},
			{ status: 400, headers: { 'Cache-Control': 'no-store' } }
		);
	}

	return json(
		{
			ok: true,
			blofin: status,
			message: persist
				? 'BloFin keys saved (masked)'
				: 'BloFin keys validated (browser session - not stored on the server)',
			persistence: persist ? 'server-file' : 'browser-session'
		},
		{ headers: { 'Cache-Control': 'no-store' } }
	);
};
