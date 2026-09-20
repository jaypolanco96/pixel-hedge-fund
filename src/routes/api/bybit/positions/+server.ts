import { json } from '@sveltejs/kit';
import { fetchBybitPositions } from '$lib/data/bybit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const data = await fetchBybitPositions();
	return json(data, {
		status: data.ok ? 200 : data.configured ? 503 : 200,
		headers: { 'Cache-Control': 'no-store' }
	});
};
