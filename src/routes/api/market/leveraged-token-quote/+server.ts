import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

function num(value: unknown): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

export const GET: RequestHandler = async ({ url }) => {
	const exchange = url.searchParams.get('exchange');
	const symbol = url.searchParams.get('symbol')?.trim().toUpperCase();
	if ((exchange !== 'bybit' && exchange !== 'blofin') || !symbol) {
		return json({ ok: false, error: 'exchange and symbol are required' }, { status: 400 });
	}
	try {
		const endpoint = exchange === 'bybit'
			? `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${encodeURIComponent(symbol)}`
			: `https://openapi.blofin.com/api/v1/spot/market/tickers?instType=SPOT&instId=${encodeURIComponent(symbol)}`;
		const res = await fetch(endpoint, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
		const body = (await res.json()) as Record<string, unknown>;
		if (!res.ok) return json({ ok: false, error: `HTTP ${res.status}` }, { status: res.status });
		if (exchange === 'bybit') {
			const row = ((body.result as { list?: Array<Record<string, unknown>> } | undefined)?.list ?? [])[0];
			const price = num(row?.lastPrice);
			return json({ ok: price > 0, exchange, symbol, price, mark: price, sample: false });
		}
		const raw = body.data as Array<Record<string, unknown>> | Record<string, unknown> | undefined;
		const row = Array.isArray(raw) ? raw[0] : raw;
		const price = num(row?.last ?? row?.lastPrice ?? row?.close);
		return json({ ok: price > 0, exchange, symbol, price, mark: price, sample: false });
	} catch (error) {
		return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 });
	}
};
