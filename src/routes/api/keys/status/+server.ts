import { json } from '@sveltejs/kit';
import { getKeysStatus } from '$lib/server/exchangeSecrets';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const status = await getKeysStatus();
	return json(status, { headers: { 'Cache-Control': 'no-store' } });
};
