import { json, error } from '@sveltejs/kit';
import { completedBars } from '$lib/data/validation';
import { fetchCandles } from '$lib/data/market';
import { resolveSymbol } from '$lib/data/symbols';
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
	const setupBars = completedBars(setup.bars, 15 * 60_000);
	const regimeBars = completedBars(regime.bars, 4 * 60 * 60_000);
	if (setupBars.length < 55 || regimeBars.length < 55) {
		error(503, 'Waiting for sufficient completed candle history');
	}
	const sample = setup.sample || regime.sample;
	const provider = sample ? 'sample' : setup.provider;
	const signal = computeSignal(setupBars, regimeBars, {
		sample,
		provider,
		symbol: def.display
	});

	return json(signal, {
		headers: { 'Cache-Control': 'public, max-age=10' }
	});
};
