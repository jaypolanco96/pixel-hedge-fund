import { json, error } from '@sveltejs/kit';
import { fetchCandles } from '$lib/data/kraken';
import type { Tf } from '$lib/data/types';
import type { RequestHandler } from './$types';

const ALLOWED: Tf[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

export const GET: RequestHandler = async ({ url }) => {
	const symbol = url.searchParams.get('symbol');
	const tf = (url.searchParams.get('tf') ?? '15m') as Tf;
	const limit = Math.min(Number(url.searchParams.get('limit') ?? 300), 500);
	const format = url.searchParams.get('format');

	if (!ALLOWED.includes(tf)) {
		error(400, { message: 'UNSUPPORTED_TF' });
	}

	const data = await fetchCandles(symbol, tf, limit);

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
		headers: { 'Cache-Control': 'public, max-age=10' }
	});
};
