/** Pending live trade intents — local only until Confirm POSTs. */
import { readJson, writeJson } from './local';
import type { BloFinTradeIntent } from '$lib/data/blofinTrade';

export const BLOFIN_INTENT_KEY = 'phf-blofin-trade-intents';

export function loadTradeIntents(): BloFinTradeIntent[] {
	const raw = readJson<unknown>(BLOFIN_INTENT_KEY, []);
	if (!Array.isArray(raw)) return [];
	const seen = new Set<string>();
	return raw.filter((x): x is BloFinTradeIntent => {
		if (!x || typeof x !== 'object' || typeof x.id !== 'string' || seen.has(x.id)) return false;
		if (typeof x.instId !== 'string' || !['desk', 'quick'].includes(x.source) || !['buy', 'sell'].includes(x.side)) return false;
		if (![x.estSize, x.estNotional, x.estMargin, x.leverage, x.markPrice, x.fundsPct, x.availableEquity].every(Number.isFinite)) return false;
		if (x.estSize <= 0 || x.markPrice <= 0 || !['market', 'limit'].includes(x.orderType)) return false;
		seen.add(x.id);
		return true;
	}).slice(0, 40);
}

export function saveTradeIntents(intents: BloFinTradeIntent[]): void {
	writeJson(BLOFIN_INTENT_KEY, intents.slice(0, 40));
}

export function upsertTradeIntent(intent: BloFinTradeIntent): BloFinTradeIntent[] {
	const list = loadTradeIntents().filter((i) => i.id !== intent.id);
	// One pending intent per trader+inst (desk) or replace same id
	const next = [intent, ...list.filter((i) => !(i.traderId === intent.traderId && i.instId === intent.instId && i.source === intent.source && i.exchange === intent.exchange && i.marketType === intent.marketType))];
	saveTradeIntents(next);
	return next;
}

export function removeTradeIntent(id: string): BloFinTradeIntent[] {
	const next = loadTradeIntents().filter((i) => i.id !== id);
	saveTradeIntents(next);
	return next;
}

export function clearTradeIntents(): void {
	saveTradeIntents([]);
}
