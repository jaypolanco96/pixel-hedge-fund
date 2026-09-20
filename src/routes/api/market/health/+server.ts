import { json } from '@sveltejs/kit';
import { healthCheck } from '$lib/data/kraken';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const h = await healthCheck();
	return json(h);
};
