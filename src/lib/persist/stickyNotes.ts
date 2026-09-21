import { readJson, writeJson } from './local';

export const STICKY_STORAGE_KEY = 'phf-window-stickies';

export interface StickyNote {
	id: string;
	text: string;
	/** Percent of window-wall width (0–100). */
	x: number;
	/** Percent of window-wall height (0–100). */
	y: number;
	color: string;
	createdAt: number;
}

export const STICKY_COLORS = ['#ffe08a', '#ffb4c8', '#b8e0ff', '#c8f0b0', '#e0c8ff'] as const;

export function loadStickyNotes(): StickyNote[] {
	const raw = readJson<StickyNote[]>(STICKY_STORAGE_KEY, []);
	if (!Array.isArray(raw)) return [];
	const seen = new Set<string>();
	return raw
		.filter(
			(n) =>
				n &&
				typeof n.id === 'string' &&
				typeof n.text === 'string' &&
				Number.isFinite(n.x) &&
				Number.isFinite(n.y)
		)
		.filter((n) => { if (seen.has(n.id)) return false; seen.add(n.id); return true; })
		.map((n) => ({
			id: n.id,
			text: String(n.text).slice(0, 140),
			x: Math.min(92, Math.max(2, n.x)),
			y: Math.min(88, Math.max(4, n.y)),
			color: STICKY_COLORS.some((color) => color === n.color) ? n.color : STICKY_COLORS[0],
			createdAt: typeof n.createdAt === 'number' ? n.createdAt : Date.now()
		}));
}

export function saveStickyNotes(notes: StickyNote[]): void {
	writeJson(STICKY_STORAGE_KEY, notes);
}

export function newStickyId(): string {
	return `sticky-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
