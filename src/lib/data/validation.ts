import type { Bar } from './types';

/** Reject incomplete/non-finite exchange rows before they reach indicators. */
export function validBar(bar: Bar): boolean {
	return [bar.t, bar.o, bar.h, bar.l, bar.c, bar.v].every(Number.isFinite)
		&& bar.t > 0 && bar.o > 0 && bar.c > 0 && bar.l > 0 && bar.v >= 0
		&& bar.h >= Math.max(bar.o, bar.c) && bar.l <= Math.min(bar.o, bar.c);
}

export function completedBars(bars: Bar[], intervalMs: number, now = Date.now()): Bar[] {
	return bars.filter((bar) => validBar(bar) && bar.t + intervalMs <= now);
}
