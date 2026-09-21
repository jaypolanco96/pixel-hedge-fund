/**
 * Attach per-visitor exchange credentials as request headers (HTTPS on Vercel).
 * Only sets headers when that exchange is fully configured in sessionStorage.
 */
import { loadExchangeKeys } from './exchangeKeys';

export const PHF_BLOFIN_KEY = 'x-phf-blofin-key';
export const PHF_BLOFIN_SECRET = 'x-phf-blofin-secret';
export const PHF_BLOFIN_PASS = 'x-phf-blofin-pass';
export const PHF_BLOFIN_BROKER = 'x-phf-blofin-broker';
export const PHF_BLOFIN_BASE = 'x-phf-blofin-base';
export const PHF_BYBIT_KEY = 'x-phf-bybit-key';
export const PHF_BYBIT_SECRET = 'x-phf-bybit-secret';
export const PHF_BYBIT_BASE = 'x-phf-bybit-base';
export const PHF_BYBIT_BROKER = 'x-phf-bybit-broker';

/** Headers for /api/blofin/* and /api/bybit/* (omit when not configured). */
export function exchangeAuthHeaders(): Record<string, string> {
	const keys = loadExchangeKeys();
	const headers: Record<string, string> = {};
	const bf = keys.blofin;
	if (bf?.apiKey?.trim() && bf?.apiSecret?.trim() && bf?.passphrase?.trim()) {
		headers[PHF_BLOFIN_KEY] = bf.apiKey.trim();
		headers[PHF_BLOFIN_SECRET] = bf.apiSecret.trim();
		headers[PHF_BLOFIN_PASS] = bf.passphrase.trim();
		if (bf.brokerId?.trim()) headers[PHF_BLOFIN_BROKER] = bf.brokerId.trim();
		if (bf.baseUrl?.trim()) headers[PHF_BLOFIN_BASE] = bf.baseUrl.trim().replace(/\/$/, '');
	}
	const by = keys.bybit;
	if (by?.apiKey?.trim() && by?.apiSecret?.trim()) {
		headers[PHF_BYBIT_KEY] = by.apiKey.trim();
		headers[PHF_BYBIT_SECRET] = by.apiSecret.trim();
		if (by.brokerId?.trim()) headers[PHF_BYBIT_BROKER] = by.brokerId.trim();
		if (by.baseUrl?.trim()) headers[PHF_BYBIT_BASE] = by.baseUrl.trim().replace(/\/$/, '');
	}
	return headers;
}

/** fetch() that merges sessionStorage exchange credentials into headers. */
export function exchangeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const headers = new Headers(init?.headers);
	const extra = exchangeAuthHeaders();
	for (const [k, v] of Object.entries(extra)) {
		if (!headers.has(k)) headers.set(k, v);
	}
	return fetch(input, { ...init, headers });
}
