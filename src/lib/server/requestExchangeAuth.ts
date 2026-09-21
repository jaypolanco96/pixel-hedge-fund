/**
 * Per-request exchange credentials from client headers (visitor LOGIN).
 * Request headers win over env / .secrets. Used via AsyncLocalStorage so
 * blofin.ts / bybit.ts pick them up without threading Request everywhere.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import {
	LIVE_BLOFIN_BASE,
	LIVE_BYBIT_BASE,
	normalizeExchangeBase,
	type BloFinSecrets,
	type BybitSecrets
} from '$lib/server/exchangeSecrets';

export const PHF_BLOFIN_KEY = 'x-phf-blofin-key';
export const PHF_BLOFIN_SECRET = 'x-phf-blofin-secret';
export const PHF_BLOFIN_PASS = 'x-phf-blofin-pass';
export const PHF_BLOFIN_BROKER = 'x-phf-blofin-broker';
export const PHF_BLOFIN_BASE = 'x-phf-blofin-base';
export const PHF_BYBIT_KEY = 'x-phf-bybit-key';
export const PHF_BYBIT_SECRET = 'x-phf-bybit-secret';
export const PHF_BYBIT_BASE = 'x-phf-bybit-base';
export const PHF_BYBIT_BROKER = 'x-phf-bybit-broker';

export interface RequestExchangeAuth {
	blofin?: BloFinSecrets;
	bybit?: BybitSecrets;
}

export const exchangeAuthAls = new AsyncLocalStorage<RequestExchangeAuth>();

function header(request: Request, name: string): string {
	return (request.headers.get(name) ?? '').trim();
}

export function parseExchangeAuthFromRequest(request: Request): RequestExchangeAuth {
	const out: RequestExchangeAuth = {};

	const bfKey = header(request, PHF_BLOFIN_KEY);
	const bfSecret = header(request, PHF_BLOFIN_SECRET);
	const bfPass = header(request, PHF_BLOFIN_PASS);
	const bfBroker = header(request, PHF_BLOFIN_BROKER);
	const bfBase = header(request, PHF_BLOFIN_BASE);
	if (bfKey && bfSecret && bfPass) {
		out.blofin = {
			apiKey: bfKey,
			apiSecret: bfSecret,
			passphrase: bfPass,
			brokerId: bfBroker || undefined,
			baseUrl: normalizeExchangeBase(bfBase || LIVE_BLOFIN_BASE, 'blofin')
		};
	}

	const byKey = header(request, PHF_BYBIT_KEY);
	const bySecret = header(request, PHF_BYBIT_SECRET);
	const byBase = header(request, PHF_BYBIT_BASE);
	const byBroker = header(request, PHF_BYBIT_BROKER);
	if (byKey && bySecret) {
		out.bybit = {
			apiKey: byKey,
			apiSecret: bySecret,
			brokerId: byBroker || undefined,
			baseUrl: normalizeExchangeBase(byBase || LIVE_BYBIT_BASE, 'bybit')
		};
	}

	return out;
}

export function getRequestBloFin(): BloFinSecrets | undefined {
	return exchangeAuthAls.getStore()?.blofin;
}

export function getRequestBybit(): BybitSecrets | undefined {
	return exchangeAuthAls.getStore()?.bybit;
}

/** Run handler with credentials parsed from the incoming Request. */
export function runWithRequestExchangeAuth<T>(
	request: Request,
	fn: () => T | Promise<T>
): Promise<T> {
	const auth = parseExchangeAuthFromRequest(request);
	return Promise.resolve(exchangeAuthAls.run(auth, fn));
}

export function isVercelRuntime(): boolean {
	return !!process.env.VERCEL;
}
