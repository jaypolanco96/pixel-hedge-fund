import type { DayPhase } from '$lib/data/types';

/**
 * Rare King Kong on the Empire State Building.
 *
 * Rules:
 * - Eligible only during dusk or night (sim time window).
 * - At most once per sim-day (day index = floor(totalSimMinutes / 1440)).
 * - On first eligible tick of a sim-day in dusk/night, roll ~8% chance.
 * - Event lasts ~28 anim frames (~9–12s at floor tick), then ends.
 * - Cooldown: cannot re-roll until next sim-day.
 */

export const KONG_ROLL_CHANCE = 0.08;
export const KONG_FRAME_MAX = 28;

export interface KongState {
	active: boolean;
	frame: number;
	/** Sim-day index that already rolled (or spawned). */
	rolledDay: number;
}

export function initialKong(): KongState {
	return { active: false, frame: 0, rolledDay: -1 };
}

export function tickKong(
	prev: KongState,
	phase: DayPhase,
	totalSimMinutes: number,
	animPulse: boolean
): KongState {
	const day = Math.floor(totalSimMinutes / 1440);
	const eligible = phase === 'dusk' || phase === 'night';

	if (prev.active) {
		if (!animPulse) return prev;
		const frame = prev.frame + 1;
		if (frame >= KONG_FRAME_MAX) {
			return { active: false, frame: 0, rolledDay: prev.rolledDay };
		}
		return { ...prev, frame };
	}

	if (!eligible) return prev;
	if (day === prev.rolledDay) return prev;

	// First eligible moment of this sim-day — roll once.
	const roll = Math.random() < KONG_ROLL_CHANCE;
	return {
		active: roll,
		frame: 0,
		rolledDay: day
	};
}
