import { json } from '@sveltejs/kit';
import { healthCheck } from '$lib/data/market';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const h = await healthCheck();
	return json(h);
};
