/** Client-safe BloFin trade sizing / intent helpers (no secrets). */

import type {
	BloFinMarginMode,
	BloFinOrderSide,
	BloFinOrderType,
	BloFinPositionSide
} from './blofinTypes';

export interface BloFinTradeIntent {
	/** Local id for pending confirm */
	id: string;
	createdAt: string;
	traderId: string | null;
	instId: string;
	/** Display symbol e.g. BTCUSDT */
	display?: string;
	fundsPct: number;
	marginMode: BloFinMarginMode;
	positionSide: BloFinPositionSide;
	side: BloFinOrderSide;
	leverage: number;
	orderType: BloFinOrderType;
	price: number | null;
	reduceOnly: boolean;
	/** Estimated base-coin quantity from % funds, not exchange contracts. */
	estSize: number;
	estNotional: number;
	estMargin: number;
	availableEquity: number;
	markPrice: number;
	exchange?: 'blofin' | 'bybit';
	marketType?: 'futures' | 'spot';
	/** Protective levels copied from the current Chart Desk signal. */
	stopLossPrice?: number | null;
	takeProfitPrice?: number | null;
	signalSample?: boolean;
	/** Optional link to existing BloFin position */
	positionId?: string;
	source: 'desk' | 'quick';
}

/** Map tape display (BTCUSDT) → BloFin instId (BTC-USDT). */
export function displayToBloFinInstId(display: string): string {
	const d = display.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
	if (d.endsWith('USDT') && d.length > 4) {
		return `${d.slice(0, -4)}-USDT`;
	}
	if (d.endsWith('USD') && d.length > 3) {
		return `${d.slice(0, -3)}-USDT`;
	}
	// Already dashed?
	if (display.includes('-')) return display.toUpperCase();
	return display.toUpperCase();
}

export function sideFromPosition(side: 'long' | 'short' | 'flat', forOpen = true): {
	orderSide: BloFinOrderSide;
	positionSide: BloFinPositionSide;
} {
	if (side === 'short') {
		return { orderSide: forOpen ? 'sell' : 'buy', positionSide: 'short' };
	}
	if (side === 'long') {
		return { orderSide: forOpen ? 'buy' : 'sell', positionSide: 'long' };
	}
	return { orderSide: 'buy', positionSide: 'net' };
}

export function positionSideFromTradeSide(side: 'long' | 'short'): BloFinPositionSide {
	return side === 'short' ? 'short' : 'long';
}

export function orderSideFromTradeSide(side: 'long' | 'short'): BloFinOrderSide {
	return side === 'short' ? 'sell' : 'buy';
}

/**
 * Size from % of available futures equity.
 * margin = available * pct/100
 * notional = margin * leverage
 * base-coin quantity = notional / mark (converted to contracts by the venue adapter)
 */
export function sizeFromFundsPct(opts: {
	availableEquity: number;
	fundsPct: number;
	leverage: number;
	markPrice: number;
}): { margin: number; notional: number; size: number } {
	if (!Object.values(opts).every(Number.isFinite) || opts.markPrice <= 0) return { margin: 0, notional: 0, size: 0 };
	const pct = Math.min(100, Math.max(0, opts.fundsPct));
	const lev = Math.max(1, opts.leverage);
	const avail = Math.max(0, opts.availableEquity);
	const margin = avail * (pct / 100);
	const notional = margin * lev;
	const size = opts.markPrice > 0 ? notional / opts.markPrice : 0;
	return { margin, notional, size };
}

export function newIntentId(): string {
	return `ti_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
