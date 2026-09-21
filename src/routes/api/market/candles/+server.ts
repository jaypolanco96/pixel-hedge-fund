import { json, error } from '@sveltejs/kit';
import { fetchCandles } from '$lib/data/market';
import type { Tf } from '$lib/data/types';
import type { RequestHandler } from './$types';

const ALLOWED: Tf[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

export const GET: RequestHandler = async ({ url }) => {
	const symbol = url.searchParams.get('symbol');
	const tf = (url.searchParams.get('tf') ?? '15m') as Tf;
	const requestedLimit = Number(url.searchParams.get('limit') ?? 300);
	if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
		error(400, { message: 'INVALID_LIMIT' });
	}
	const limit = Math.min(requestedLimit, 500);
	const format = url.searchParams.get('format');

	if (!ALLOWED.includes(tf)) {
		error(400, { message: 'UNSUPPORTED_TF' });
	}

	let data;
	try {
		data = await fetchCandles(symbol, tf, limit);
	} catch (cause) {
		error(503, new Error(`LIVE_MARKET_UNAVAILABLE: ${cause instanceof Error ? cause.message : 'Bybit and BloFin did not return live candle data'}`));
	}

	if (format === 'columns') {
		return json({
			symbol: data.symbol,
			tf: data.tf,
			t: data.bars.map((b) => b.t),
			open: data.bars.map((b) => b.o),
			high: data.bars.map((b) => b.h),
			low: data.bars.map((b) => b.l),
			close: data.bars.map((b) => b.c),
			volume: data.bars.map((b) => b.v),
			sample: data.sample,
			provider: data.provider
		});
	}

	return json(data, {
		headers: { 'Cache-Control': 'no-store' }
	});
};
