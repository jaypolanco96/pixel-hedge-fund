import { json } from '@sveltejs/kit';
import { fetchTapeQuotes } from '$lib/data/kraken';
import type { RequestHandler } from './$types';

/** Multi-crypto ticker tape quotes (live where possible, SAMPLE-labeled per miss). */
export const GET: RequestHandler = async () => {
	const quotes = await fetchTapeQuotes();
	return json(
		{ quotes },
		{ headers: { 'Cache-Control': 'public, max-age=5' } }
	);
};
