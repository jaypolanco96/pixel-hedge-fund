/**
 * Per-visitor exchange keys in sessionStorage (browser only).
 * Never log raw keys. Used by Desk LOGIN + request headers for /api/blofin|bybit.
 */

export const EXCHANGE_KEYS_STORAGE = 'phf-exchange-keys';

export interface BloFinClientKeys {
	apiKey: string;
	apiSecret: string;
	passphrase: string;
	brokerId?: string;
	baseUrl: string;
}

export interface BybitClientKeys {
	apiKey: string;
	apiSecret: string;
	brokerId?: string;
	passphrase?: string;
	baseUrl: string;
}

export interface ExchangeClientKeys {
	blofin?: BloFinClientKeys;
	bybit?: BybitClientKeys;
}

export interface MaskedKeyStatus {
	configured: boolean;
	apiKeyMasked: string | null;
	secretMasked: string | null;
	passphraseMasked: string | null;
	brokerIdMasked?: string | null;
	baseUrl: string;
}

export const LIVE_BLOFIN_BASE = 'https://openapi.blofin.com';
export const LIVE_BYBIT_BASE = 'https://api.bybit.com';

export function maskSecret(value: string | undefined | null): string | null {
	const v = (value ?? '').trim();
	if (!v) return null;
	if (v.length <= 4) return '****';
	return `****${v.slice(-4)}`;
}

/** Keep prior secret when UI shows blank or masked placeholder. */
export function resolveSecretField(incoming: string, previous: string | undefined): string {
	const s = (incoming ?? '').trim();
	if (!s) return previous ?? '';
	if (/^\*+[a-zA-Z0-9]{0,4}$/.test(s) || s === '****') return previous ?? '';
	return s;
}

export function loadExchangeKeys(): ExchangeClientKeys {
	if (typeof sessionStorage === 'undefined') return {};
	try {
		const raw = sessionStorage.getItem(EXCHANGE_KEYS_STORAGE);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as ExchangeClientKeys;
		return parsed && typeof parsed === 'object' ? parsed : {};
	} catch {
		return {};
	}
}

export function saveExchangeKeys(next: ExchangeClientKeys): void {
	if (typeof sessionStorage === 'undefined') return;
	try {
		sessionStorage.setItem(EXCHANGE_KEYS_STORAGE, JSON.stringify(next));
	} catch {
		/* quota / private mode */
	}
}

export function clearExchangeKeys(): void {
	if (typeof sessionStorage === 'undefined') return;
	try {
		sessionStorage.removeItem(EXCHANGE_KEYS_STORAGE);
	} catch {
		/* ignore */
	}
}

export function blofinStatusFromClient(keys: ExchangeClientKeys): MaskedKeyStatus {
	const b = keys.blofin;
	const apiKey = (b?.apiKey ?? '').trim();
	const apiSecret = (b?.apiSecret ?? '').trim();
	const passphrase = (b?.passphrase ?? '').trim();
	const baseUrl = ((b?.baseUrl ?? '').trim() || LIVE_BLOFIN_BASE).replace(/\/$/, '');
	return {
		configured: !!(apiKey && apiSecret && passphrase),
		apiKeyMasked: maskSecret(apiKey),
		secretMasked: maskSecret(apiSecret),
		passphraseMasked: maskSecret(passphrase),
		brokerIdMasked: maskSecret(b?.brokerId),
		baseUrl
	};
}

export function bybitStatusFromClient(keys: ExchangeClientKeys): MaskedKeyStatus {
	const b = keys.bybit;
	const apiKey = (b?.apiKey ?? '').trim();
	const apiSecret = (b?.apiSecret ?? '').trim();
	const passphrase = (b?.passphrase ?? '').trim();
	const baseUrl = ((b?.baseUrl ?? '').trim() || LIVE_BYBIT_BASE).replace(/\/$/, '');
	return {
		configured: !!(apiKey && apiSecret),
		apiKeyMasked: maskSecret(apiKey),
		secretMasked: maskSecret(apiSecret),
		passphraseMasked: passphrase ? maskSecret(passphrase) : null,
		brokerIdMasked: maskSecret(b?.brokerId),
		baseUrl
	};
}

export function upsertBloFinClientKeys(input: {
	apiKey?: string;
	apiSecret?: string;
	passphrase?: string;
	brokerId?: string;
	baseUrl?: string;
}): MaskedKeyStatus {
	const cur = loadExchangeKeys();
	const prev = cur.blofin;
	const next: BloFinClientKeys = {
		apiKey: resolveSecretField(input.apiKey ?? '', prev?.apiKey),
		apiSecret: resolveSecretField(input.apiSecret ?? '', prev?.apiSecret),
		passphrase: resolveSecretField(input.passphrase ?? '', prev?.passphrase),
		brokerId: resolveSecretField(input.brokerId ?? '', prev?.brokerId) || undefined,
		baseUrl:
			((input.baseUrl ?? prev?.baseUrl ?? LIVE_BLOFIN_BASE) as string).trim().replace(/\/$/, '') ||
			LIVE_BLOFIN_BASE
	};
	saveExchangeKeys({ ...cur, blofin: next });
	return blofinStatusFromClient({ blofin: next });
}

export function upsertBybitClientKeys(input: {
	apiKey?: string;
	apiSecret?: string;
	passphrase?: string;
	brokerId?: string;
	baseUrl?: string;
}): MaskedKeyStatus {
	const cur = loadExchangeKeys();
	const prev = cur.bybit;
	const pass = resolveSecretField(input.passphrase ?? '', prev?.passphrase);
	const next: BybitClientKeys = {
		apiKey: resolveSecretField(input.apiKey ?? '', prev?.apiKey),
		apiSecret: resolveSecretField(input.apiSecret ?? '', prev?.apiSecret),
		brokerId: resolveSecretField(input.brokerId ?? '', prev?.brokerId) || undefined,
		passphrase: pass || undefined,
		baseUrl:
			((input.baseUrl ?? prev?.baseUrl ?? LIVE_BYBIT_BASE) as string).trim().replace(/\/$/, '') ||
			LIVE_BYBIT_BASE
	};
	saveExchangeKeys({ ...cur, bybit: next });
	return bybitStatusFromClient({ bybit: next });
}
