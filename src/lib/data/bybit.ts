/**
 * Minimal Bybit v5 REST client (server-only).
 * Auth: health + wallet balance + positions + confirmed linear orders.
 * Public: linear tickers for tape / Bybit-only symbols.
 * Never returns API secrets.
 */
import { createHmac } from 'node:crypto';
import { env } from '$env/dynamic/private';
import {
	LIVE_BYBIT_BASE,
	readExchangeSecrets,
	type BybitSecrets
} from '$lib/server/exchangeSecrets';
import { getRequestBybit } from '$lib/server/requestExchangeAuth';
import type {
	BybitBalanceCoin,
	BybitBalanceResponse,
	BybitHealth,
	BybitPosition,
	BybitPositionsResponse,
	BybitTickerRow
} from './bybitTypes';
import type { BybitPlaceOrderBody, BybitTradeWriteResponse } from './bybitTypes';
import type { QuoteResponse } from './types';
import { bybitSpotSymbol, resolveSymbol, spotWireSymbol, type SymbolDef } from './symbols';
import { sampleQuote } from './sample';

export type {
	BybitBalanceResponse,
	BybitHealth,
	BybitPositionsResponse,
	BybitPosition
} from './bybitTypes';

export interface BybitConfig {
	apiKey: string;
	apiSecret: string;
	brokerId?: string;
	passphrase: string;
	baseUrl: string;
	configured: boolean;
}

function num(v: unknown, fallback = 0): number {
	const n = typeof v === 'number' ? v : Number(v);
	return Number.isFinite(n) ? n : fallback;
}

/**
 * Config priority: per-request LOGIN headers → env → local `.secrets` (dev).
 */
export async function getBybitConfig(): Promise<BybitConfig> {
	const fromReq = getRequestBybit();
	if (fromReq?.apiKey && fromReq?.apiSecret) {
		const baseUrl = (fromReq.baseUrl || LIVE_BYBIT_BASE).replace(/\/$/, '');
		return {
			apiKey: fromReq.apiKey.trim(),
			apiSecret: fromReq.apiSecret.trim(),
			brokerId: fromReq.brokerId?.trim() || undefined,
			passphrase: (fromReq.passphrase ?? '').trim(),
			baseUrl,
			configured: true
		};
	}

	let apiKey = (env.BYBIT_API_KEY ?? env.BYBIT_KEY ?? '').trim();
	let apiSecret = (env.BYBIT_API_SECRET ?? env.BYBIT_SECRET ?? '').trim();
	let passphrase = (env.BYBIT_PASSPHRASE ?? env.BYBIT_PASS ?? '').trim();
	let brokerId = (env.BYBIT_BROKER_ID ?? '').trim();
	let rawBase = (env.BYBIT_BASE_URL ?? env.BYBIT_BASE ?? '').trim();

	if (!apiKey || !apiSecret || !rawBase) {
		const file = await readExchangeSecrets();
		const s = (file.bybit ?? {}) as Partial<BybitSecrets>;
		if (!apiKey) apiKey = (s.apiKey ?? '').trim();
		if (!apiSecret) apiSecret = (s.apiSecret ?? '').trim();
		if (!passphrase) passphrase = (s.passphrase ?? '').trim();
		if (!brokerId) brokerId = (s.brokerId ?? '').trim();
		if (!rawBase) rawBase = (s.baseUrl ?? '').trim();
	}

	const baseUrl = (rawBase || LIVE_BYBIT_BASE).replace(/\/$/, '');
	return {
		apiKey,
		apiSecret,
		brokerId: brokerId || undefined,
		passphrase,
		baseUrl,
		configured: !!(apiKey && apiSecret)
	};
}

function signBybit(
	secret: string,
	timestamp: string,
	apiKey: string,
	recvWindow: string,
	payload: string
): string {
	const prehash = `${timestamp}${apiKey}${recvWindow}${payload}`;
	return createHmac('sha256', secret).update(prehash, 'utf8').digest('hex');
}

type Fail = { ok: false; error: string; code?: string; msg?: string; status?: number };
type Ok<T> = { ok: true; data: T; code: string; msg: string };

async function bybitGet<T = unknown>(pathWithQuery: string): Promise<Ok<T> | Fail> {
	const cfg = await getBybitConfig();
	if (!cfg.configured) {
		return { ok: false, error: 'Bybit credentials not configured' };
	}

	const recvWindow = '5000';
	const timestamp = String(Date.now());
	const qIndex = pathWithQuery.indexOf('?');
	const query = qIndex >= 0 ? pathWithQuery.slice(qIndex + 1) : '';
	const signature = signBybit(cfg.apiSecret, timestamp, cfg.apiKey, recvWindow, query);

	try {
		const res = await fetch(`${cfg.baseUrl}${pathWithQuery}`, {
			method: 'GET',
			headers: {
				'X-BAPI-API-KEY': cfg.apiKey,
				'X-BAPI-SIGN': signature,
				'X-BAPI-TIMESTAMP': timestamp,
				'X-BAPI-RECV-WINDOW': recvWindow,
				'X-BAPI-SIGN-TYPE': '2',
				'Content-Type': 'application/json'
			}
		});
		const json = (await res.json().catch(() => null)) as {
			retCode?: number | string;
			retMsg?: string;
			result?: T;
		} | null;

		if (!res.ok) {
			return {
				ok: false,
				status: res.status,
				error: json?.retMsg || `HTTP ${res.status}`,
				code: json?.retCode != null ? String(json.retCode) : String(res.status),
				msg: json?.retMsg
			};
		}
		if (json == null) return { ok: false, error: 'Empty Bybit response' };
		const code = String(json.retCode ?? '');
		if (code !== '0' && code !== '') {
			return {
				ok: false,
				error: json.retMsg || `Bybit retCode ${code}`,
				code,
				msg: json.retMsg
			};
		}
		return {
			ok: true,
			data: json.result as T,
			code: '0',
			msg: json.retMsg || 'OK'
		};
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}

async function bybitPost<T = unknown>(path: string, body: Record<string, unknown>): Promise<Ok<T> | Fail> {
	const cfg = await getBybitConfig();
	if (!cfg.configured) return { ok: false, error: 'Bybit credentials not configured' };
	const recvWindow = '5000';
	const timestamp = String(Date.now());
	const payload = JSON.stringify(body);
	const signature = signBybit(cfg.apiSecret, timestamp, cfg.apiKey, recvWindow, payload);
	try {
		const res = await fetch(`${cfg.baseUrl}${path}`, {
			method: 'POST',
			headers: {
				'X-BAPI-API-KEY': cfg.apiKey,
				'X-BAPI-SIGN': signature,
				'X-BAPI-TIMESTAMP': timestamp,
				'X-BAPI-RECV-WINDOW': recvWindow,
				'X-BAPI-SIGN-TYPE': '2',
				...(cfg.brokerId ? { 'X-Referer': cfg.brokerId } : {}),
				'Content-Type': 'application/json'
			},
			body: payload
		});
		const json = (await res.json().catch(() => null)) as {
			retCode?: number | string;
			retMsg?: string;
			result?: T;
		} | null;
		const code = String(json?.retCode ?? '');
		if (!res.ok || (code !== '0' && code !== '')) {
			return {
				ok: false,
				status: res.status,
				error: json?.retMsg || `HTTP ${res.status}`,
				code: code || String(res.status),
				msg: json?.retMsg
			};
		}
		return { ok: true, data: json?.result as T, code: '0', msg: json?.retMsg || 'OK' };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}

export async function placeBybitOrder(body: BybitPlaceOrderBody): Promise<BybitTradeWriteResponse> {
	if (!['linear', 'spot'].includes(body.category) || !body.symbol || !body.qty) {
		return { ok: false, error: 'linear or spot category, symbol, and qty are required' };
	}
	if (body.orderType === 'Limit' && !(body.price && Number(body.price) > 0)) {
		return { ok: false, error: 'Limit orders require a positive price' };
	}
	if ((body.takeProfit && !body.stopLoss) || (!body.takeProfit && body.stopLoss)) {
		return { ok: false, error: 'takeProfit and stopLoss must be provided together' };
	}
	const payload: Record<string, unknown> = {
		category: body.category,
		symbol: body.symbol,
		side: body.side,
		orderType: body.orderType,
		qty: body.qty,
		timeInForce: body.orderType === 'Limit' ? body.timeInForce ?? 'GTC' : 'IOC',
	};
	if (body.category === 'linear') payload.positionIdx = body.positionIdx ?? 0;
	if (body.price != null) payload.price = body.price;
	if (body.orderLinkId) payload.orderLinkId = body.orderLinkId;
	if (body.category === 'linear' && body.reduceOnly === true) payload.reduceOnly = true;
	if ((body.category === 'linear' || body.category === 'spot') && body.takeProfit && body.stopLoss) {
		payload.takeProfit = body.takeProfit;
		payload.stopLoss = body.stopLoss;
		payload.tpOrderType = 'Market';
		payload.slOrderType = 'Market';
		if (body.category === 'linear') {
			payload.tpslMode = 'Full';
			payload.tpTriggerBy = body.tpTriggerBy ?? 'MarkPrice';
			payload.slTriggerBy = body.slTriggerBy ?? 'MarkPrice';
		}
	}
	const res = await bybitPost<{ orderId?: string; orderLinkId?: string }>('/v5/order/create', payload);
	if (!res.ok) return { ok: false, error: res.error, code: res.code, msg: res.msg };
	return {
		ok: true,
		configured: true,
		orderId: res.data?.orderId,
		orderLinkId: res.data?.orderLinkId,
		code: res.code,
		msg: res.msg
	};
}

export async function checkBybitHealth(): Promise<BybitHealth> {
	const cfg = await getBybitConfig();
	const base: BybitHealth = {
		ok: cfg.configured,
		configured: cfg.configured,
		baseUrl: /bybit\.com/i.test(cfg.baseUrl) ? cfg.baseUrl : '[custom]',
		keyPresent: !!cfg.apiKey,
		secretPresent: !!cfg.apiSecret
	};
	if (!cfg.configured) {
		return { ...base, ok: false, reachable: false, error: 'Missing Bybit API key/secret' };
	}

	const res = await bybitGet<{ list?: unknown[] }>(
		'/v5/account/wallet-balance?accountType=UNIFIED'
	);
	if (!res.ok) {
		return {
			...base,
			ok: false,
			reachable: false,
			error: res.error,
			code: res.code,
			msg: res.msg
		};
	}
	return { ...base, ok: true, reachable: true };
}

export async function fetchBybitBalance(): Promise<BybitBalanceResponse> {
	const cfg = await getBybitConfig();
	if (!cfg.configured) {
		return {
			ok: false,
			configured: false,
			sample: true,
			totalEquityUsd: null,
			coins: [],
			error: 'Bybit credentials not configured'
		};
	}

	const res = await bybitGet<{
		list?: Array<{
			totalEquity?: string;
			coin?: Array<Record<string, unknown>>;
		}>;
	}>('/v5/account/wallet-balance?accountType=UNIFIED');

	if (!res.ok) {
		return {
			ok: false,
			configured: true,
			sample: true,
			totalEquityUsd: null,
			coins: [],
			error: res.error,
			code: res.code,
			msg: res.msg
		};
	}

	const row = Array.isArray(res.data?.list) ? res.data.list[0] : null;
	const coinsRaw = row?.coin ?? [];
	const coins: BybitBalanceCoin[] = coinsRaw.map((c) => ({
		coin: String(c.coin ?? ''),
		equity: num(c.equity),
		available: num(c.availableToWithdraw ?? c.walletBalance),
		walletBalance: num(c.walletBalance),
		unrealisedPnl: num(c.unrealisedPnl)
	}));

	const total = num(row?.totalEquity, NaN);
	return {
		ok: true,
		configured: true,
		sample: false,
		totalEquityUsd: Number.isFinite(total) ? total : null,
		coins
	};
}

// —— Public linear tickers ——

const PUBLIC_BASE = 'https://api.bybit.com';
let tickerCache: { at: number; bySymbol: Map<string, BybitTickerRow> } | null = null;
const TICKER_TTL_MS = 10_000;
let spotTickerCache: { at: number; bySymbol: Map<string, BybitTickerRow> } | null = null;
let spotInstrumentCache: { at: number; symbols: string[] } | null = null;
const COMMON_LEVERAGED_SPOT_SYMBOLS = [
	'BTC3LUSDT', 'BTC3SUSDT', 'ETH3LUSDT', 'ETH3SUSDT',
	'SHIB3LUSDT', 'SHIB3SUSDT', 'SHIB5LUSDT', 'SHIB5SUSDT'
];

async function loadLinearTickers(): Promise<Map<string, BybitTickerRow>> {
	if (tickerCache && Date.now() - tickerCache.at < TICKER_TTL_MS) return tickerCache.bySymbol;
	try {
		const res = await fetch(`${PUBLIC_BASE}/v5/market/tickers?category=linear`, {
			headers: { Accept: 'application/json' },
			signal: AbortSignal.timeout(10_000)
		});
		if (!res.ok) throw new Error(`bybit tickers HTTP ${res.status}`);
		const body = (await res.json()) as {
			retCode?: number;
			result?: { list?: Array<Record<string, unknown>> };
		};
		if (body.retCode != null && Number(body.retCode) !== 0) {
			throw new Error(`bybit retCode ${body.retCode}`);
		}
		const map = new Map<string, BybitTickerRow>();
		for (const row of body.result?.list ?? []) {
			const symbol = String(row.symbol ?? '');
			if (!symbol) continue;
			map.set(symbol, {
				symbol,
				lastPrice: num(row.lastPrice),
				markPrice: num(row.markPrice ?? row.lastPrice),
				bid1Price: num(row.bid1Price ?? row.lastPrice),
				ask1Price: num(row.ask1Price ?? row.lastPrice),
				// Bybit price24hPcnt is a fraction (0.01 = 1%)
				change24hPct: num(row.price24hPcnt) * 100
			});
		}
		tickerCache = { at: Date.now(), bySymbol: map };
		return map;
	} catch (err) {
		console.warn('[Bybit] public tickers failed', err);
		if (tickerCache) return tickerCache.bySymbol;
		return new Map();
	}
}

async function loadSpotTickers(): Promise<Map<string, BybitTickerRow>> {
	if (spotTickerCache && Date.now() - spotTickerCache.at < TICKER_TTL_MS) return spotTickerCache.bySymbol;
	try {
		const res = await fetch(`${PUBLIC_BASE}/v5/market/tickers?category=spot`, {
			headers: { Accept: 'application/json' },
			signal: AbortSignal.timeout(10_000)
		});
		if (!res.ok) throw new Error(`bybit spot tickers HTTP ${res.status}`);
		const body = (await res.json()) as {
			retCode?: number;
			result?: { list?: Array<Record<string, unknown>> };
		};
		if (body.retCode != null && Number(body.retCode) !== 0) throw new Error(`bybit spot retCode ${body.retCode}`);
		const map = new Map<string, BybitTickerRow>();
		for (const row of body.result?.list ?? []) {
			const symbol = String(row.symbol ?? '');
			if (!symbol) continue;
			const last = num(row.lastPrice);
			map.set(symbol, {
				symbol,
				lastPrice: last,
				markPrice: last,
				bid1Price: num(row.bid1Price ?? last),
				ask1Price: num(row.ask1Price ?? last),
				change24hPct: num(row.price24hPcnt) * 100
			});
		}
		spotTickerCache = { at: Date.now(), bySymbol: map };
		return map;
	} catch (err) {
		console.warn('[Bybit] public spot tickers failed', err);
		if (spotTickerCache) return spotTickerCache.bySymbol;
		return new Map();
	}
}

async function loadSpotLeveragedSymbols(): Promise<string[]> {
	if (spotInstrumentCache && Date.now() - spotInstrumentCache.at < 60_000) return spotInstrumentCache.symbols;
	try {
		const res = await fetch(`${PUBLIC_BASE}/v5/spot-lever-token/info`, {
			headers: { Accept: 'application/json' },
			signal: AbortSignal.timeout(10_000)
		});
		if (!res.ok) throw new Error(`bybit leveraged-token info HTTP ${res.status}`);
		const body = (await res.json()) as { retCode?: number; result?: { list?: Array<Record<string, unknown>> } };
		if (body.retCode != null && Number(body.retCode) !== 0) throw new Error(`bybit leveraged-token info retCode ${body.retCode}`);
		const discovered = (body.result?.list ?? [])
			.filter((row) => {
				const status = String(row.ltStatus ?? '').toLowerCase();
				return !status || status === '1' || status === 'trading' || status === 'online';
			})
			.map((row) => String(row.ltCoin ?? '').toUpperCase())
			.filter((coin) => /(?:\d+(?:L|S)|\d+X(?:LONG|SHORT))$/i.test(coin))
			.map((coin) => `${coin}USDT`);
		const symbols = [...new Set([...discovered, ...COMMON_LEVERAGED_SPOT_SYMBOLS])];
		spotInstrumentCache = { at: Date.now(), symbols };
		return symbols;
	} catch (err) {
		console.warn('[Bybit] leveraged spot instruments failed', err);
		return spotInstrumentCache?.symbols ?? [];
	}
}

export function quoteFromBybitTicker(def: SymbolDef, tick: BybitTickerRow): QuoteResponse {
	return {
		symbol: def.canonical,
		display: def.display,
		price: tick.lastPrice,
		mark: tick.markPrice || tick.lastPrice,
		bid: tick.bid1Price || tick.lastPrice,
		ask: tick.ask1Price || tick.lastPrice,
		t: Date.now(),
		provider: 'bybit',
		sample: false,
		change24h: tick.change24hPct
	};
}

/** Public linear ticker → QuoteResponse. SAMPLE on miss. */
export async function fetchBybitQuote(symbolInput?: string | null): Promise<QuoteResponse> {
	const def = resolveSymbol(symbolInput);
	const map = await loadLinearTickers();
	const tick = map.get(def.bybit);
	if (!tick || !tick.lastPrice) {
		console.warn(`[Bybit] quote ${def.display} (${def.bybit}) missing → SAMPLE`);
		return sampleQuote(def.display);
	}
	return quoteFromBybitTicker(def, tick);
}

/** Batch public quotes keyed by display. */
export async function fetchBybitQuotesFor(
	defs: readonly SymbolDef[]
): Promise<Map<string, QuoteResponse>> {
	const out = new Map<string, QuoteResponse>();
	if (!defs.length) return out;
	const map = await loadLinearTickers();
	for (const def of defs) {
		const tick = map.get(def.bybit);
		if (tick?.lastPrice) out.set(def.display, quoteFromBybitTicker(def, tick));
		else out.set(def.display, sampleQuote(def.display));
	}
	return out;
}

/** Batch public spot quotes keyed by PHF display symbol. */
export async function fetchBybitSpotQuotesFor(
	defs: readonly SymbolDef[]
): Promise<Map<string, QuoteResponse>> {
	const out = new Map<string, QuoteResponse>();
	if (!defs.length) return out;
	const map = await loadSpotTickers();
	for (const def of defs) {
		const tick = map.get(bybitSpotSymbol(def));
		if (tick?.lastPrice) out.set(def.display, { ...quoteFromBybitTicker(def, tick), display: def.display });
		else out.set(def.display, sampleQuote(def.display));
	}
	return out;
}

/** Live Bybit leveraged-token quotes for the spot Market Wire. */
export async function fetchBybitSpotLeveragedQuotes(): Promise<QuoteResponse[]> {
	const [symbols, ticks] = await Promise.all([loadSpotLeveragedSymbols(), loadSpotTickers()]);
	return symbols.flatMap((symbol) => {
		const tick = ticks.get(symbol);
		if (!tick?.lastPrice) return [];
		const display = spotWireSymbol(symbol);
		return [{
			symbol: `CRYPTO:BYBIT:${symbol}`,
			display,
			price: tick.lastPrice,
			mark: tick.markPrice,
			bid: tick.bid1Price,
			ask: tick.ask1Price,
			t: Date.now(),
			provider: 'bybit' as const,
			sample: false,
			change24h: tick.change24hPct
		}];
	});
}

export async function fetchBybitPositions(): Promise<BybitPositionsResponse> {
	const cfg = await getBybitConfig();
	if (!cfg.configured) {
		return {
			ok: false,
			configured: false,
			sample: true,
			positions: [],
			error: 'Bybit credentials not configured',
			note: 'Connect Bybit keys in desk settings'
		};
	}

	const res = await bybitGet<{
		list?: Array<Record<string, unknown>>;
	}>('/v5/position/list?category=linear&settleCoin=USDT');

	if (!res.ok) {
		const blocked = /cloudfront|country|forbidden|403/i.test(res.error || '');
		return {
			ok: false,
			configured: true,
			sample: true,
			positions: [],
			error: res.error,
			code: res.code,
			msg: res.msg,
			note: blocked ? 'Bybit network blocked' : res.error
		};
	}

	const rows = Array.isArray(res.data?.list) ? res.data.list : [];
	const positions: BybitPosition[] = rows
		.map((r) => {
			const size = num(r.size);
			const sideRaw = String(r.side ?? 'None');
			let deskSide: 'long' | 'short' | 'flat' = 'flat';
			if (size > 0) {
				if (/^buy$/i.test(sideRaw)) deskSide = 'long';
				else if (/^sell$/i.test(sideRaw)) deskSide = 'short';
			}
			return {
				symbol: String(r.symbol ?? ''),
				side: sideRaw,
				size,
				avgPrice: num(r.avgPrice),
				markPrice: num(r.markPrice),
				leverage: num(r.leverage, 1),
				unrealisedPnl: num(r.unrealisedPnl),
				positionIdx: num(r.positionIdx),
				deskSide
			};
		})
		.filter((p) => p.size > 0 && p.deskSide !== 'flat');

	return {
		ok: true,
		configured: true,
		sample: false,
		positions
	};
}
