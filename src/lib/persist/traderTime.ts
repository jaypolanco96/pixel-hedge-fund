import { readJson, writeJson } from './local';

const KEY = 'phf-trader-time-overrides';

export function loadTraderTimeOverrides(): Record<string, number> {
	const raw = readJson<Record<string, number>>(KEY, {});
	if (!raw || typeof raw !== 'object') return {};
	return Object.fromEntries(
		Object.entries(raw).filter(([, value]) => typeof value === 'number' && Number.isFinite(value) && value >= 0)
	);
}

export function saveTraderTimeOverrides(overrides: Record<string, number>): void {
	writeJson(KEY, overrides);
}
