/** Pending live trade intents — local only until Confirm POSTs. */
import { readJson, writeJson } from './local';
import type { BloFinTradeIntent } from '$lib/data/blofinTrade';

export const BLOFIN_INTENT_KEY = 'phf-blofin-trade-intents';

export function loadTradeIntents(): BloFinTradeIntent[] {
	const raw = readJson<unknown>(BLOFIN_INTENT_KEY, []);
	if (!Array.isArray(raw)) return [];
	return raw.filter((x) => x && typeof x === 'object' && typeof (x as BloFinTradeIntent).id === 'string') as BloFinTradeIntent[];
}

export function saveTradeIntents(intents: BloFinTradeIntent[]): void {
	writeJson(BLOFIN_INTENT_KEY, intents.slice(0, 40));
}

export function upsertTradeIntent(intent: BloFinTradeIntent): BloFinTradeIntent[] {
	const list = loadTradeIntents().filter((i) => i.id !== intent.id);
	// One pending intent per trader+inst (desk) or replace same id
	const next = [intent, ...list.filter((i) => !(i.traderId === intent.traderId && i.instId === intent.instId && i.source === intent.source))];
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
