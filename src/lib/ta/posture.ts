import type {
	Bias,
	FloorStatus,
	SignalResponse,
	Side,
	StaffDef,
	StructureTag,
	TraderDef,
	TraderLeg
} from '$lib/data/types';
import { markLeg } from '$lib/characters/cast';

export type TraderPosture = 'open' | 'considering' | 'watching' | 'counter';

export interface TraderPostureCard {
	posture: TraderPosture;
	status: FloorStatus;
	traderId: string;
	side: Side;
	leverage: number;
	symbol: string;
	cloud?: string;
	entryMark?: number;
	mark?: number;
	unrealizedPnlUsd?: number;
	unrealizedPnlPctMargin?: number;
	stop?: number;
	tp1?: number;
	tp2?: number;
	rrTp1?: number;
	tentativeStop?: number;
	tentativeTp1?: number;
	structure: StructureTag;
	confluence: number;
	bias: Bias;
	aligned?: boolean;
	invalidation?: string;
	sample: boolean;
}

export type OpenBook = Record<string, number>;

function mandateMatch(side: Side, bias: Bias): boolean {
	return (side === 'long' && bias === 'LONG') || (side === 'short' && bias === 'SHORT');
}

function oppositeBias(side: Side, bias: Bias): boolean {
	return (side === 'long' && bias === 'SHORT') || (side === 'short' && bias === 'LONG');
}

function stAgainst(side: Side, dir: 1 | -1): boolean {
	return (side === 'long' && dir === -1) || (side === 'short' && dir === 1);
}

/** Open only when confluence supports the desk mandate — never invent a fill. */
export function wantsOpen(trader: TraderDef, signal: SignalResponse): boolean {
	if (!mandateMatch(trader.side, signal.bias)) return false;
	if (stAgainst(trader.side, signal.supertrend.direction)) return false;
	const c = signal.confluence;
	const structured = signal.structure !== 'none';
	if (c >= 5) return true;
	if (c >= 4 && trader.leverage <= 50) return true;
	if (c >= 4 && structured) return true;
	if (c >= 3 && trader.leverage <= 25 && structured) return true;
	if (c >= 3 && trader.leverage <= 10) return true;
	return false;
}

export function isConsidering(trader: TraderDef, signal: SignalResponse): boolean {
	if (wantsOpen(trader, signal)) return false;
	if (!mandateMatch(trader.side, signal.bias)) return false;
	return signal.confluence >= 2 && signal.confluence <= 4;
}

function thoughtText(trader: TraderDef, signal: SignalResponse): string {
	if (trader.side === 'long') {
		if (signal.structure === 'pullback') return 'pullback long?';
		if (signal.structure === 'breakout') return 'breakout long?';
		if (signal.rsi < 45) return 'wait for reclaim';
		return 'ST flip';
	}
	if (signal.structure === 'rejection') return 'rejection short?';
	if (signal.structure === 'breakout') return 'breakout short?';
	if (signal.rsi > 55) return 'wait for flush';
	return 'ST flip';
}

function statusFromPnl(pct: number): FloorStatus {
	if (pct > 0.2) return 'celebrating';
	if (pct < -0.2) return 'stress';
	return 'open';
}

export function postureForTrader(
	trader: TraderDef,
	signal: SignalResponse | null,
	leg: TraderLeg | null
): TraderPostureCard {
	const sample = signal?.sample ?? leg?.sample ?? true;
	const structure = signal?.structure ?? 'none';
	const confluence = signal?.confluence ?? 0;
	const bias: Bias = signal?.bias ?? 'FLAT';
	const aligned = signal?.mtf?.aligned ?? false;

	const base = {
		traderId: trader.id,
		side: trader.side,
		leverage: trader.leverage,
		symbol: leg?.symbol ?? signal?.symbol ?? 'SOLUSDT',
		structure,
		confluence,
		bias,
		aligned,
		sample
	};

	if (leg) {
		// An open leg remains open between closed-candle decisions. The book is
		// the source of truth here; intrabar signal noise must not rewrite posture.
		const pct = leg.unrealizedPnlUsd / (leg.notionalUsd / trader.leverage);
		return {
			...base,
			posture: 'open',
			status: statusFromPnl(pct),
			entryMark: leg.entryMark,
			mark: leg.mark,
			unrealizedPnlUsd: leg.unrealizedPnlUsd,
			unrealizedPnlPctMargin: pct,
			stop: signal?.risk.stop ?? leg.stop,
			tp1: signal?.risk.tp1 ?? leg.tp1,
			tp2: signal?.risk.tp2 ?? leg.tp2,
			rrTp1: signal?.risk.rr_tp1,
			invalidation: 'ST flip against side',
			sample: sample || leg.sample
		};
	}

	if (!signal || bias === 'FLAT') {
		return { ...base, posture: 'watching' as const, status: 'watching' as const };
	}

	if (!mandateMatch(trader.side, bias)) {
		return { ...base, posture: 'counter' as const, status: 'flat' as const };
	}

	if (isConsidering(trader, signal)) {
		return {
			...base,
			posture: 'considering',
			status: 'thinking',
			cloud: thoughtText(trader, signal),
			tentativeStop: signal.risk.stop,
			tentativeTp1: signal.risk.tp1,
			stop: signal.risk.stop,
			tp1: signal.risk.tp1,
			tp2: signal.risk.tp2
		};
	}

	return { ...base, posture: 'watching', status: 'watching' };
}

/**
 * Reconcile at a closed-candle decision point. Existing legs persist between
 * decisions and only leave on an explicit invalidation.
 */
export function reconcileBook(
	book: OpenBook,
	signal: SignalResponse | null,
	traders: TraderDef[],
	mark: number,
	sample: boolean,
	displaySymbol = 'SOLUSDT',
	exchangeSymbol = 'SOLUSDT',
	decisionPoint = true
): { book: OpenBook; legs: TraderLeg[] } {
	const next: OpenBook = {};
	const legs: TraderLeg[] = [];
	if (!signal || mark <= 0) return { book: {}, legs: [] };

	for (const t of traders) {
		const alreadyOpen = book[t.id] !== undefined;
		if (!alreadyOpen && !wantsOpen(t, signal)) continue;
		if (alreadyOpen && decisionPoint && (oppositeBias(t.side, signal.bias) || stAgainst(t.side, signal.supertrend.direction))) {
			continue;
		}
		const entry = book[t.id] ?? mark;
		next[t.id] = entry;
		const leg = markLeg(t, entry, mark, sample, displaySymbol, exchangeSymbol);
		leg.stop = signal.risk.stop;
		leg.tp1 = signal.risk.tp1;
		leg.tp2 = signal.risk.tp2;
		legs.push(leg);
	}
	return { book: next, legs };
}

export function staffNote(staff: StaffDef, signal: SignalResponse | null): string {
	if (!signal) return 'waiting on tape';
	const c = signal.confluence;
	const bias = signal.bias;
	switch (staff.role) {
		case 'cio':
			return bias === 'FLAT' ? 'VAR glance — book quiet' : `risk glance · ${bias} ${c}/6`;
		case 'pm':
			return bias === 'FLAT'
				? 'alloc: stay balanced'
				: `alloc note: skew ${bias === 'LONG' ? 'longs' : 'shorts'}`;
		case 'senior_analyst':
			return signal.structure !== 'none'
				? `${signal.structure} · RSI ${signal.rsi.toFixed(0)}`
				: `structure none · RSI ${signal.rsi.toFixed(0)}`;
		case 'research_analyst':
			return `clip: ST ${signal.supertrend.direction === 1 ? '↑' : '↓'} ${signal.supertrend.value.toFixed(1)}`;
		case 'quant':
			return `model conf ${c}/6 · ${signal.atr.state}`;
		default:
			return '';
	}
}

export function statusLabel(status: FloorStatus): string {
	switch (status) {
		case 'open':
			return 'In position';
		case 'thinking':
			return 'Thinking';
		case 'watching':
			return 'Watching';
		case 'flat':
			return 'FLAT';
		case 'stress':
			return 'Stress';
		case 'celebrating':
			return 'Celebrating';
	}
}
