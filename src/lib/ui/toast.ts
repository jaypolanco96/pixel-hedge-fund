/** Tiny pixel toast bus - client-only. */
import { writable } from 'svelte/store';

export type ToastKind = 'ok' | 'err' | 'info';

export interface ToastItem {
	id: string;
	kind: ToastKind;
	title: string;
	detail?: string;
	ttlMs: number;
}

export const toasts = writable<ToastItem[]>([]);

let seq = 0;

export function pushToast(
	kind: ToastKind,
	title: string,
	detail?: string,
	ttlMs = 5200
): string {
	const id = `t_${Date.now().toString(36)}_${++seq}`;
	const item: ToastItem = { id, kind, title, detail, ttlMs };
	toasts.update((list) => [...list.slice(-6), item]);
	if (typeof window !== 'undefined') {
		window.setTimeout(() => dismissToast(id), ttlMs);
	}
	return id;
}

export function dismissToast(id: string): void {
	toasts.update((list) => list.filter((t) => t.id !== id));
}

export function toastOk(title: string, detail?: string) {
	return pushToast('ok', title, detail);
}

export function toastErr(title: string, detail?: string) {
	return pushToast('err', title, detail, 7200);
}

export function toastInfo(title: string, detail?: string) {
	return pushToast('info', title, detail);
}

/** Format BloFin / exchange write failures for toasts. */
export function formatExchangeError(res: {
	error?: string;
	code?: string | number | null;
	msg?: string | null;
}): string {
	const code = res.code != null && String(res.code) !== '' ? String(res.code) : null;
	const msg = (res.msg || res.error || 'request failed').trim();
	return code ? `code ${code}: ${msg}` : msg;
}
