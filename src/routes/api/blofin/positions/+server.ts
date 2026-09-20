import { json } from '@sveltejs/kit';
import { fetchPositions } from '$lib/data/blofin';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ fetch }) => {
	const data = await fetchPositions(() => fetch('/blofin-snapshot.json'));
	return json(data, {
		status: data.ok ? 200 : 503,
		headers: { 'Cache-Control': 'no-store' }
	});
};
