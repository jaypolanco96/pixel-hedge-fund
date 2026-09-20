/** Shared Bybit DTO types — safe for client + server. */

export interface BybitHealth {
	ok: boolean;
	configured: boolean;
	reachable?: boolean;
	baseUrl: string;
	keyPresent: boolean;
	secretPresent: boolean;
	error?: string;
	code?: string;
	msg?: string;
}

export interface BybitBalanceCoin {
	coin: string;
	equity: number;
	available: number;
	walletBalance: number;
	unrealisedPnl: number;
}

export interface BybitBalanceResponse {
	ok: boolean;
	configured: boolean;
	sample: boolean;
	totalEquityUsd: number | null;
	coins: BybitBalanceCoin[];
	error?: string;
	code?: string;
	msg?: string;
}

export interface BybitPosition {
	symbol: string;
	side: string;
	size: number;
	avgPrice: number;
	markPrice: number;
	leverage: number;
	unrealisedPnl: number;
	positionIdx: number;
	deskSide: 'long' | 'short' | 'flat';
}

export interface BybitPositionsResponse {
	ok: boolean;
	configured: boolean;
	sample: boolean;
	positions: BybitPosition[];
	error?: string;
	code?: string;
	msg?: string;
	/** Soft note for UI (e.g. network blocked). */
	note?: string;
}

export interface BybitTickerRow {
	symbol: string;
	lastPrice: number;
	markPrice: number;
	bid1Price: number;
	ask1Price: number;
	/** Percent points (e.g. 1.25 = +1.25%). */
	change24hPct: number;
}
