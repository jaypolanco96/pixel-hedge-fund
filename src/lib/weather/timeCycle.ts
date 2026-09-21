import type { DayPhase, SimClockState } from '$lib/data/types';

/** One real second ~ 2 sim minutes -> full day ~12 real minutes */
export const SIM_MINUTES_PER_REAL_SECOND = 2;

/**
 * Real-calendar holiday window for Christmas / winter snow.
 * Dec 1 - Jan 5 inclusive (local timezone).
 * Outside this window snow is off; birds still run year-round.
 */
export function isHolidaySnowWindow(date: Date = new Date()): boolean {
	const month = date.getMonth(); // 0 = Jan, 11 = Dec
	const day = date.getDate();
	return (month === 11 && day >= 1) || (month === 0 && day <= 5);
}

export function phaseFromHour(hour: number): DayPhase {
	if (hour >= 5 && hour < 7) return 'dawn';
	if (hour >= 7 && hour < 16) return 'day';
	if (hour >= 16 && hour < 18.5) return 'golden';
	if (hour >= 18.5 && hour < 20.5) return 'dusk';
	return 'night';
}

export function outdoorLux(hour: number): number {
	if (hour >= 6 && hour < 8) return (hour - 6) / 2;
	if (hour >= 8 && hour < 16) return 1;
	if (hour >= 16 && hour < 20) return 1 - (hour - 16) / 4;
	if (hour >= 5 && hour < 6) return 0.15 * (hour - 5);
	return 0.08;
}

export function formatSimClock(hour: number): string {
	const h = Math.floor(hour) % 24;
	const m = Math.floor((hour % 1) * 60);
	const ampm = h >= 12 ? 'PM' : 'AM';
	const h12 = h % 12 === 0 ? 12 : h % 12;
	return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

/** Legacy rain-only helper (kept for callers / tests). */
export function rainFromSimMinutes(totalSimMinutes: number): { raining: boolean; intensity: number } {
	const w = weatherFromSimMinutes(totalSimMinutes, false);
	return { raining: w.raining, intensity: w.rainIntensity };
}

/**
 * Precipitation bout every 135 sim-minutes: 90 clear, then ~45 precip with ramp.
 * During holidayWindow, ~2/3 of precip bouts are snow (rest rain).
 * Outside holiday: snow never rolls (rain only).
 */
export function weatherFromSimMinutes(
	totalSimMinutes: number,
	holidayWindow: boolean
): {
	raining: boolean;
	rainIntensity: number;
	snowing: boolean;
	snowIntensity: number;
} {
	const cycleLen = 135;
	const cycle = ((totalSimMinutes % cycleLen) + cycleLen) % cycleLen;
	const cycleIndex = Math.floor(Math.max(0, totalSimMinutes) / cycleLen);

	if (cycle < 90) {
		return { raining: false, rainIntensity: 0, snowing: false, snowIntensity: 0 };
	}

	const into = cycle - 90;
	const intensity = into < 8 ? into / 8 : into > 37 ? Math.max(0, (45 - into) / 8) : 1;
	const active = intensity > 0.05;

	// Deterministic per bout: cycleIndex % 3 !== 0 -> snow (2/3) when holiday
	const preferSnow = holidayWindow && cycleIndex % 3 !== 0;

	if (preferSnow) {
		return {
			raining: false,
			rainIntensity: 0,
			snowing: active,
			snowIntensity: intensity
		};
	}

	return {
		raining: active,
		rainIntensity: intensity,
		snowing: false,
		snowIntensity: 0
	};
}

export function skyColors(phase: DayPhase): { top: string; mid: string; bottom: string; wash: string } {
	switch (phase) {
		case 'dawn':
			return { top: '#3a4a6a', mid: '#c48a7a', bottom: '#e8b896', wash: 'rgba(255,180,120,0.25)' };
		case 'day':
			return { top: '#5a9fc8', mid: '#7eb6d9', bottom: '#b8d4e8', wash: 'rgba(180,220,255,0.15)' };
		case 'golden':
			return { top: '#4a2a6a', mid: '#e89040', bottom: '#f0b060', wash: 'rgba(255,140,60,0.55)' };
		case 'dusk':
			return { top: '#1a1e3a', mid: '#6a3a5a', bottom: '#c07050', wash: 'rgba(180,80,100,0.35)' };
		case 'night':
		default:
			return { top: '#0b1220', mid: '#121a2e', bottom: '#1a2438', wash: 'rgba(40,60,100,0.2)' };
	}
}

export function tickSimClock(
	prev: SimClockState,
	dtSec: number,
	totalSimMinutes: number,
	now: Date = new Date()
): SimClockState {
	const hour = (prev.hour + (dtSec * SIM_MINUTES_PER_REAL_SECOND) / 60) % 24;
	const phase = phaseFromHour(hour);
	const holidayWindow = isHolidaySnowWindow(now);
	const weather = weatherFromSimMinutes(totalSimMinutes, holidayWindow);
	return {
		hour,
		phase,
		label: formatSimClock(hour),
		outdoorLux: outdoorLux(hour),
		raining: weather.raining,
		rainIntensity: weather.rainIntensity,
		snowing: weather.snowing,
		snowIntensity: weather.snowIntensity,
		holidayWindow
	};
}

export function initialSimClock(realHourHint?: number, now: Date = new Date()): SimClockState {
	const hour = realHourHint ?? 17.35; // golden sunset - Apex Capital vibe
	const phase = phaseFromHour(hour);
	const holidayWindow = isHolidaySnowWindow(now);
	return {
		hour,
		phase,
		label: formatSimClock(hour),
		outdoorLux: outdoorLux(hour),
		raining: false,
		rainIntensity: 0,
		snowing: false,
		snowIntensity: 0,
		holidayWindow
	};
}

/** Stream/demo override: keep holiday accents + continuous snow. */
export function applyForcedChristmasSnow(clock: SimClockState, force: boolean): SimClockState {
	if (!force) return clock;
	return {
		...clock,
		holidayWindow: true,
		snowing: true,
		snowIntensity: Math.max(0.8, clock.snowIntensity || 0),
		raining: false,
		rainIntensity: 0
	};
}
