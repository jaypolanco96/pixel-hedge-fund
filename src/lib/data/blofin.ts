/**
 * BloFin REST client (server-only).
 * GET: balance / positions / orders-pending (+ snapshot cache fallback).
 * POST: allowlisted trade paths only (leverage, margin-mode, order, cancel, close).
 * Never returns API secrets. Never calls transfer / withdraw.
 *
 * On upstream 403 / network failure, serves static/blofin-snapshot.json
 * as offline CACHE (not demo) — labeled fromSnapshot.
 */
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LIVE_BLOFIN_BASE as SECRETS_LIVE_BLOFIN } from '$lib/server/exchangeSecrets';
import { getRequestBloFin } from '$lib/server/requestExchangeAuth';
import { env } from '$env/dynamic/private';
import type {
	BloFinBalanceResponse,
	BloFinCancelOrderBody,
	BloFinClosePositionBody,
	BloFinHealth,
	BloFinMode,
	BloFinOrder,
	BloFinOrdersResponse,
	BloFinPlaceOrderBody,
	BloFinSpotPlaceOrderBody,
	BloFinPosition,
	BloFinPositionsResponse,
	BloFinSetLeverageBody,
	BloFinSetMarginModeBody,
	BloFinTradeWriteResponse
} from './blofinTypes';

export type {
	BloFinBalanceResponse,
	BloFinHealth,
	BloFinMode,
	BloFinOrder,
	BloFinOrdersResponse,
	BloFinPosition,
	BloFinPositionsResponse,
	BloFinTradeWriteResponse
} from './blofinTypes';

/** Live production root — demo URL is never the default. */
const LIVE_BASE = 'https://openapi.blofin.com';
const DEMO_BASE = 'https://demo-trading-openapi.blofin.com';

/** Allowlisted GET paths only. */
const ALLOWED_GET = new Set([
	'/api/v1/account/balance',
	'/api/v1/account/positions',
	'/api/v1/trade/orders-pending',
	'/api/v1/asset/balances'
]);

/** Allowlisted POST trade paths only — hard reject anything else. */
const ALLOWED_POST = new Set([
	'/api/v1/account/set-leverage',
	'/api/v1/account/set-margin-mode',
	'/api/v1/trade/order',
	'/api/v1/spot/trade/order',
	'/api/v1/trade/cancel-order',
	'/api/v1/trade/close-position'
]);

export interface BloFinConfig {
	apiKey: string;
	apiSecret: string;
	passphrase: string;
	brokerId?: string;
	baseUrl: string;
	mode: BloFinMode;
	configured: boolean;
}

/** Desk-lead snapshot file — offline cache, not demo. */
export interface BloFinSnapshotFile {
	sample?: boolean;
	source?: string;
	mode?: BloFinMode;
	baseUrl?: string;
	syncedAt?: string;
	note?: string;
	balance?: {
		totalEquity?: string | number;
		details?: Array<Record<string, unknown>>;
		[key: string]: unknown;
	};
	positions?: Array<Record<string, unknown>>;
	orders?: Array<Record<string, unknown>>;
}

function num(v: unknown, fallback = 0): number {
	const n = typeof v === 'number' ? v : Number(v);
	return Number.isFinite(n) ? n : fallback;
}

function numOrNull(v: unknown): number | null {
	if (v == null || v === '') return null;
	const n = typeof v === 'number' ? v : Number(v);
	return Number.isFinite(n) ? n : null;
}


/** Sync read of `.secrets/exchanges.json` blofin block (env still wins). */
function readBloFinSecretsFile(): {
	apiKey?: string;
	apiSecret?: string;
	passphrase?: string;
	brokerId?: string;
	baseUrl?: string;
} {
	try {
		const raw = readFileSync(join(process.cwd(), '.secrets', 'exchanges.json'), 'utf8');
		const parsed = JSON.parse(raw) as { blofin?: Record<string, string> };
		return parsed?.blofin ?? {};
	} catch {
		return {};
	}
}

/**
 * Config priority: per-request LOGIN headers → env → local `.secrets` (dev).
 * On Vercel, visitors supply keys via Desk LOGIN (sessionStorage → request headers).
 */
export function getBloFinConfig(): BloFinConfig {
	const fromReq = getRequestBloFin();
	if (fromReq?.apiKey && fromReq?.apiSecret && fromReq?.passphrase) {
		const baseUrl = (fromReq.baseUrl || LIVE_BASE || SECRETS_LIVE_BLOFIN).replace(/\/$/, '');
		const mode: BloFinMode = /demo/i.test(baseUrl) ? 'demo' : 'live';
		return {
			apiKey: fromReq.apiKey.trim(),
			apiSecret: fromReq.apiSecret.trim(),
			passphrase: fromReq.passphrase.trim(),
			brokerId: fromReq.brokerId?.trim() || undefined,
			baseUrl,
			mode,
			configured: true
		};
	}

	const file = readBloFinSecretsFile();
	const apiKey = (env.BLOFIN_API_KEY ?? env.BLOFIN_KEY ?? file.apiKey ?? '').trim();
	const apiSecret = (env.BLOFIN_API_SECRET ?? env.BLOFIN_SECRET ?? file.apiSecret ?? '').trim();
	const passphrase = (env.BLOFIN_PASSPHRASE ?? env.BLOFIN_PASS ?? file.passphrase ?? '').trim();
	const brokerId = (env.BLOFIN_BROKER_ID ?? file.brokerId ?? '').trim();
	const rawBase = (env.BLOFIN_BASE_URL ?? env.BLOFIN_BASE ?? file.baseUrl ?? '').trim();
	const baseUrl = (rawBase || LIVE_BASE || SECRETS_LIVE_BLOFIN).replace(/\/$/, '');
	const mode: BloFinMode = /demo/i.test(baseUrl) ? 'demo' : 'live';
	return {
		apiKey,
		apiSecret,
		passphrase,
		brokerId: brokerId || undefined,
		baseUrl,
		mode,
		configured: !!(apiKey && apiSecret && passphrase)
	};
}

function sign(
	secret: string,
	method: string,
	pathWithQuery: string,
	timestamp: string,
	nonce: string,
	body = ''
): string {
	const prehash = `${pathWithQuery}${method.toUpperCase()}${timestamp}${nonce}${body}`;
	const hex = createHmac('sha256', secret).update(prehash, 'utf8').digest('hex');
	return Buffer.from(hex, 'utf8').toString('base64');
}

type Fail = { ok: false; error: string; status?: number; code?: string; msg?: string };
type Ok<T> = { ok: true; data: T; raw: unknown };

async function blofinGet<T = unknown>(pathWithQuery: string): Promise<Ok<T> | Fail> {
	const pathOnly = pathWithQuery.split('?')[0];
	if (!ALLOWED_GET.has(pathOnly)) {
		return { ok: false, error: `Path not allowlisted for GET: ${pathOnly}` };
	}

	const cfg = getBloFinConfig();
	if (!cfg.configured) {
		return {
			ok: false,
			error: 'BloFin credentials not configured (BLOFIN_API_KEY / SECRET / PASSPHRASE)'
		};
	}

	const timestamp = String(Date.now());
	const nonce = randomUUID();
	const signature = sign(cfg.apiSecret, 'GET', pathWithQuery, timestamp, nonce, '');

	try {
		const res = await fetch(`${cfg.baseUrl}${pathWithQuery}`, {
			method: 'GET',
			headers: {
				'ACCESS-KEY': cfg.apiKey,
				'ACCESS-SIGN': signature,
				'ACCESS-TIMESTAMP': timestamp,
				'ACCESS-NONCE': nonce,
				'ACCESS-PASSPHRASE': cfg.passphrase,
				'Content-Type': 'application/json'
			}
		});
		const json = (await res.json().catch(() => null)) as {
			code?: string | number;
			msg?: string;
			data?: T;
		} | null;

		if (!res.ok) {
			return {
				ok: false,
				status: res.status,
				error: json?.msg || `HTTP ${res.status}`,
				code: json?.code != null ? String(json.code) : String(res.status),
				msg: json?.msg
			};
		}
		if (json == null) return { ok: false, error: 'Empty BloFin response' };
		const code = String(json.code ?? '');
		if (code !== '0' && code !== '') {
			return {
				ok: false,
				error:
					code === '152012'
						? 'BloFin brokerId is required for this API key. Add BLOFIN_BROKER_ID or enter it in Desk Login.'
						: json.msg || `BloFin code ${code}`,
				status: res.status,
				code,
				msg: json.msg
			};
		}
		return { ok: true, data: json.data as T, raw: json };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}

/** Signed POST to allowlisted trade path only. */
async function blofinPost<T = unknown>(
	path: string,
	body: Record<string, unknown>
): Promise<Ok<T> | Fail> {
	if (!ALLOWED_POST.has(path)) {
		return { ok: false, error: `Path not allowlisted for POST: ${path}` };
	}

	const cfg = getBloFinConfig();
	if (!cfg.configured) {
		return {
			ok: false,
			error: 'BloFin credentials not configured (BLOFIN_API_KEY / SECRET / PASSPHRASE)'
		};
	}

	const bodyStr = JSON.stringify(body);
	const timestamp = String(Date.now());
	const nonce = randomUUID();
	const signature = sign(cfg.apiSecret, 'POST', path, timestamp, nonce, bodyStr);

	try {
		const res = await fetch(`${cfg.baseUrl}${path}`, {
			method: 'POST',
			headers: {
				'ACCESS-KEY': cfg.apiKey,
				'ACCESS-SIGN': signature,
				'ACCESS-TIMESTAMP': timestamp,
				'ACCESS-NONCE': nonce,
				'ACCESS-PASSPHRASE': cfg.passphrase,
				'Content-Type': 'application/json'
			},
			body: bodyStr
		});
		const json = (await res.json().catch(() => null)) as {
			code?: string | number;
			msg?: string;
			data?: T;
		} | null;

		if (!res.ok) {
			return {
				ok: false,
				status: res.status,
				error: json?.msg || `HTTP ${res.status}`,
				code: json?.code != null ? String(json.code) : String(res.status),
				msg: json?.msg
			};
		}
		if (json == null) return { ok: false, error: 'Empty BloFin response' };
		const code = String(json.code ?? '');
		if (code !== '0' && code !== '') {
			return {
				ok: false,
				error:
					code === '152012'
						? 'BloFin brokerId is required for this API key. Add BLOFIN_BROKER_ID or enter it in Desk Login.'
						: json.msg || `BloFin code ${code}`,
				status: res.status,
				code,
				msg: json.msg
			};
		}
		return { ok: true, data: json.data as T, raw: json };
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err.message : String(err) };
	}
}

function writeResult(
	path: string,
	res: Ok<unknown> | Fail,
	cfg: BloFinConfig
): BloFinTradeWriteResponse {
	if (!res.ok) {
		return {
			ok: false,
			mode: cfg.mode,
			path,
			error: res.error,
			code: res.code,
			msg: res.msg ?? res.error,
			httpStatus: res.status
		};
	}
	return { ok: true, mode: cfg.mode, path, data: res.data };
}

/** 403, network, or missing credentials → serve desk snapshot cache. */
export function shouldFallbackToSnapshot(fail: Fail, configured: boolean): boolean {
	if (!configured) return true;
	if (fail.status === 403) return true;
	if (fail.status == null) return true;
	return /network|fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|403|blocked/i.test(
		fail.error
	);
}

let snapshotCache: BloFinSnapshotFile | null | undefined;

export async function loadBloFinSnapshot(
	fetchSnapshot?: () => Promise<Response>
): Promise<BloFinSnapshotFile | null> {
	if (snapshotCache !== undefined) return snapshotCache;

	const candidates = [
		join(process.cwd(), 'static', 'blofin-snapshot.json'),
		join(process.cwd(), 'blofin-snapshot.json'),
		join(process.cwd(), '.svelte-kit', 'output', 'client', 'blofin-snapshot.json')
	];
	for (const filePath of candidates) {
		try {
			const raw = await readFile(filePath, 'utf8');
			snapshotCache = JSON.parse(raw) as BloFinSnapshotFile;
			return snapshotCache;
		} catch {
			/* try next */
		}
	}

	if (fetchSnapshot) {
		try {
			const res = await fetchSnapshot();
			if (res.ok) {
				snapshotCache = (await res.json()) as BloFinSnapshotFile;
				return snapshotCache;
			}
		} catch {
			/* ignore */
		}
	}

	snapshotCache = null;
	return null;
}

function snapMode(snap: BloFinSnapshotFile, cfg: BloFinConfig): BloFinMode {
	if (snap.mode === 'live' || snap.mode === 'demo') return snap.mode;
	return cfg.mode;
}

function mapBalanceFromSnapshot(
	snap: BloFinSnapshotFile,
	cfg: BloFinConfig
): BloFinBalanceResponse {
	const bal = snap.balance;
	const details = (bal?.details ?? []).map((d) => ({
		currency: String(d.currency ?? ''),
		equity: num(d.equity),
		balance: num(d.balance),
		available: num(d.available ?? d.availableEquity),
		frozen: num(d.frozen),
		unrealizedPnl: numOrNull(d.isolatedUnrealizedPnl) ?? undefined
	}));
	return {
		ok: true,
		mode: snapMode(snap, cfg),
		sample: false,
		totalEquityUsd: numOrNull(bal?.totalEquity),
		details,
		fromSnapshot: true,
		syncedAt: snap.syncedAt
	};
}

function normalizeSide(positionSide: string, positionsQty: number): 'long' | 'short' | 'flat' {
	const ps = positionSide.toLowerCase();
	if (ps === 'long') return 'long';
	if (ps === 'short') return 'short';
	if (ps === 'net') {
		if (positionsQty > 0) return 'long';
		if (positionsQty < 0) return 'short';
		return 'flat';
	}
	if (positionsQty > 0) return 'long';
	if (positionsQty < 0) return 'short';
	return 'flat';
}

export function buildPositionWarnings(positions: BloFinPosition[]): string[] {
	const warnings: string[] = [];
	for (const p of positions) {
		if (p.leverage >= 50) {
			warnings.push(`${p.instId}: high leverage ${p.leverage}×`);
		}
		if (p.marginRatio != null && p.marginRatio < 2) {
			warnings.push(`${p.instId}: thin margin ratio ${p.marginRatio.toFixed(2)}`);
		}
		if (
			p.liquidationPrice != null &&
			p.markPrice > 0 &&
			Math.abs(p.markPrice - p.liquidationPrice) / p.markPrice < 0.05
		) {
			warnings.push(`${p.instId}: mark within 5% of liquidation`);
		}
		if (p.unrealizedPnlRatio != null && p.unrealizedPnlRatio < -0.25) {
			warnings.push(
				`${p.instId}: unrealized loss ${(p.unrealizedPnlRatio * 100).toFixed(0)}%`
			);
		}
	}
	if (positions.length >= 8) {
		warnings.push(`Busy book: ${positions.length} open positions`);
	}
	return warnings;
}

function mapPositionsFromSnapshot(
	snap: BloFinSnapshotFile,
	cfg: BloFinConfig
): BloFinPositionsResponse {
	const rows = Array.isArray(snap.positions) ? snap.positions : [];
	const positions: BloFinPosition[] = rows
		.map((r) => {
			const size = num(r.positions ?? r.availablePositions ?? r.size);
			const positionSide = String(r.positionSide ?? 'net');
			return {
				positionId: String(r.positionId ?? `${r.instId}-${positionSide}`),
				instId: String(r.instId ?? ''),
				positionSide,
				side: normalizeSide(positionSide, size),
				size: Math.abs(size),
				leverage: num(r.leverage, 1),
				averagePrice: num(r.averagePrice),
				markPrice: num(r.markPrice),
				margin: numOrNull(r.margin ?? r.initialMargin),
				marginRatio: numOrNull(r.marginRatio),
				liquidationPrice: numOrNull(r.liquidationPrice),
				unrealizedPnl: num(r.unrealizedPnl),
				unrealizedPnlRatio: numOrNull(r.unrealizedPnlRatio),
				marginMode: String(r.marginMode ?? '')
			};
		})
		.filter((p) => p.size > 0 && p.instId);

	return {
		ok: true,
		mode: snapMode(snap, cfg),
		sample: false,
		positions,
		warnings: buildPositionWarnings(positions),
		fromSnapshot: true,
		syncedAt: snap.syncedAt
	};
}

function mapOrdersFromSnapshot(
	snap: BloFinSnapshotFile,
	cfg: BloFinConfig
): BloFinOrdersResponse {
	const rows = Array.isArray(snap.orders) ? snap.orders : [];
	const orders: BloFinOrder[] = rows.map((r) => ({
		orderId: String(r.orderId ?? r.id ?? ''),
		instId: String(r.instId ?? ''),
		side: String(r.side ?? ''),
		orderType: String(r.orderType ?? r.type ?? ''),
		price: numOrNull(r.price),
		size: num(r.size ?? r.quantity),
		filledSize: num(r.filledSize ?? r.fillSize ?? r.accFillSize),
		state: String(r.state ?? r.status ?? 'live'),
		positionSide: String(r.positionSide ?? ''),
		leverage: numOrNull(r.leverage),
		createTime: numOrNull(r.createTime ?? r.cTime ?? r.ts)
	}));

	return {
		ok: true,
		mode: snapMode(snap, cfg),
		sample: false,
		orders,
		fromSnapshot: true,
		syncedAt: snap.syncedAt
	};
}

export function healthSnapshot(): BloFinHealth {
	const cfg = getBloFinConfig();
	return {
		ok: cfg.configured,
		mode: cfg.mode,
		baseUrl: /blofin\.com/i.test(cfg.baseUrl) ? cfg.baseUrl : '[custom]',
		keyPresent: !!cfg.apiKey,
		secretPresent: !!cfg.apiSecret,
		passphrasePresent: !!cfg.passphrase,
		configured: cfg.configured,
		writesEnabled: cfg.configured
	};
}

export async function checkHealth(
	fetchSnapshot?: () => Promise<Response>
): Promise<BloFinHealth> {
	const base = healthSnapshot();
	const cfg = getBloFinConfig();
	/** Writes are "enabled" when keys exist — network reachability is separate. */
	const writesEnabled = cfg.configured;

	if (!cfg.configured) {
		const snap = await loadBloFinSnapshot(fetchSnapshot);
		if (snap) {
			return {
				...base,
				ok: true,
				reachable: false,
				networkBlocked: false,
				mode: snapMode(snap, cfg),
				baseUrl: snap.baseUrl && /blofin\.com/i.test(snap.baseUrl) ? snap.baseUrl : base.baseUrl,
				fromSnapshot: true,
				syncedAt: snap.syncedAt,
				writesEnabled: false,
				error: 'Live credentials missing — serving offline cache (not demo)'
			};
		}
		return {
			...base,
			ok: false,
			reachable: false,
			networkBlocked: false,
			writesEnabled: false,
			error: 'Missing BLOFIN_* credentials'
		};
	}

	const res = await blofinGet<{ totalEquity?: string } | Record<string, unknown>>(
		'/api/v1/account/balance'
	);
	if (!res.ok) {
		const networkBlocked =
			res.status === 403 ||
			res.status == null ||
			/network|fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|403|blocked/i.test(res.error);

		if (shouldFallbackToSnapshot(res, true)) {
			const snap = await loadBloFinSnapshot(fetchSnapshot);
			if (snap) {
				return {
					...base,
					ok: true,
					reachable: false,
					networkBlocked,
					mode: snapMode(snap, cfg),
					fromSnapshot: true,
					syncedAt: snap.syncedAt,
					writesEnabled,
					error: networkBlocked
						? `BloFin unreachable from this network (${res.status ?? 'net'}) — keys OK, serving offline cache`
						: `Upstream ${res.error} — serving offline cache (not demo)`
				};
			}
		}
		return {
			...base,
			ok: false,
			reachable: false,
			networkBlocked,
			writesEnabled,
			error: res.error
		};
	}
	return {
		...base,
		ok: true,
		reachable: true,
		networkBlocked: false,
		writesEnabled
	};
}

export async function fetchBalance(
	fetchSnapshot?: () => Promise<Response>
): Promise<BloFinBalanceResponse> {
	const cfg = getBloFinConfig();
	const res = await blofinGet<{
		totalEquity?: string;
		details?: Array<Record<string, unknown>>;
	}>('/api/v1/account/balance');

	if (!res.ok) {
		if (shouldFallbackToSnapshot(res, cfg.configured)) {
			const snap = await loadBloFinSnapshot(fetchSnapshot);
			if (snap?.balance) return mapBalanceFromSnapshot(snap, cfg);
		}
		return {
			ok: false,
			mode: cfg.mode,
			sample: true,
			totalEquityUsd: null,
			details: [],
			error: res.error
		};
	}

	const details = (res.data?.details ?? []).map((d) => ({
		currency: String(d.currency ?? ''),
		equity: num(d.equity),
		balance: num(d.balance),
		available: num(d.available ?? d.availableEquity),
		frozen: num(d.frozen),
		unrealizedPnl: numOrNull(d.isolatedUnrealizedPnl) ?? undefined
	}));

	return {
		ok: true,
		mode: cfg.mode,
		sample: false,
		totalEquityUsd: numOrNull(res.data?.totalEquity),
		details
	};
}

export async function fetchPositions(
	fetchSnapshot?: () => Promise<Response>
): Promise<BloFinPositionsResponse> {
	const cfg = getBloFinConfig();
	const res = await blofinGet<Array<Record<string, unknown>>>('/api/v1/account/positions');
	if (!res.ok) {
		if (shouldFallbackToSnapshot(res, cfg.configured)) {
			const snap = await loadBloFinSnapshot(fetchSnapshot);
			if (snap) return mapPositionsFromSnapshot(snap, cfg);
		}
		return {
			ok: false,
			mode: cfg.mode,
			sample: true,
			positions: [],
			warnings: [],
			error: res.error
		};
	}

	const rows = Array.isArray(res.data) ? res.data : [];
	const positions: BloFinPosition[] = rows
		.map((r) => {
			const size = num(r.positions ?? r.availablePositions);
			const positionSide = String(r.positionSide ?? 'net');
			return {
				positionId: String(r.positionId ?? `${r.instId}-${positionSide}`),
				instId: String(r.instId ?? ''),
				positionSide,
				side: normalizeSide(positionSide, size),
				size: Math.abs(size),
				leverage: num(r.leverage, 1),
				averagePrice: num(r.averagePrice),
				markPrice: num(r.markPrice),
				margin: numOrNull(r.margin ?? r.initialMargin),
				marginRatio: numOrNull(r.marginRatio),
				liquidationPrice: numOrNull(r.liquidationPrice),
				unrealizedPnl: num(r.unrealizedPnl),
				unrealizedPnlRatio: numOrNull(r.unrealizedPnlRatio),
				marginMode: String(r.marginMode ?? '')
			};
		})
		.filter((p) => p.size > 0 && p.instId);

	return {
		ok: true,
		mode: cfg.mode,
		sample: false,
		positions,
		warnings: buildPositionWarnings(positions)
	};
}

export async function fetchOrders(
	fetchSnapshot?: () => Promise<Response>
): Promise<BloFinOrdersResponse> {
	const cfg = getBloFinConfig();
	const res = await blofinGet<Array<Record<string, unknown>>>('/api/v1/trade/orders-pending');
	if (!res.ok) {
		if (shouldFallbackToSnapshot(res, cfg.configured)) {
			const snap = await loadBloFinSnapshot(fetchSnapshot);
			if (snap) return mapOrdersFromSnapshot(snap, cfg);
		}
		return {
			ok: false,
			mode: cfg.mode,
			sample: true,
			orders: [],
			error: res.error
		};
	}

	const rows = Array.isArray(res.data) ? res.data : [];
	const orders: BloFinOrder[] = rows.map((r) => ({
		orderId: String(r.orderId ?? r.id ?? ''),
		instId: String(r.instId ?? ''),
		side: String(r.side ?? ''),
		orderType: String(r.orderType ?? r.type ?? ''),
		price: numOrNull(r.price),
		size: num(r.size ?? r.quantity),
		filledSize: num(r.filledSize ?? r.fillSize ?? r.accFillSize),
		state: String(r.state ?? r.status ?? 'live'),
		positionSide: String(r.positionSide ?? ''),
		leverage: numOrNull(r.leverage),
		createTime: numOrNull(r.createTime ?? r.cTime ?? r.ts)
	}));

	return {
		ok: true,
		mode: cfg.mode,
		sample: false,
		orders
	};
}

/* ─── Write helpers (validated bodies → allowlisted POST) ─── */

function strField(v: unknown): string | null {
	if (v == null) return null;
	const s = String(v).trim();
	return s ? s : null;
}

export async function setLeverage(body: BloFinSetLeverageBody): Promise<BloFinTradeWriteResponse> {
	const cfg = getBloFinConfig();
	const path = '/api/v1/account/set-leverage';
	const instId = strField(body.instId);
	const leverage = strField(body.leverage);
	const marginMode = body.marginMode;
	if (!instId || !leverage) {
		return { ok: false, mode: cfg.mode, path, error: 'instId and leverage required' };
	}
	if (marginMode !== 'isolated' && marginMode !== 'cross') {
		return { ok: false, mode: cfg.mode, path, error: 'marginMode must be isolated|cross' };
	}
	const levNum = Number(leverage);
	if (!Number.isFinite(levNum) || levNum < 1 || levNum > 125) {
		return { ok: false, mode: cfg.mode, path, error: 'leverage must be 1–125' };
	}
	const payload: Record<string, unknown> = {
		instId,
		leverage: String(levNum),
		marginMode
	};
	if (body.positionSide === 'long' || body.positionSide === 'short' || body.positionSide === 'net') {
		payload.positionSide = body.positionSide;
	}
	const res = await blofinPost(path, payload);
	return writeResult(path, res, cfg);
}

export async function setMarginMode(
	body: BloFinSetMarginModeBody
): Promise<BloFinTradeWriteResponse> {
	const cfg = getBloFinConfig();
	const path = '/api/v1/account/set-margin-mode';
	if (body.marginMode !== 'isolated' && body.marginMode !== 'cross') {
		return { ok: false, mode: cfg.mode, path, error: 'marginMode must be isolated|cross' };
	}
	const res = await blofinPost(path, { marginMode: body.marginMode });
	return writeResult(path, res, cfg);
}

export async function placeOrder(body: BloFinPlaceOrderBody): Promise<BloFinTradeWriteResponse> {
	const cfg = getBloFinConfig();
	const path = '/api/v1/trade/order';
	const instId = strField(body.instId);
	const size = strField(body.size);
	if (!instId || !size) {
		return { ok: false, mode: cfg.mode, path, error: 'instId and size required' };
	}
	if (body.marginMode !== 'isolated' && body.marginMode !== 'cross') {
		return { ok: false, mode: cfg.mode, path, error: 'marginMode must be isolated|cross' };
	}
	if (body.side !== 'buy' && body.side !== 'sell') {
		return { ok: false, mode: cfg.mode, path, error: 'side must be buy|sell' };
	}
	if (body.orderType !== 'market' && body.orderType !== 'limit') {
		return { ok: false, mode: cfg.mode, path, error: 'orderType must be market|limit' };
	}
	const sizeNum = Number(size);
	if (!Number.isFinite(sizeNum) || sizeNum <= 0) {
		return { ok: false, mode: cfg.mode, path, error: 'size must be a positive number' };
	}
	const payload: Record<string, unknown> = {
		instId,
		marginMode: body.marginMode,
		side: body.side,
		orderType: body.orderType,
		size: String(size)
	};
	if (cfg.brokerId) payload.brokerId = cfg.brokerId;
	if (body.orderType === 'limit') {
		const price = strField(body.price);
		if (!price || !(Number(price) > 0)) {
			return { ok: false, mode: cfg.mode, path, error: 'limit orders require a positive price' };
		}
		payload.price = price;
	}
	if (body.positionSide === 'long' || body.positionSide === 'short' || body.positionSide === 'net') {
		payload.positionSide = body.positionSide;
	}
	if (body.reduceOnly === true) payload.reduceOnly = true;
	const coid = strField(body.clientOrderId);
	if (coid) payload.clientOrderId = coid;
	const tpTrigger = strField(body.tpTriggerPrice);
	const tpOrder = strField(body.tpOrderPrice);
	const slTrigger = strField(body.slTriggerPrice);
	const slOrder = strField(body.slOrderPrice);
	if ((tpTrigger && !tpOrder) || (!tpTrigger && tpOrder)) {
		return { ok: false, mode: cfg.mode, path, error: 'tpTriggerPrice and tpOrderPrice must be provided together' };
	}
	if ((slTrigger && !slOrder) || (!slTrigger && slOrder)) {
		return { ok: false, mode: cfg.mode, path, error: 'slTriggerPrice and slOrderPrice must be provided together' };
	}
	if (tpTrigger) {
		if (!(Number(tpTrigger) > 0)) return { ok: false, mode: cfg.mode, path, error: 'tpTriggerPrice must be positive' };
		payload.tpTriggerPrice = tpTrigger;
		payload.tpOrderPrice = tpOrder;
		payload.tpTriggerPriceType = body.tpTriggerPriceType ?? 'mark';
	}
	if (slTrigger) {
		if (!(Number(slTrigger) > 0)) return { ok: false, mode: cfg.mode, path, error: 'slTriggerPrice must be positive' };
		payload.slTriggerPrice = slTrigger;
		payload.slOrderPrice = slOrder;
		payload.slTriggerPriceType = body.slTriggerPriceType ?? 'mark';
	}

	const res = await blofinPost(path, payload);
	return writeResult(path, res, cfg);
}

export async function placeSpotOrder(body: BloFinSpotPlaceOrderBody): Promise<BloFinTradeWriteResponse> {
	const cfg = getBloFinConfig();
	const path = '/api/v1/spot/trade/order';
	const instId = strField(body.instId);
	const size = strField(body.size);
	if (body.instType !== 'SPOT' || !instId || !size) {
		return { ok: false, mode: cfg.mode, path, error: 'SPOT instType, instId, and size are required' };
	}
	if (body.side !== 'buy' && body.side !== 'sell') {
		return { ok: false, mode: cfg.mode, path, error: 'side must be buy|sell' };
	}
	if (!['market', 'limit'].includes(body.orderType)) {
		return { ok: false, mode: cfg.mode, path, error: 'orderType must be market|limit' };
	}
	const sizeNum = Number(size);
	if (!Number.isFinite(sizeNum) || sizeNum <= 0) {
		return { ok: false, mode: cfg.mode, path, error: 'size must be a positive number' };
	}
	const payload: Record<string, unknown> = {
		instType: 'SPOT',
		instId,
		side: body.side,
		orderType: body.orderType,
		size: String(size)
	};
	if (cfg.brokerId) payload.brokerId = cfg.brokerId;
	if (body.targetCurrency) payload.targetCurrency = body.targetCurrency;
	if (body.orderType === 'limit') {
		const price = strField(body.price);
		if (!price || !(Number(price) > 0)) {
			return { ok: false, mode: cfg.mode, path, error: 'spot limit orders require a positive price' };
		}
		payload.price = price;
	}
	const coid = strField(body.clientOrderId);
	if (coid) payload.clientOrderId = coid;
	const res = await blofinPost(path, payload);
	return writeResult(path, res, cfg);
}

export async function cancelOrder(body: BloFinCancelOrderBody): Promise<BloFinTradeWriteResponse> {
	const cfg = getBloFinConfig();
	const path = '/api/v1/trade/cancel-order';
	const instId = strField(body.instId);
	const orderId = strField(body.orderId);
	const clientOrderId = strField(body.clientOrderId);
	if (!instId) {
		return { ok: false, mode: cfg.mode, path, error: 'instId required' };
	}
	if (!orderId && !clientOrderId) {
		return { ok: false, mode: cfg.mode, path, error: 'orderId or clientOrderId required' };
	}
	const payload: Record<string, unknown> = { instId };
	if (orderId) payload.orderId = orderId;
	if (clientOrderId) payload.clientOrderId = clientOrderId;
	const res = await blofinPost(path, payload);
	return writeResult(path, res, cfg);
}

export async function closePosition(
	body: BloFinClosePositionBody
): Promise<BloFinTradeWriteResponse> {
	const cfg = getBloFinConfig();
	const path = '/api/v1/trade/close-position';
	const instId = strField(body.instId);
	if (!instId) {
		return { ok: false, mode: cfg.mode, path, error: 'instId required' };
	}
	if (body.marginMode !== 'isolated' && body.marginMode !== 'cross') {
		return { ok: false, mode: cfg.mode, path, error: 'marginMode must be isolated|cross' };
	}
	if (
		body.positionSide !== 'long' &&
		body.positionSide !== 'short' &&
		body.positionSide !== 'net'
	) {
		return { ok: false, mode: cfg.mode, path, error: 'positionSide must be long|short|net' };
	}
	const payload: Record<string, unknown> = {
		instId,
		marginMode: body.marginMode,
		positionSide: body.positionSide
	};
	const coid = strField(body.clientOrderId);
	if (coid) payload.clientOrderId = coid;
	const res = await blofinPost(path, payload);
	return writeResult(path, res, cfg);
}

/** Exported for tests / docs — demo base is opt-in only via BLOFIN_BASE_URL. */
export const BLOFIN_URLS = { LIVE_BASE, DEMO_BASE } as const;
