import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export interface LeveragedToken {
	exchange: 'bybit' | 'blofin';
	symbol: string;
	instId: string;
	base: string;
	quote: string;
	label: string;
}

const BYBIT_BASE = 'https://api.bybit.com';
const BLOFIN_BASE = 'https://openapi.blofin.com';
const tokenSuffix = /(?:\d+(?:L|S)|\d+X(?:LONG|SHORT))$/i;

function text(value: unknown): string {
	return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function makeToken(
	exchange: LeveragedToken['exchange'],
	symbol: string,
	instId: string,
	base: string,
	quote: string
): LeveragedToken | null {
	if (!symbol || !instId || !base || !quote || !tokenSuffix.test(base)) return null;
	return {
		exchange,
		symbol,
		instId,
		base,
		quote,
		label: `${base} / ${quote}`
	};
}

async function loadBybit(): Promise<LeveragedToken[]> {
	const out: LeveragedToken[] = [];
	const res = await fetch(`${BYBIT_BASE}/v5/spot-lever-token/info`, {
		headers: { Accept: 'application/json' },
		signal: AbortSignal.timeout(10_000)
	});
	if (!res.ok) throw new Error(`Bybit leveraged-token info HTTP ${res.status}`);
	const body = (await res.json()) as {
		retCode?: number;
		retMsg?: string;
		result?: { list?: Array<Record<string, unknown>> };
	};
	if (body.retCode != null && Number(body.retCode) !== 0) throw new Error(body.retMsg || `Bybit retCode ${body.retCode}`);
	for (const row of body.result?.list ?? []) {
		const status = text(row.ltStatus).toLowerCase();
		if (status && !['1', 'trading', 'online'].includes(status)) continue;
		const base = text(row.ltCoin).toUpperCase();
		const token = makeToken('bybit', base, `${base}USDT`, base, 'USDT');
		if (token) out.push(token);
	}
	return out;
}

async function loadBlofin(): Promise<LeveragedToken[]> {
	const res = await fetch(`${BLOFIN_BASE}/api/v1/spot/market/instruments?instType=SPOT`, {
		headers: { Accept: 'application/json' },
		signal: AbortSignal.timeout(10_000)
	});
	if (!res.ok) throw new Error(`BloFin instruments HTTP ${res.status}`);
	const body = (await res.json()) as { code?: string | number; msg?: string; data?: Array<Record<string, unknown>> };
	if (body.code != null && String(body.code) !== '0') throw new Error(body.msg || `BloFin code ${body.code}`);
	return (body.data ?? []).flatMap((row) => {
		const instId = text(row.instId).toUpperCase();
		const symbol = text(row.symbol).toUpperCase() || instId.replace(/-/g, '');
		const quote = text(row.quoteCurrency).toUpperCase() || instId.split('-')[1] || '';
		const base = text(row.baseCurrency).toUpperCase() || instId.split('-')[0] || '';
		const token = makeToken('blofin', symbol, instId, base, quote);
		return token ? [token] : [];
	});
}

export const GET: RequestHandler = async () => {
	const [bybit, blofin] = await Promise.allSettled([loadBybit(), loadBlofin()]);
	const tokens = [
		...(bybit.status === 'fulfilled' ? bybit.value : []),
		...(blofin.status === 'fulfilled' ? blofin.value : [])
	].sort((a, b) => `${a.exchange}:${a.symbol}`.localeCompare(`${b.exchange}:${b.symbol}`));
	return json(
		{
			ok: true,
			tokens,
			exchanges: {
				bybit: bybit.status === 'fulfilled',
				blofin: blofin.status === 'fulfilled'
			},
			errors: {
				bybit: bybit.status === 'rejected' ? String(bybit.reason) : undefined,
				blofin: blofin.status === 'rejected' ? String(blofin.reason) : undefined
			}
		},
		{ headers: { 'Cache-Control': 'public, max-age=60' } }
	);
};
