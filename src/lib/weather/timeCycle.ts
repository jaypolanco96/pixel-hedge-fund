import type { DayPhase, SimClockState } from '$lib/data/types';

/** One real second ≈ 2 sim minutes → full day ~12 real minutes */
export const SIM_MINUTES_PER_REAL_SECOND = 2;

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

export function rainFromSimMinutes(totalSimMinutes: number): { raining: boolean; intensity: number } {
	const cycle = totalSimMinutes % 135;
	if (cycle < 90) return { raining: false, intensity: 0 };
	const into = cycle - 90;
	const intensity = into < 8 ? into / 8 : into > 37 ? Math.max(0, (45 - into) / 8) : 1;
	return { raining: intensity > 0.05, intensity };
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

export function tickSimClock(prev: SimClockState, dtSec: number, totalSimMinutes: number): SimClockState {
	const hour = (prev.hour + (dtSec * SIM_MINUTES_PER_REAL_SECOND) / 60) % 24;
	const phase = phaseFromHour(hour);
	const rain = rainFromSimMinutes(totalSimMinutes);
	return {
		hour,
		phase,
		label: formatSimClock(hour),
		outdoorLux: outdoorLux(hour),
		raining: rain.raining,
		rainIntensity: rain.intensity
	};
}

export function initialSimClock(realHourHint?: number): SimClockState {
	const hour = realHourHint ?? 17.35; // golden sunset — Apex Capital vibe
	const phase = phaseFromHour(hour);
	return {
		hour,
		phase,
		label: formatSimClock(hour),
		outdoorLux: outdoorLux(hour),
		raining: false,
		rainIntensity: 0
	};
}
