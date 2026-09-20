/** Pure TA indicators — Supertrend, EMA, RSI, MACD, ATR */

export function ema(values: number[], period: number): number[] {
	const out: number[] = new Array(values.length).fill(NaN);
	if (values.length < period) return out;
	const k = 2 / (period + 1);
	let prev = 0;
	for (let i = 0; i < period; i++) prev += values[i];
	prev /= period;
	out[period - 1] = prev;
	for (let i = period; i < values.length; i++) {
		prev = values[i] * k + prev * (1 - k);
		out[i] = prev;
	}
	return out;
}

export function sma(values: number[], period: number): number[] {
	const out: number[] = new Array(values.length).fill(NaN);
	let sum = 0;
	for (let i = 0; i < values.length; i++) {
		sum += values[i];
		if (i >= period) sum -= values[i - period];
		if (i >= period - 1) out[i] = sum / period;
	}
	return out;
}

export function rsi(closes: number[], period = 14): number[] {
	const out: number[] = new Array(closes.length).fill(NaN);
	if (closes.length <= period) return out;
	let gain = 0;
	let loss = 0;
	for (let i = 1; i <= period; i++) {
		const d = closes[i] - closes[i - 1];
		if (d >= 0) gain += d;
		else loss -= d;
	}
	let avgGain = gain / period;
	let avgLoss = loss / period;
	out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
	for (let i = period + 1; i < closes.length; i++) {
		const d = closes[i] - closes[i - 1];
		const g = d > 0 ? d : 0;
		const l = d < 0 ? -d : 0;
		avgGain = (avgGain * (period - 1) + g) / period;
		avgLoss = (avgLoss * (period - 1) + l) / period;
		out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
	}
	return out;
}

export function atr(
	highs: number[],
	lows: number[],
	closes: number[],
	period = 14
): number[] {
	const tr: number[] = new Array(closes.length).fill(0);
	tr[0] = highs[0] - lows[0];
	for (let i = 1; i < closes.length; i++) {
		tr[i] = Math.max(
			highs[i] - lows[i],
			Math.abs(highs[i] - closes[i - 1]),
			Math.abs(lows[i] - closes[i - 1])
		);
	}
	return ema(tr, period); // Wilder-ish via EMA; fine for v1 gameplay
}

export function macd(
	closes: number[],
	fast = 12,
	slow = 26,
	signalPeriod = 9
): { line: number[]; signal: number[]; hist: number[] } {
	const ef = ema(closes, fast);
	const es = ema(closes, slow);
	const line = closes.map((_, i) =>
		Number.isFinite(ef[i]) && Number.isFinite(es[i]) ? ef[i] - es[i] : NaN
	);
	const signal = ema(
		line.map((v) => (Number.isFinite(v) ? v : 0)),
		signalPeriod
	);
	const hist = line.map((v, i) =>
		Number.isFinite(v) && Number.isFinite(signal[i]) ? v - signal[i] : NaN
	);
	return { line, signal, hist };
}

export interface SupertrendResult {
	value: number[];
	direction: (1 | -1)[];
}

/** Supertrend ATR period 10, mult 3.0 */
export function supertrend(
	highs: number[],
	lows: number[],
	closes: number[],
	atrPeriod = 10,
	mult = 3
): SupertrendResult {
	const a = atr(highs, lows, closes, atrPeriod);
	const n = closes.length;
	const value: number[] = new Array(n).fill(NaN);
	const direction: (1 | -1)[] = new Array(n).fill(1);

	let upper = NaN;
	let lower = NaN;
	let dir: 1 | -1 = 1;
	let st = NaN;

	for (let i = 0; i < n; i++) {
		if (!Number.isFinite(a[i])) continue;
		const mid = (highs[i] + lows[i]) / 2;
		let basicUpper = mid + mult * a[i];
		let basicLower = mid - mult * a[i];

		if (!Number.isFinite(upper)) {
			upper = basicUpper;
			lower = basicLower;
			st = basicLower;
			dir = 1;
		} else {
			basicUpper = basicUpper < upper || closes[i - 1] > upper ? basicUpper : upper;
			basicLower = basicLower > lower || closes[i - 1] < lower ? basicLower : lower;

			if (dir === 1) {
				if (closes[i] < basicLower) {
					dir = -1;
					st = basicUpper;
				} else {
					st = basicLower;
				}
			} else {
				if (closes[i] > basicUpper) {
					dir = 1;
					st = basicLower;
				} else {
					st = basicUpper;
				}
			}
			upper = basicUpper;
			lower = basicLower;
		}
		value[i] = st;
		direction[i] = dir;
	}
	return { value, direction };
}

export function lastFinite(arr: number[]): number {
	for (let i = arr.length - 1; i >= 0; i--) {
		if (Number.isFinite(arr[i])) return arr[i];
	}
	return NaN;
}
