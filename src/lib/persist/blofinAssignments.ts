/** Map BloFin positionId -> floor trader id. Local only - never sent to exchange. */
import { TRADERS } from '$lib/characters/cast';
import { readJson, writeJson } from './local';

export const BLOFIN_ASSIGN_KEY = 'phf-blofin-assignments';

/** positionId -> traderId */
export type BloFinAssignments = Record<string, string>;

const traderIds = new Set(TRADERS.map((t) => t.id));

export function loadBloFinAssignments(): BloFinAssignments {
	const raw = readJson<unknown>(BLOFIN_ASSIGN_KEY, {});
	if (!raw || typeof raw !== 'object') return {};
	const out: BloFinAssignments = {};
	for (const [positionId, traderId] of Object.entries(raw as Record<string, unknown>)) {
		if (typeof positionId === 'string' && typeof traderId === 'string' && traderIds.has(traderId)) {
			out[positionId] = traderId;
		}
	}
	return out;
}

export function saveBloFinAssignments(assignments: BloFinAssignments): void {
	const valid: BloFinAssignments = {};
	for (const [positionId, traderId] of Object.entries(assignments)) {
		if (positionId && traderIds.has(traderId)) valid[positionId] = traderId;
	}
	writeJson(BLOFIN_ASSIGN_KEY, valid);
}

/** traderId -> list of assigned positionIds */
export function assignmentsByTrader(assignments: BloFinAssignments): Record<string, string[]> {
	const by: Record<string, string[]> = {};
	for (const [positionId, traderId] of Object.entries(assignments)) {
		(by[traderId] ??= []).push(positionId);
	}
	return by;
}

export function assignPosition(
	assignments: BloFinAssignments,
	positionId: string,
	traderId: string | null
): BloFinAssignments {
	const next = { ...assignments };
	// One position -> one trader; clear prior mapping for this position.
	delete next[positionId];
	if (traderId && traderIds.has(traderId)) {
		// Optional: unassign this trader's previous exclusive slot for same position only.
		next[positionId] = traderId;
	}
	return next;
}
