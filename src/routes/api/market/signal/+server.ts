import { json } from '@sveltejs/kit';
import { fetchCandles, resolveSymbol } from '$lib/data/kraken';
import { computeSignal } from '$lib/ta/signal';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const symbol = url.searchParams.get('symbol') ?? 'SOLUSDT';
	const def = resolveSymbol(symbol);
	const [setup, regime] = await Promise.all([
		fetchCandles(def.display, '15m', 300),
		fetchCandles(def.display, '4h', 200)
	]);

	// The final exchange candle is still forming. Build the desk signal from
	// completed candles so posture decisions do not churn intrabar.
	const setupBars = setup.bars.length > 1 ? setup.bars.slice(0, -1) : setup.bars;
	const regimeBars = regime.bars.length > 1 ? regime.bars.slice(0, -1) : regime.bars;
	const sample = setup.sample || regime.sample;
	const provider = sample ? 'sample' : 'kraken-futures';
	const signal = computeSignal(setupBars, regimeBars, {
		sample,
		provider,
		symbol: def.display
	});

	return json(signal, {
		headers: { 'Cache-Control': 'public, max-age=10' }
	});
};
