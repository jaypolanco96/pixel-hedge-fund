import type { DayPhase } from '$lib/data/types';

/**
 * Rare UFO abduction over the Empire State Building.
 *
 * Rules mirror the former skyline event:
 * - Eligible only during dusk or night.
 * - At most once per simulated day.
 * - Rolls once when the eligible window opens, at an 8% chance.
 * - Runs for roughly twelve seconds of floor animation.
 */

export const UFO_ROLL_CHANCE = 0.08;
export const UFO_FRAME_MAX = 36;

export interface UfoState {
	active: boolean;
	frame: number;
	/** Sim-day index that already rolled (or spawned). */
	rolledDay: number;
}

export function initialUfo(): UfoState {
	return { active: false, frame: 0, rolledDay: -1 };
}

export function tickUfo(
	prev: UfoState,
	phase: DayPhase,
	totalSimMinutes: number,
	animPulse: boolean
): UfoState {
	const day = Math.floor(totalSimMinutes / 1440);
	const eligible = phase === 'dusk' || phase === 'night';

	if (prev.active) {
		if (!animPulse) return prev;
		const frame = prev.frame + 1;
		if (frame >= UFO_FRAME_MAX) {
			return { active: false, frame: 0, rolledDay: prev.rolledDay };
		}
		return { ...prev, frame };
	}

	if (!eligible) return prev;
	if (day === prev.rolledDay) return prev;

	return {
		active: Math.random() < UFO_ROLL_CHANCE,
		frame: 0,
		rolledDay: day
	};
}
