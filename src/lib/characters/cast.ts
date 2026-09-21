import type { StaffDef, TraderDef, TraderLeg, Leverage, Side } from '$lib/data/types';

export const TRADERS: TraderDef[] = [
	{ id: 'L05', name: 'Maya Chen', role: 'trader', side: 'long', leverage: 5, skin: 'maya', female: true, row: 'long', col: 0 },
	{ id: 'L10', name: 'Jamal Brooks', role: 'trader', side: 'long', leverage: 10, skin: 'jamal', row: 'long', col: 1 },
	{ id: 'L25', name: 'Sofia Alvarez', role: 'trader', side: 'long', leverage: 25, skin: 'sofia', female: true, row: 'long', col: 2 },
	{ id: 'L50', name: 'Kenji Sato', role: 'trader', side: 'long', leverage: 50, skin: 'kenji', row: 'long', col: 3 },
	{ id: 'L100', name: 'Aisha Okonkwo', role: 'trader', side: 'long', leverage: 100, skin: 'aisha', female: true, row: 'long', col: 4 },
	{ id: 'S05', name: 'Erik Lindqvist', role: 'trader', side: 'short', leverage: 5, skin: 'erik', row: 'short', col: 0 },
	{ id: 'S10', name: 'Priya Sharma', role: 'trader', side: 'short', leverage: 10, skin: 'priya', female: true, row: 'short', col: 1 },
	{ id: 'S25', name: 'Marcus Webb', role: 'trader', side: 'short', leverage: 25, skin: 'marcus', row: 'short', col: 2 },
	{ id: 'S50', name: 'Yuki Tanaka', role: 'trader', side: 'short', leverage: 50, skin: 'yuki', row: 'short', col: 3 },
	{ id: 'S100', name: 'Diego Morales', role: 'trader', side: 'short', leverage: 100, skin: 'diego', row: 'short', col: 4 }
];

export const STAFF: StaffDef[] = [
	{ id: 'CIO', name: 'Helena Voss', role: 'cio', title: 'CIO', skin: 'helena', zone: 'corner' },
	{ id: 'PM', name: 'Theo Rankin', role: 'pm', title: 'Portfolio Manager', skin: 'theo', zone: 'pit_walk' },
	{ id: 'SA', name: 'Nora Blake', role: 'senior_analyst', title: 'Senior Analyst', skin: 'nora', zone: 'analyst' },
	{ id: 'RA', name: 'Chris Park', role: 'research_analyst', title: 'Research Analyst', skin: 'chris', zone: 'research' },
	{ id: 'QR', name: 'Samir Patel', role: 'quant', title: 'Quantitative Researcher', skin: 'samir', zone: 'quant' }
];

// Keep the existing 10x trader at $1M notional while leverage scales exposure.
// This gives every default cast trader the same $100k margin allocation.
const BASE_NOTIONAL = 1_000_000;
const BASE_LEVERAGE = 10;

export function traderNotional(leverage: number): number {
	const validLeverage = Number.isFinite(leverage) ? Math.max(1, leverage) : BASE_LEVERAGE;
	return BASE_NOTIONAL * (validLeverage / BASE_LEVERAGE);
}

export function markLeg(
	t: TraderDef,
	entryMark: number,
	mark: number,
	sample: boolean,
	displaySymbol = 'SOLUSDT',
	exchangeSymbol = 'SOLUSDT',
	sizeScale = 1
): TraderLeg {
	const signedMove =
		t.side === 'long'
			? (mark - entryMark) / entryMark
			: (entryMark - mark) / entryMark;
	const notionalUsd = traderNotional(t.leverage) * sizeScale;
	const unrealizedPnlUsd = notionalUsd * signedMove;
	const marginUsd = notionalUsd / t.leverage;
	return {
		traderId: t.id,
		side: t.side,
		leverage: t.leverage,
		symbol: displaySymbol,
		exchangeSymbol,
		notionalUsd,
		entryMark,
		mark,
		unrealizedPnlUsd,
		unrealizedPnlPctMargin: unrealizedPnlUsd / marginUsd,
		sample
	};
}

export function remakeLegs(
	legs: TraderLeg[],
	mark: number,
	sample: boolean
): TraderLeg[] {
	return legs.map((leg) => {
		const signedMove =
			leg.side === 'long'
				? (mark - leg.entryMark) / leg.entryMark
				: (leg.entryMark - mark) / leg.entryMark;
		const unrealizedPnlUsd = leg.notionalUsd * signedMove;
		const marginUsd = leg.notionalUsd / leg.leverage;
		return {
			...leg,
			mark,
			unrealizedPnlUsd,
			unrealizedPnlPctMargin: unrealizedPnlUsd / marginUsd,
			sample
		};
	});
}

export function leverageHeat(lev: Leverage): string {
	const defaults: Record<number, string> = {
		5: '#8fa3b8',
		10: '#c9b07a',
		25: '#e8a04a',
		50: '#f07850',
		100: '#ff5a5a'
	};
	if (defaults[lev]) return defaults[lev];

	const intensity = Math.min(1, Math.max(0, Math.log10(Math.max(1, lev)) / 3));
	const red = Math.round(143 + intensity * 112);
	const green = Math.round(163 - intensity * 73);
	const blue = Math.round(184 - intensity * 116);
	return `rgb(${red} ${green} ${blue})`;
}

export function animFromPnl(pctMargin: number): 'celebrate' | 'stress' | null {
	if (pctMargin > 0.2) return 'celebrate';
	if (pctMargin < -0.2) return 'stress';
	return null;
}

export type { Side };
