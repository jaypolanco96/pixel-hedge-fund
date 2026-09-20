/** Small localStorage helpers for in-scene draggable props. */
export type ScenePosition = { left: number; top: number };

export function loadScenePosition(key: string): ScenePosition | null {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		const value = JSON.parse(raw) as Partial<ScenePosition>;
		if (typeof value.left !== 'number' || typeof value.top !== 'number') return null;
		if (!Number.isFinite(value.left) || !Number.isFinite(value.top)) return null;
		return { left: value.left, top: value.top };
	} catch {
		return null;
	}
}

export function saveScenePosition(key: string, position: ScenePosition) {
	try {
		localStorage.setItem(key, JSON.stringify(position));
	} catch {
		/* Ignore unavailable or full storage. */
	}
}
