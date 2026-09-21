/**
 * Local exchange API secrets - server-only.
 * Stored in gitignored `.secrets/exchanges.json`. Never return raw secrets to the client.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const LIVE_BLOFIN_BASE = 'https://openapi.blofin.com';
export const LIVE_BYBIT_BASE = 'https://api.bybit.com';

export type ExchangeName = 'blofin' | 'bybit';
const ALLOWED_EXCHANGE_HOSTS: Record<ExchangeName, Set<string>> = {
	blofin: new Set(['openapi.blofin.com', 'demo-trading-openapi.blofin.com']),
	bybit: new Set(['api.bybit.com', 'api-demo.bybit.com', 'api-testnet.bybit.com'])
};

/** Prevent credentials being sent to a user-supplied arbitrary host. */
export function normalizeExchangeBase(value: unknown, exchange: ExchangeName): string {
	const fallback = exchange === 'blofin' ? LIVE_BLOFIN_BASE : LIVE_BYBIT_BASE;
	try {
		const parsed = new URL(String(value || fallback));
		if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash) return fallback;
		return ALLOWED_EXCHANGE_HOSTS[exchange].has(parsed.hostname.toLowerCase()) ? `https://${parsed.hostname.toLowerCase()}` : fallback;
	} catch {
		return fallback;
	}
}

export interface BloFinSecrets {
	apiKey: string;
	apiSecret: string;
	passphrase: string;
	brokerId?: string;
	baseUrl: string;
}

export interface BybitSecrets {
	apiKey: string;
	apiSecret: string;
	brokerId?: string;
	/** Unused by Bybit v5 today - kept optional for desk form symmetry. */
	passphrase?: string;
	baseUrl: string;
}

export interface ExchangeSecretsFile {
	blofin?: Partial<BloFinSecrets>;
	bybit?: Partial<BybitSecrets>;
	updatedAt?: string;
}

export interface MaskedExchangeStatus {
	configured: boolean;
	apiKeyMasked: string | null;
	secretMasked: string | null;
	passphraseMasked: string | null;
	brokerIdMasked?: string | null;
	baseUrl: string;
}

export interface KeysStatusResponse {
	ok: true;
	blofin: MaskedExchangeStatus;
	bybit: MaskedExchangeStatus;
	secretsPath: string;
}

const SECRETS_DIR = join(process.cwd(), '.secrets');
const SECRETS_FILE = join(SECRETS_DIR, 'exchanges.json');

function mask(value: string | undefined | null): string | null {
	const v = (value ?? '').trim();
	if (!v) return null;
	if (v.length <= 4) return '****';
	return `****${v.slice(-4)}`;
}

export function secretsFilePath(): string {
	return SECRETS_FILE;
}

export async function readExchangeSecrets(): Promise<ExchangeSecretsFile> {
	try {
		const raw = await readFile(SECRETS_FILE, 'utf8');
		const parsed = JSON.parse(raw) as ExchangeSecretsFile;
		return parsed && typeof parsed === 'object' ? parsed : {};
	} catch {
		return {};
	}
}

export async function writeExchangeSecrets(next: ExchangeSecretsFile): Promise<void> {
	await mkdir(SECRETS_DIR, { recursive: true });
	const payload: ExchangeSecretsFile = {
		...next,
		updatedAt: new Date().toISOString()
	};
	await writeFile(SECRETS_FILE, `${JSON.stringify(payload, null, 2)}\n`, {
		encoding: 'utf8',
		mode: 0o600
	});
}

export function blofinStatusFrom(secrets: ExchangeSecretsFile): MaskedExchangeStatus {
	const b = secrets.blofin ?? {};
	const apiKey = (b.apiKey ?? '').trim();
	const apiSecret = (b.apiSecret ?? '').trim();
	const passphrase = (b.passphrase ?? '').trim();
	const brokerId = (b.brokerId ?? '').trim();
	const baseUrl = normalizeExchangeBase(b.baseUrl, 'blofin');
	return {
		configured: !!(apiKey && apiSecret && passphrase),
		apiKeyMasked: mask(apiKey),
		secretMasked: mask(apiSecret),
		passphraseMasked: mask(passphrase),
		brokerIdMasked: mask(brokerId),
		baseUrl
	};
}

export function bybitStatusFrom(secrets: ExchangeSecretsFile): MaskedExchangeStatus {
	const b = secrets.bybit ?? {};
	const apiKey = (b.apiKey ?? '').trim();
	const apiSecret = (b.apiSecret ?? '').trim();
	const passphrase = (b.passphrase ?? '').trim();
	const brokerId = (b.brokerId ?? '').trim();
	const baseUrl = normalizeExchangeBase(b.baseUrl, 'bybit');
	return {
		configured: !!(apiKey && apiSecret),
		apiKeyMasked: mask(apiKey),
		secretMasked: mask(apiSecret),
		passphraseMasked: passphrase ? mask(passphrase) : null,
		brokerIdMasked: mask(brokerId),
		baseUrl
	};
}

/** Keep prior secret fields when the desk sends blank (masked) placeholders. */
export function mergeSecretField(
	incoming: unknown,
	previous: string | undefined,
	opts?: { allowBlankClear?: boolean }
): string {
	if (incoming == null) return previous ?? '';
	const s = String(incoming).trim();
	if (!s) return opts?.allowBlankClear ? '' : (previous ?? '');
	// Ignore client echoing masked values
	if (/^\*+[a-zA-Z0-9]{0,4}$/.test(s) || s === '****') return previous ?? '';
	return s;
}

export async function upsertBloFinSecrets(input: {
	apiKey?: string;
	apiSecret?: string;
	passphrase?: string;
	brokerId?: string;
	baseUrl?: string;
}): Promise<MaskedExchangeStatus> {
	const cur = await readExchangeSecrets();
	const prev = cur.blofin ?? {};
	const nextBlofin: BloFinSecrets = {
		apiKey: mergeSecretField(input.apiKey, prev.apiKey),
		apiSecret: mergeSecretField(input.apiSecret, prev.apiSecret),
		passphrase: mergeSecretField(input.passphrase, prev.passphrase),
		brokerId: mergeSecretField(input.brokerId, prev.brokerId, { allowBlankClear: true }) || undefined,
		baseUrl: normalizeExchangeBase(input.baseUrl ?? prev.baseUrl, 'blofin')
	};
	await writeExchangeSecrets({ ...cur, blofin: nextBlofin });
	return blofinStatusFrom({ blofin: nextBlofin });
}

export async function upsertBybitSecrets(input: {
	apiKey?: string;
	apiSecret?: string;
	passphrase?: string;
	brokerId?: string;
	baseUrl?: string;
}): Promise<MaskedExchangeStatus> {
	const cur = await readExchangeSecrets();
	const prev = cur.bybit ?? {};
	const nextBybit: BybitSecrets = {
		apiKey: mergeSecretField(input.apiKey, prev.apiKey),
		apiSecret: mergeSecretField(input.apiSecret, prev.apiSecret),
		passphrase: mergeSecretField(input.passphrase, prev.passphrase, { allowBlankClear: true }) || undefined,
		brokerId: mergeSecretField(input.brokerId, prev.brokerId, { allowBlankClear: true }) || undefined,
		baseUrl: normalizeExchangeBase(input.baseUrl ?? prev.baseUrl, 'bybit')
	};
	await writeExchangeSecrets({ ...cur, bybit: nextBybit });
	return bybitStatusFrom({ bybit: nextBybit });
}

export async function getKeysStatus(): Promise<KeysStatusResponse & { persistence: string; vercel: boolean }> {
	const secrets = await readExchangeSecrets();
	const vercel = isVercelEnv();
	return {
		ok: true,
		blofin: blofinStatusFrom(secrets),
		bybit: bybitStatusFrom(secrets),
		secretsPath: vercel ? '(ephemeral - use browser session LOGIN)' : '.secrets/exchanges.json',
		persistence: vercel ? 'browser-session' : 'server-file-or-env',
		vercel
	};
}

/** Validate BloFin body and return masked status without writing disk (Vercel / browser persistence). */
export function validateBloFinSecretsInput(input: {
	apiKey?: string;
	apiSecret?: string;
	passphrase?: string;
	brokerId?: string;
	baseUrl?: string;
}): MaskedExchangeStatus {
	const apiKey = mergeSecretField(input.apiKey, undefined);
	const apiSecret = mergeSecretField(input.apiSecret, undefined);
	const passphrase = mergeSecretField(input.passphrase, undefined);
	const brokerId = mergeSecretField(input.brokerId, undefined, { allowBlankClear: true }) || undefined;
	const baseUrl = normalizeExchangeBase(input.baseUrl, 'blofin');
	return blofinStatusFrom({
		blofin: { apiKey, apiSecret, passphrase, brokerId, baseUrl }
	});
}

/** Validate Bybit body and return masked status without writing disk. */
export function validateBybitSecretsInput(input: {
	apiKey?: string;
	apiSecret?: string;
	passphrase?: string;
	brokerId?: string;
	baseUrl?: string;
}): MaskedExchangeStatus {
	const apiKey = mergeSecretField(input.apiKey, undefined);
	const apiSecret = mergeSecretField(input.apiSecret, undefined);
	const passphrase =
		mergeSecretField(input.passphrase, undefined, { allowBlankClear: true }) || undefined;
	const brokerId = mergeSecretField(input.brokerId, undefined, { allowBlankClear: true }) || undefined;
	const baseUrl = normalizeExchangeBase(input.baseUrl, 'bybit');
	return bybitStatusFrom({
		bybit: { apiKey, apiSecret, passphrase, brokerId, baseUrl }
	});
}

export function isVercelEnv(): boolean {
	return !!process.env.VERCEL;
}
