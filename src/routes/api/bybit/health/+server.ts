import { json } from '@sveltejs/kit';
import { checkBybitHealth } from '$lib/data/bybit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const data = await checkBybitHealth();
	return json(data, { headers: { 'Cache-Control': 'no-store' } });
};
