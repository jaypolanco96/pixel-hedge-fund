/**
 * Display ↔ venue instrument mapping.
 *
 * Display uses *USDT form for the office floor.
 * Primary quotes: Kraken PF_* when mapped; Bybit linear USDT when Kraken missing.
 * Candles/signal stay on Kraken when mapped; Bybit-only symbols use SAMPLE candles/signal.
 */

export type SymbolCategory = 'majors' | 'meme' | 'defi' | 'ai' | 'etf' | 'stock' | 'layer1';

export type QuoteVenue = 'kraken' | 'bybit';

export interface SymbolDef {
	display: string;
	/** Kraken Futures PF_* id, or '' when unavailable. */
	kraken: string;
	/** Bybit linear USDT perpetual symbol (always set for tape fill-in). */
	bybit: string;
	/** Bybit spot symbol; defaults to the linear symbol when omitted. */
	bybitSpot?: string;
	canonical: string;
	/** Rough SAMPLE mid when live fetch fails — labeled sample only. */
	sampleMid: number;
	/** Price decimals for tape / HUD. */
	decimals: number;
	label: string;
	category: SymbolCategory;
	/** Preferred live quote venue. */
	quoteVenue: QuoteVenue;
	/** Google News / headline search phrase. */
	newsQuery: string;
}

export const SYMBOL_CATEGORIES: readonly { id: SymbolCategory | 'all'; label: string }[] = [
	{ id: 'all', label: 'ALL' },
	{ id: 'majors', label: 'MAJORS' },
	{ id: 'meme', label: 'MEME' },
	{ id: 'defi', label: 'DEFI' },
	{ id: 'ai', label: 'AI' },
	{ id: 'etf', label: 'ETF' },
	{ id: 'stock', label: 'STOCK' },
	{ id: 'layer1', label: 'L1' }
] as const;

export const SYMBOLS: readonly SymbolDef[] = [
	// —— majors (Kraken) ——
	{
		display: 'BTCUSDT',
		kraken: 'PF_XBTUSD',
		bybit: 'BTCUSDT',
		canonical: 'CRYPTO:KRAKENFUT:PF_XBTUSD',
		sampleMid: 80_000,
		decimals: 1,
		label: 'BTC',
		category: 'majors',
		quoteVenue: 'kraken',
		newsQuery: 'Bitcoin OR BTC crypto'
	},
	{
		display: 'ETHUSDT',
		kraken: 'PF_ETHUSD',
		bybit: 'ETHUSDT',
		canonical: 'CRYPTO:KRAKENFUT:PF_ETHUSD',
		sampleMid: 3_400,
		decimals: 2,
		label: 'ETH',
		category: 'majors',
		quoteVenue: 'kraken',
		newsQuery: 'Ethereum OR ETH crypto'
	},
	{
		display: 'XRPUSDT',
		kraken: 'PF_XRPUSD',
		bybit: 'XRPUSDT',
		canonical: 'CRYPTO:KRAKENFUT:PF_XRPUSD',
		sampleMid: 0.62,
		decimals: 4,
		label: 'XRP',
		category: 'majors',
		quoteVenue: 'kraken',
		newsQuery: 'XRP OR Ripple crypto'
	},
	{
		display: 'SOLUSDT',
		kraken: 'PF_SOLUSD',
		bybit: 'SOLUSDT',
		canonical: 'CRYPTO:KRAKENFUT:PF_SOLUSD',
		sampleMid: 108.5,
		decimals: 2,
		label: 'SOL',
		category: 'majors',
		quoteVenue: 'kraken',
		newsQuery: 'Solana OR SOL crypto'
	},
	{
		display: 'ADAUSDT',
		kraken: 'PF_ADAUSD',
		bybit: 'ADAUSDT',
		canonical: 'CRYPTO:KRAKENFUT:PF_ADAUSD',
		sampleMid: 0.55,
		decimals: 4,
		label: 'ADA',
		category: 'layer1',
		quoteVenue: 'kraken',
		newsQuery: 'Cardano OR ADA crypto'
	},
	{
		display: 'AVAXUSDT',
		kraken: 'PF_AVAXUSD',
		bybit: 'AVAXUSDT',
		canonical: 'CRYPTO:KRAKENFUT:PF_AVAXUSD',
		sampleMid: 28,
		decimals: 3,
		label: 'AVAX',
		category: 'layer1',
		quoteVenue: 'kraken',
		newsQuery: 'Avalanche OR AVAX crypto'
	},
	// —— meme ——
	{
		display: 'DOGEUSDT',
		kraken: 'PF_DOGEUSD',
		bybit: 'DOGEUSDT',
		canonical: 'CRYPTO:KRAKENFUT:PF_DOGEUSD',
		sampleMid: 0.14,
		decimals: 5,
		label: 'DOGE',
		category: 'meme',
		quoteVenue: 'kraken',
		newsQuery: 'Dogecoin OR DOGE crypto'
	},
	{
		display: 'PEPEUSDT',
		kraken: '',
		bybit: 'PEPEUSDT',
		canonical: 'CRYPTO:BYBIT:PEPEUSDT',
		sampleMid: 0.0000095,
		decimals: 8,
		label: 'PEPE',
		category: 'meme',
		quoteVenue: 'bybit',
		newsQuery: 'PEPE meme coin crypto'
	},
	{
		display: 'WIFUSDT',
		kraken: '',
		bybit: 'WIFUSDT',
		canonical: 'CRYPTO:BYBIT:WIFUSDT',
		sampleMid: 1.85,
		decimals: 4,
		label: 'WIF',
		category: 'meme',
		quoteVenue: 'bybit',
		newsQuery: 'dogwifhat OR WIF crypto'
	},
	{
		display: 'BONKUSDT',
		kraken: '',
		bybit: 'BONKUSDT',
		canonical: 'CRYPTO:BYBIT:BONKUSDT',
		sampleMid: 0.000022,
		decimals: 8,
		label: 'BONK',
		category: 'meme',
		quoteVenue: 'bybit',
		newsQuery: 'BONK Solana meme crypto'
	},
	{
		display: 'SHIBUSDT',
		kraken: '',
		bybit: 'SHIB1000USDT',
		bybitSpot: 'SHIBUSDT',
		canonical: 'CRYPTO:BYBIT:SHIB1000USDT',
		sampleMid: 0.000018,
		decimals: 8,
		label: 'SHIB',
		category: 'meme',
		quoteVenue: 'bybit',
		newsQuery: 'Shiba Inu OR SHIB crypto'
	},
	// —— defi ——
	{
		display: 'LINKUSDT',
		kraken: 'PF_LINKUSD',
		bybit: 'LINKUSDT',
		canonical: 'CRYPTO:KRAKENFUT:PF_LINKUSD',
		sampleMid: 14.5,
		decimals: 3,
		label: 'LINK',
		category: 'defi',
		quoteVenue: 'kraken',
		newsQuery: 'Chainlink OR LINK crypto'
	},
	{
		display: 'AAVEUSDT',
		kraken: '',
		bybit: 'AAVEUSDT',
		canonical: 'CRYPTO:BYBIT:AAVEUSDT',
		sampleMid: 185,
		decimals: 2,
		label: 'AAVE',
		category: 'defi',
		quoteVenue: 'bybit',
		newsQuery: 'Aave OR AAVE DeFi crypto'
	},
	{
		display: 'UNIUSDT',
		kraken: '',
		bybit: 'UNIUSDT',
		canonical: 'CRYPTO:BYBIT:UNIUSDT',
		sampleMid: 8.5,
		decimals: 3,
		label: 'UNI',
		category: 'defi',
		quoteVenue: 'bybit',
		newsQuery: 'Uniswap OR UNI crypto'
	},
	// —— ai ——
	{
		display: 'FETUSDT',
		kraken: '',
		bybit: 'FETUSDT',
		canonical: 'CRYPTO:BYBIT:FETUSDT',
		sampleMid: 1.15,
		decimals: 4,
		label: 'FET',
		category: 'ai',
		quoteVenue: 'bybit',
		newsQuery: 'Fetch.ai OR FET OR ASI crypto AI'
	},
	{
		display: 'RENDERUSDT',
		kraken: '',
		bybit: 'RENDERUSDT',
		canonical: 'CRYPTO:BYBIT:RENDERUSDT',
		sampleMid: 5.8,
		decimals: 3,
		label: 'RENDER',
		category: 'ai',
		quoteVenue: 'bybit',
		newsQuery: 'Render OR RNDR crypto AI'
	},
	// ETF / STOCK: no reliable Bybit equity-perp tickers in this pack —
	// tabs remain for filter UI; leave lists empty (filter shows note).
] as const;

export const DEFAULT_DISPLAY = 'SOLUSDT';

const BY_DISPLAY = new Map(SYMBOLS.map((s) => [s.display, s]));
const BY_KRAKEN = new Map(SYMBOLS.filter((s) => s.kraken).map((s) => [s.kraken, s]));
const BY_BYBIT = new Map(SYMBOLS.map((s) => [s.bybit, s]));

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
	PF_AVAXUSD: 'AVAXUSDT',
	PEPEUSDT: 'PEPEUSDT',
	PEPE: 'PEPEUSDT',
	WIFUSDT: 'WIFUSDT',
	WIF: 'WIFUSDT',
	BONKUSDT: 'BONKUSDT',
	BONK: 'BONKUSDT',
	SHIBUSDT: 'SHIBUSDT',
	SHIB: 'SHIBUSDT',
	SHIB1000USDT: 'SHIBUSDT',
	AAVEUSDT: 'AAVEUSDT',
	AAVE: 'AAVEUSDT',
	UNIUSDT: 'UNIUSDT',
	UNI: 'UNIUSDT',
	FETUSDT: 'FETUSDT',
	FET: 'FETUSDT',
	RENDERUSDT: 'RENDERUSDT',
	RENDER: 'RENDERUSDT',
	RNDR: 'RENDERUSDT'
};

export function resolveSymbol(input: string | null | undefined): SymbolDef {
	const raw = (input ?? DEFAULT_DISPLAY).toUpperCase().replace(/[^A-Z0-9_]/g, '');
	const display =
		ALIASES[raw] ??
		(BY_DISPLAY.has(raw) ? raw : BY_KRAKEN.get(raw)?.display ?? BY_BYBIT.get(raw)?.display);
	return BY_DISPLAY.get(display ?? DEFAULT_DISPLAY) ?? BY_DISPLAY.get(DEFAULT_DISPLAY)!;
}

export function isKnownDisplay(display: string): boolean {
	return BY_DISPLAY.has(display.toUpperCase());
}

export function hasKraken(def: SymbolDef): boolean {
	return !!def.kraken;
}

export function bybitSpotSymbol(def: SymbolDef): string {
	return def.bybitSpot ?? def.bybit;
}

/** Human-facing spot wire ticker: omit USDT and show regular pairs as USD. */
export function spotWireSymbol(input: string): string {
	const raw = input.toUpperCase();
	const base = raw.replace(/USDT$/, '');
	if (/(?:\d+(?:L|S)|\d+X(?:LONG|SHORT))$/i.test(base)) return base;
	return `${base}USD`;
}

export function symbolsInCategory(cat: SymbolCategory | 'all'): SymbolDef[] {
	if (cat === 'all') return [...SYMBOLS];
	return SYMBOLS.filter((s) => s.category === cat);
}

export const TAPE_DISPLAYS = SYMBOLS.map((s) => s.display);
