import type { DayPhase } from '$lib/data/types';

/**
 * Rare mariachi band visit on the trading floor.
 *
 * Spirit mirrors Kong rarity:
 * - Eligible during day or golden (office party hours).
 * - At most once per sim-day (day index = floor(totalSimMinutes / 1440)).
 * - On first eligible tick of that day, roll ~7% chance.
 * - Performance lasts ~36 anim frames, then exits.
 * - Cooldown: cannot re-roll until next sim-day.
 */

export const MARIACHI_ROLL_CHANCE = 0.07;
export const MARIACHI_FRAME_MAX = 36;

export interface MariachiState {
	active: boolean;
	frame: number;
	/** Sim-day index that already rolled (or spawned). */
	rolledDay: number;
}

export function initialMariachi(): MariachiState {
	return { active: false, frame: 0, rolledDay: -1 };
}

export function tickMariachi(
	prev: MariachiState,
	phase: DayPhase,
	totalSimMinutes: number,
	animPulse: boolean
): MariachiState {
	const day = Math.floor(totalSimMinutes / 1440);
	const eligible = phase === 'day' || phase === 'golden';

	if (prev.active) {
		if (!animPulse) return prev;
		const frame = prev.frame + 1;
		if (frame >= MARIACHI_FRAME_MAX) {
			return { active: false, frame: 0, rolledDay: prev.rolledDay };
		}
		return { ...prev, frame };
	}

	if (!eligible) return prev;
	if (day === prev.rolledDay) return prev;

	const roll = Math.random() < MARIACHI_ROLL_CHANCE;
	return {
		active: roll,
		frame: 0,
		rolledDay: day
	};
}
