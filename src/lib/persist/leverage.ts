import type { Leverage, TraderDef } from '$lib/data/types';
import { TRADERS } from '$lib/characters/cast';
import { readJson, writeJson } from './local';

export const LEVERAGE_STORAGE_KEY = 'phf-leverage-overrides';
export const MIN_LEVERAGE = 1;
export const MAX_LEVERAGE = 1000;

export type LeverageOverrides = Partial<Record<string, Leverage>>;

export function isLeverage(v: unknown): v is Leverage {
	return (
		typeof v === 'number' &&
		Number.isInteger(v) &&
		v >= MIN_LEVERAGE &&
		v <= MAX_LEVERAGE
	);
}

export function loadLeverageOverrides(): LeverageOverrides {
	const raw = readJson<unknown>(LEVERAGE_STORAGE_KEY, {});
	if (!raw || typeof raw !== 'object') return {};

	const out: LeverageOverrides = {};
	for (const t of TRADERS) {
		const v = (raw as Record<string, unknown>)[t.id];
		if (isLeverage(v)) out[t.id] = v;
	}
	return out;
}

export function saveLeverageOverrides(overrides: LeverageOverrides): void {
	const valid: LeverageOverrides = {};
	for (const [traderId, leverage] of Object.entries(overrides)) {
		if (isLeverage(leverage)) valid[traderId] = leverage;
	}
	writeJson(LEVERAGE_STORAGE_KEY, valid);
}

export function applyLeverageOverrides(
	traders: TraderDef[],
	overrides: LeverageOverrides
): TraderDef[] {
	return traders.map((t) => {
		const lev = overrides[t.id];
		return lev != null && lev !== t.leverage ? { ...t, leverage: lev } : t;
	});
}
