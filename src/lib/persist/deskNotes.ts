/** Local desk scratch notes — never sent to exchange. */
import { readJson, writeJson } from './local';

export const DESK_NOTES_KEY = 'phf-desk-notes';

export interface DeskNote {
	id: string;
	text: string;
	createdAt: number;
	symbol?: string;
}

export function loadDeskNotes(): DeskNote[] {
	const raw = readJson<unknown>(DESK_NOTES_KEY, []);
	if (!Array.isArray(raw)) return [];
	return raw
		.filter(
			(n): n is DeskNote =>
				!!n &&
				typeof n === 'object' &&
				typeof (n as DeskNote).id === 'string' &&
				typeof (n as DeskNote).text === 'string'
		)
		.map((n) => ({
			id: n.id,
			text: String(n.text).slice(0, 200),
			createdAt: typeof n.createdAt === 'number' ? n.createdAt : Date.now(),
			symbol: typeof n.symbol === 'string' ? n.symbol : undefined
		}))
		.slice(0, 40);
}

export function saveDeskNotes(notes: DeskNote[]): void {
	writeJson(DESK_NOTES_KEY, notes.slice(0, 40));
}

export function newDeskNoteId(): string {
	return `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
