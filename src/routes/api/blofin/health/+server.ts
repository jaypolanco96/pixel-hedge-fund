import { json } from '@sveltejs/kit';
import { checkHealth } from '$lib/data/blofin';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ fetch }) => {
	const data = await checkHealth(() => fetch('/blofin-snapshot.json'));
	return json(data, {
		headers: { 'Cache-Control': 'no-store' }
	});
};
