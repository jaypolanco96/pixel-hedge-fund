/**
 * Display ↔ Kraken Futures perpetual instrument mapping.
 *
 * Display uses the familiar *USDT ticker form for the office floor.
 * Venue instruments are Kraken PF_* USD-margined perpetuals (XBT = BTC).
 *
 * | Display   | Kraken Futures | Pair notes        |
 * |-----------|----------------|-------------------|
 * | BTCUSDT   | PF_XBTUSD      | BTC as XBT        |
 * | ETHUSDT   | PF_ETHUSD      |                   |
 * | XRPUSDT   | PF_XRPUSD      |                   |
 * | SOLUSDT   | PF_SOLUSD      | v1 default        |
 * | ADAUSDT   | PF_ADAUSD      |                   |
 * | DOGEUSDT  | PF_DOGEUSD     |                   |
 * | LINKUSDT  | PF_LINKUSD     |                   |
 * | AVAXUSDT  | PF_AVAXUSD     |                   |
 */

export interface SymbolDef {
	display: string;
	kraken: string;
	canonical: string;
	/** Rough SAMPLE mid when live fetch fails — labeled sample only. */
	sampleMid: number;
	/** Price decimals for tape / HUD. */
	decimals: number;
	label: string;
}

export const SYMBOLS: readonly SymbolDef[] = [
	{ display: 'BTCUSDT', kraken: 'PF_XBTUSD', canonical: 'CRYPTO:KRAKENFUT:PF_XBTUSD', sampleMid: 80_000, decimals: 1, label: 'BTC' },
	{ display: 'ETHUSDT', kraken: 'PF_ETHUSD', canonical: 'CRYPTO:KRAKENFUT:PF_ETHUSD', sampleMid: 3_400, decimals: 2, label: 'ETH' },
	{ display: 'XRPUSDT', kraken: 'PF_XRPUSD', canonical: 'CRYPTO:KRAKENFUT:PF_XRPUSD', sampleMid: 0.62, decimals: 4, label: 'XRP' },
	{ display: 'SOLUSDT', kraken: 'PF_SOLUSD', canonical: 'CRYPTO:KRAKENFUT:PF_SOLUSD', sampleMid: 108.5, decimals: 2, label: 'SOL' },
	{ display: 'ADAUSDT', kraken: 'PF_ADAUSD', canonical: 'CRYPTO:KRAKENFUT:PF_ADAUSD', sampleMid: 0.55, decimals: 4, label: 'ADA' },
	{ display: 'DOGEUSDT', kraken: 'PF_DOGEUSD', canonical: 'CRYPTO:KRAKENFUT:PF_DOGEUSD', sampleMid: 0.14, decimals: 5, label: 'DOGE' },
	{ display: 'LINKUSDT', kraken: 'PF_LINKUSD', canonical: 'CRYPTO:KRAKENFUT:PF_LINKUSD', sampleMid: 14.5, decimals: 3, label: 'LINK' },
	{ display: 'AVAXUSDT', kraken: 'PF_AVAXUSD', canonical: 'CRYPTO:KRAKENFUT:PF_AVAXUSD', sampleMid: 28, decimals: 3, label: 'AVAX' }
] as const;

export const DEFAULT_DISPLAY = 'SOLUSDT';

const BY_DISPLAY = new Map(SYMBOLS.map((s) => [s.display, s]));
const BY_KRAKEN = new Map(SYMBOLS.map((s) => [s.kraken, s]));

/** Aliases accepted on API input → display symbol. */
const ALIASES: Record<string, string> = {
	BTCUSDT: 'BTCUSDT',
	BTCUSD: 'BTCUSDT',
	BTC: 'BTCUSDT',
	XBTUSDT: 'BTCUSDT',
	XBTUSD: 'BTCUSDT',
	PF_XBTUSD: 'BTCUSDT',
	PI_XBTUSD: 'BTCUSDT',
	ETHUSDT: 'ETHUSDT',
	ETHUSD: 'ETHUSDT',
	ETH: 'ETHUSDT',
	PF_ETHUSD: 'ETHUSDT',
	XRPUSDT: 'XRPUSDT',
	XRPUSD: 'XRPUSDT',
	XRP: 'XRPUSDT',
	PF_XRPUSD: 'XRPUSDT',
	SOLUSDT: 'SOLUSDT',
	SOLUSD: 'SOLUSDT',
	SOL: 'SOLUSDT',
	PF_SOLUSD: 'SOLUSDT',
	PI_SOLUSD: 'SOLUSDT',
	ADAUSDT: 'ADAUSDT',
	ADAUSD: 'ADAUSDT',
	ADA: 'ADAUSDT',
	PF_ADAUSD: 'ADAUSDT',
	DOGEUSDT: 'DOGEUSDT',
	DOGEUSD: 'DOGEUSDT',
	DOGE: 'DOGEUSDT',
	PF_DOGEUSD: 'DOGEUSDT',
	LINKUSDT: 'LINKUSDT',
	LINKUSD: 'LINKUSDT',
	LINK: 'LINKUSDT',
	PF_LINKUSD: 'LINKUSDT',
	AVAXUSDT: 'AVAXUSDT',
	AVAXUSD: 'AVAXUSDT',
	AVAX: 'AVAXUSDT',
	PF_AVAXUSD: 'AVAXUSDT'
};

export function resolveSymbol(input: string | null | undefined): SymbolDef {
	const raw = (input ?? DEFAULT_DISPLAY).toUpperCase().replace(/[^A-Z0-9_]/g, '');
	const display = ALIASES[raw] ?? (BY_DISPLAY.has(raw) ? raw : BY_KRAKEN.get(raw)?.display);
	return BY_DISPLAY.get(display ?? DEFAULT_DISPLAY) ?? BY_DISPLAY.get(DEFAULT_DISPLAY)!;
}

export function isKnownDisplay(display: string): boolean {
	return BY_DISPLAY.has(display.toUpperCase());
}

export const TAPE_DISPLAYS = SYMBOLS.map((s) => s.display);
