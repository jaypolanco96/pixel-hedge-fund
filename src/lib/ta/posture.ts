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
import { markLeg, traderNotional } from '$lib/characters/cast';

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

export interface BookEntry {
	entryMark: number;
	stop: number;
	tp1: number;
	tp2: number;
	strategy: 'trend' | 'hedge';
	rrTp1: number;
	rrTp2: number;
	openedAt: number;
}
export type OpenBook = Record<string, BookEntry>;
export interface TakeProfitEvent {
	traderId: string;
	pnlUsd: number;
	target: 'TP1' | 'TP2';
}

const RISK_PROFILE: Record<number, { stop: number; tp1: number; tp2: number }> = {
	5: { stop: 1.28, tp1: 1.35, tp2: 2.25 },
	10: { stop: 1.14, tp1: 1.5, tp2: 2.5 },
	25: { stop: 1, tp1: 1.65, tp2: 2.7 },
	50: { stop: 0.84, tp1: 1.8, tp2: 2.9 },
	100: { stop: 0.7, tp1: 2, tp2: 3.1 }
};

/** Counter-trend fades run at half the desk's normal notional. */
export const HEDGE_SIZE_SCALE = 0.5;
/** The risk desk refuses entries that push net exposure past this share of combined desk capacity. */
export const MAX_NET_FRACTION = 0.5;
const BAR_MS = 15 * 60_000;

/** A fade that has not worked within a few bars is a wrong idea; hotter desks give up sooner. */
function fadeMaxHoldMs(trader: TraderDef): number {
	const bars = trader.leverage <= 10 ? 12 : trader.leverage <= 25 ? 8 : trader.leverage <= 50 ? 6 : 4;
	return bars * BAR_MS;
}

export interface BookExposure {
	longUsd: number;
	shortUsd: number;
	netUsd: number;
	grossUsd: number;
}

export function bookExposure(legs: TraderLeg[]): BookExposure {
	let longUsd = 0;
	let shortUsd = 0;
	for (const leg of legs) {
		if (leg.side === 'long') longUsd += leg.notionalUsd;
		else shortUsd += leg.notionalUsd;
	}
	return { longUsd, shortUsd, netUsd: longUsd - shortUsd, grossUsd: longUsd + shortUsd };
}

function riskPlan(trader: TraderDef, signal: SignalResponse, entry: number, strategy: 'trend' | 'hedge') {
	const profile = RISK_PROFILE[trader.leverage] ?? RISK_PROFILE[25];
	// The Supertrend stop sits on the trend side, so a fade is risked off ATR instead.
	const baseRisk = strategy === 'hedge'
		? Math.max(signal.atr['14'], entry * 0.0015)
		: Math.max(Math.abs(entry - signal.risk.stop), signal.atr['14'] * 0.7, entry * 0.0015);
	const risk = baseRisk * profile.stop;
	const rrTp1 = strategy === 'hedge' ? Math.min(profile.tp1, 1.35) : profile.tp1;
	const rrTp2 = strategy === 'hedge' ? Math.min(profile.tp2, 2.1) : profile.tp2;
	const long = trader.side === 'long';
	return {
		stop: long ? entry - risk : entry + risk,
		tp1: long ? entry + risk * rrTp1 : entry - risk * rrTp1,
		tp2: long ? entry + risk * rrTp2 : entry - risk * rrTp2,
		rrTp1,
		rrTp2
	};
}

function mandateMatch(side: Side, bias: Bias): boolean {
	return (side === 'long' && bias === 'LONG') || (side === 'short' && bias === 'SHORT');
}

function stAgainst(side: Side, dir: 1 | -1): boolean {
	return (side === 'long' && dir === -1) || (side === 'short' && dir === 1);
}

/** Open only when confluence supports the desk mandate - never invent a fill. */
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

/** Both desks scan the tape on their own. The signal's bias and confluence only
 * describe the trend side, so the desk fighting the trend works a separate
 * mean-reversion (fade) playbook: RSI exhaustion plus price stretched from the
 * EMA21 in ATR units. Higher-leverage desks demand deeper exhaustion, and every
 * threshold tightens when the setup and regime timeframes are both strongly
 * aligned against the fade. */
function fadeMetrics(trader: TraderDef, signal: SignalResponse) {
	const tier = trader.leverage <= 10 ? 0 : trader.leverage <= 25 ? 1 : trader.leverage <= 50 ? 2 : 3;
	const strongTrend = !!signal.mtf?.aligned && signal.confluence >= 5;
	const rsiDist = [10, 12, 15, 18][tier] + (strongTrend ? 5 : 0);
	const stretchNeeded = [0.75, 1, 1.25, 1.5][tier] + (strongTrend ? 0.5 : 0);
	const atr = signal.atr['14'];
	const long = trader.side === 'long';
	const away = long ? signal.ema['21'] - signal.last : signal.last - signal.ema['21'];
	return {
		rsiDist,
		stretchNeeded,
		rsiDepth: long ? 50 - signal.rsi : signal.rsi - 50,
		stretch: atr > 0 ? away / atr : 0
	};
}

export function wantsHedgeOpen(trader: TraderDef, signal: SignalResponse): boolean {
	if (mandateMatch(trader.side, signal.bias)) return false;
	const m = fadeMetrics(trader, signal);
	return m.rsiDepth >= m.rsiDist && m.stretch >= m.stretchNeeded;
}

function isFadeForming(trader: TraderDef, signal: SignalResponse): boolean {
	if (mandateMatch(trader.side, signal.bias) || wantsHedgeOpen(trader, signal)) return false;
	const m = fadeMetrics(trader, signal);
	return m.rsiDepth >= m.rsiDist * 0.7 && m.stretch >= m.stretchNeeded * 0.6;
}

function fadeCloud(trader: TraderDef, signal: SignalResponse): string {
	return `${trader.side === 'long' ? 'dip-buy?' : 'fade the rip?'} RSI ${signal.rsi.toFixed(0)}`;
}

/** Trend legs die when Supertrend flips against them. A fade's thesis is a
 * snap back to the middle, so it is done once RSI has normalised. */
function thesisBroken(trader: TraderDef, strategy: 'trend' | 'hedge', signal: SignalResponse): boolean {
	if (strategy === 'trend') return stAgainst(trader.side, signal.supertrend.direction);
	return trader.side === 'long' ? signal.rsi >= 55 : signal.rsi <= 45;
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
	leg: TraderLeg | null,
	riskHeld = false
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
		const pct = leg.unrealizedPnlUsd / (leg.notionalUsd / leg.leverage);
		return {
			...base,
			posture: 'open',
			status: statusFromPnl(pct),
			entryMark: leg.entryMark,
			mark: leg.mark,
			unrealizedPnlUsd: leg.unrealizedPnlUsd,
			unrealizedPnlPctMargin: pct,
			stop: leg.stop ?? signal?.risk.stop,
			tp1: leg.tp1 ?? signal?.risk.tp1,
			tp2: leg.tp2 ?? signal?.risk.tp2,
			rrTp1: leg.rrTp1 ?? signal?.risk.rr_tp1,
			invalidation: 'ST flip against side',
			sample: sample || leg.sample
		};
	}

	if (!signal) {
		return { ...base, posture: 'watching' as const, status: 'watching' as const };
	}

	if (riskHeld) {
		return { ...base, posture: 'considering', status: 'thinking', cloud: 'risk desk: net cap' };
	}

	if (!mandateMatch(trader.side, bias)) {
		if (isFadeForming(trader, signal)) {
			return { ...base, posture: 'considering', status: 'thinking', cloud: fadeCloud(trader, signal) };
		}
		return bias === 'FLAT'
			? { ...base, posture: 'watching' as const, status: 'watching' as const }
			: { ...base, posture: 'counter' as const, status: 'watching' as const };
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
 * decisions and only leave on an explicit invalidation. Legs already on the
 * book are settled first so the risk desk sizes new entries against real net
 * exposure and refuses any that would push it past MAX_NET_FRACTION.
 */
export function reconcileBook(
	book: OpenBook,
	signal: SignalResponse | null,
	traders: TraderDef[],
	mark: number,
	sample: boolean,
	displaySymbol = 'SOLUSDT',
	exchangeSymbol = 'SOLUSDT',
	decisionPoint = true,
	options: { cooldown?: ReadonlySet<string>; now?: number } = {}
): { book: OpenBook; legs: TraderLeg[]; takeProfits: TakeProfitEvent[]; stopOuts: string[]; timeStops: string[]; riskDenied: string[] } {
	const next: OpenBook = {};
	const legs: TraderLeg[] = [];
	const takeProfits: TakeProfitEvent[] = [];
	const stopOuts: string[] = [];
	const timeStops: string[] = [];
	const riskDenied: string[] = [];
	if (!signal || mark <= 0) return { book: {}, legs: [], takeProfits, stopOuts, timeStops, riskDenied };

	const now = options.now ?? Date.now();
	const netCap = traders.reduce((sum, t) => sum + traderNotional(t.leverage), 0) * MAX_NET_FRACTION;
	let net = 0;
	const order = [...traders.filter((t) => book[t.id]), ...traders.filter((t) => !book[t.id])];

	for (const t of order) {
		const existing = book[t.id];
		const alreadyOpen = existing !== undefined;
		let strategy: 'trend' | 'hedge';
		if (existing) {
			strategy = existing.strategy;
			if (decisionPoint && thesisBroken(t, strategy, signal)) continue;
			if (decisionPoint && strategy === 'hedge' && now - existing.openedAt >= fadeMaxHoldMs(t)) {
				timeStops.push(t.id);
				continue;
			}
		} else if (options.cooldown?.has(t.id)) {
			continue;
		} else if (wantsOpen(t, signal)) {
			strategy = 'trend';
		} else if (wantsHedgeOpen(t, signal)) {
			strategy = 'hedge';
		} else {
			continue;
		}
		const scale = strategy === 'hedge' ? HEDGE_SIZE_SCALE : 1;
		if (!alreadyOpen) {
			const signed = (t.side === 'long' ? 1 : -1) * traderNotional(t.leverage) * scale;
			if (Math.abs(net + signed) > netCap && Math.abs(net + signed) > Math.abs(net)) {
				riskDenied.push(t.id);
				continue;
			}
		}
		const entry = existing?.entryMark ?? mark;
		const leg = markLeg(t, entry, mark, sample, displaySymbol, exchangeSymbol, scale);
		leg.strategy = strategy;
		if (existing) {
			leg.stop = existing.stop;
			leg.tp1 = existing.tp1;
			leg.tp2 = existing.tp2;
			leg.rrTp1 = existing.rrTp1;
			leg.rrTp2 = existing.rrTp2;
		} else {
			const plan = riskPlan(t, signal, entry, leg.strategy);
			leg.stop = plan.stop;
			leg.tp1 = plan.tp1;
			leg.tp2 = plan.tp2;
			leg.rrTp1 = plan.rrTp1;
			leg.rrTp2 = plan.rrTp2;
		}
		const targetReached = leg.tp1 != null && (
			(t.side === 'long' && leg.tp1 > entry && mark >= leg.tp1)
			|| (t.side === 'short' && leg.tp1 < entry && mark <= leg.tp1)
		);
		if (alreadyOpen && targetReached && leg.unrealizedPnlUsd > 0) {
			takeProfits.push({ traderId: t.id, pnlUsd: leg.unrealizedPnlUsd, target: 'TP1' });
			continue;
		}
		const stopReached = leg.stop != null && (
			(t.side === 'long' && mark <= leg.stop)
			|| (t.side === 'short' && mark >= leg.stop)
		);
		if (alreadyOpen && stopReached) {
			stopOuts.push(t.id);
			continue;
		}
		next[t.id] = { entryMark: entry, stop: leg.stop!, tp1: leg.tp1!, tp2: leg.tp2!, strategy, rrTp1: leg.rrTp1!, rrTp2: leg.rrTp2!, openedAt: existing?.openedAt ?? now };
		legs.push(leg);
		net += (t.side === 'long' ? 1 : -1) * leg.notionalUsd;
	}
	const rank = new Map(traders.map((t, i) => [t.id, i]));
	legs.sort((a, b) => (rank.get(a.traderId) ?? 0) - (rank.get(b.traderId) ?? 0));
	return { book: next, legs, takeProfits, stopOuts, timeStops, riskDenied };
}

function fmtUsd(usd: number): string {
	const abs = Math.abs(usd);
	return abs >= 1e6 ? `$${(abs / 1e6).toFixed(1)}M` : `$${Math.round(abs / 1e3)}K`;
}

export function staffNote(
	staff: StaffDef,
	signal: SignalResponse | null,
	risk?: BookExposure & { denied: number }
): string {
	if (!signal) return 'waiting on tape';
	const c = signal.confluence;
	const bias = signal.bias;
	switch (staff.role) {
		case 'cio':
			if (risk && risk.denied > 0) return `net cap hit . ${risk.denied} desk${risk.denied > 1 ? 's' : ''} held`;
			return bias === 'FLAT' ? 'VAR glance - book quiet' : `risk glance . ${bias} ${c}/6`;
		case 'pm':
			if (risk && risk.grossUsd > 0) {
				return `net ${risk.netUsd >= 0 ? 'long' : 'short'} ${fmtUsd(risk.netUsd)} / gross ${fmtUsd(risk.grossUsd)}`;
			}
			return bias === 'FLAT'
				? 'alloc: stay balanced'
				: `alloc note: skew ${bias === 'LONG' ? 'longs' : 'shorts'}`;
		case 'senior_analyst':
			return signal.structure !== 'none'
				? `${signal.structure} . RSI ${signal.rsi.toFixed(0)}`
				: `structure none . RSI ${signal.rsi.toFixed(0)}`;
		case 'research_analyst':
			return `clip: ST ${signal.supertrend.direction === 1 ? '↑' : '↓'} ${signal.supertrend.value.toFixed(1)}`;
		case 'quant':
			return `model conf ${c}/6 . ${signal.atr.state}`;
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
