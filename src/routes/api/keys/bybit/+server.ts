import { json } from '@sveltejs/kit';
import {
	isVercelEnv,
	upsertBybitSecrets,
	validateBybitSecretsInput
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

	const vercel = isVercelEnv();
	const status = vercel ? validateBybitSecretsInput(input) : await upsertBybitSecrets(input);

	if (!status.configured) {
		return json(
			{
				ok: false,
				error: 'Bybit requires apiKey and apiSecret',
				bybit: status,
				persistence: vercel ? 'browser-session' : 'server-file'
			},
			{ status: 400, headers: { 'Cache-Control': 'no-store' } }
		);
	}

	return json(
		{
			ok: true,
			bybit: status,
			message: vercel
				? 'Bybit keys validated (browser session - not stored on Vercel)'
				: 'Bybit keys saved (masked)',
			persistence: vercel ? 'browser-session' : 'server-file'
		},
		{ headers: { 'Cache-Control': 'no-store' } }
	);
};
