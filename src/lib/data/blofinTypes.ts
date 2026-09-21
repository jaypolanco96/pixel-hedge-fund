/** Shared BloFin DTO types — safe for client + server. */

export type BloFinMode = 'demo' | 'live';

export type BloFinMarginMode = 'isolated' | 'cross';
export type BloFinPositionSide = 'long' | 'short' | 'net';
export type BloFinOrderSide = 'buy' | 'sell';
export type BloFinOrderType = 'market' | 'limit';
export type BloFinTriggerPriceType = 'last' | 'mark' | 'index';

export interface BloFinHealth {
	ok: boolean;
	mode: BloFinMode;
	baseUrl: string;
	keyPresent: boolean;
	secretPresent: boolean;
	passphrasePresent: boolean;
	configured: boolean;
	reachable?: boolean;
	/** True when upstream returned 403 or a network/transport failure. */
	networkBlocked?: boolean;
	error?: string;
	/**
	 * Keys present (and prefer live mode). Independent of reachable —
	 * ISP 403 must NOT clear this flag.
	 */
	writesEnabled: boolean;
	fromSnapshot?: boolean;
	syncedAt?: string;
}

export interface BloFinBalanceRow {
	currency: string;
	equity: number;
	balance: number;
	available: number;
	frozen: number;
	unrealizedPnl?: number;
}

export interface BloFinBalanceResponse {
	ok: boolean;
	mode: BloFinMode;
	sample: boolean;
	totalEquityUsd: number | null;
	details: BloFinBalanceRow[];
	error?: string;
	fromSnapshot?: boolean;
	syncedAt?: string;
}

export interface BloFinPosition {
	positionId: string;
	instId: string;
	positionSide: string;
	side: 'long' | 'short' | 'flat';
	size: number;
	leverage: number;
	averagePrice: number;
	markPrice: number;
	margin: number | null;
	marginRatio: number | null;
	liquidationPrice: number | null;
	unrealizedPnl: number;
	unrealizedPnlRatio: number | null;
	marginMode: string;
}

export interface BloFinPositionsResponse {
	ok: boolean;
	mode: BloFinMode;
	sample: boolean;
	positions: BloFinPosition[];
	warnings: string[];
	error?: string;
	fromSnapshot?: boolean;
	syncedAt?: string;
}

export interface BloFinOrder {
	orderId: string;
	instId: string;
	side: string;
	orderType: string;
	price: number | null;
	size: number;
	filledSize: number;
	state: string;
	positionSide: string;
	leverage: number | null;
	createTime: number | null;
}

export interface BloFinOrdersResponse {
	ok: boolean;
	mode: BloFinMode;
	sample: boolean;
	orders: BloFinOrder[];
	error?: string;
	fromSnapshot?: boolean;
	syncedAt?: string;
}

export interface BloFinSetLeverageBody {
	instId: string;
	leverage: string | number;
	marginMode: BloFinMarginMode;
	positionSide?: BloFinPositionSide;
}

export interface BloFinSetMarginModeBody {
	marginMode: BloFinMarginMode;
}

export interface BloFinPlaceOrderBody {
	/** PHF input only; converted to contracts using public instrument metadata. */
	sizeUnit?: 'contracts' | 'baseCoin';
	instId: string;
	marginMode: BloFinMarginMode;
	side: BloFinOrderSide;
	orderType: BloFinOrderType;
	size: string | number;
	price?: string | number;
	positionSide?: BloFinPositionSide;
	reduceOnly?: boolean;
	clientOrderId?: string;
	tpTriggerPrice?: string | number;
	tpOrderPrice?: string | number;
	tpTriggerPriceType?: BloFinTriggerPriceType;
	slTriggerPrice?: string | number;
	slOrderPrice?: string | number;
	slTriggerPriceType?: BloFinTriggerPriceType;
	brokerId?: string;
}

export interface BloFinSpotPlaceOrderBody {
	instType: 'SPOT';
	instId: string;
	side: BloFinOrderSide;
	orderType: BloFinOrderType;
	size: string | number;
	price?: string | number;
	targetCurrency?: 'base_currency' | 'quote_currency';
	clientOrderId?: string;
}

export interface BloFinCancelOrderBody {
	instId: string;
	orderId?: string;
	clientOrderId?: string;
}

export interface BloFinClosePositionBody {
	instId: string;
	marginMode: BloFinMarginMode;
	positionSide: BloFinPositionSide;
	clientOrderId?: string;
}

export interface BloFinTradeWriteResponse {
	ok: boolean;
	mode: BloFinMode;
	path: string;
	error?: string;
	/** BloFin `code` when upstream returned a business error. */
	code?: string;
	/** BloFin `msg` when present. */
	msg?: string;
	/** HTTP status when the failure was transport-level. */
	httpStatus?: number;
	/** Upstream data only — never includes secrets. */
	data?: unknown;
}
