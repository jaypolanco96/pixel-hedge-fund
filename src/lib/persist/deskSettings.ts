/** Desk office settings — localStorage `phf-desk-settings`. */
import { readJson, writeJson } from './local';

export const DESK_SETTINGS_KEY = 'phf-desk-settings';

export interface DeskSettings {
	showClipboard: boolean;
	showPricePad: boolean;
	showFax: boolean;
	showPet: boolean;
	showTrash: boolean;
	hideAllDraggables: boolean;
	reduceMotion: boolean;
	disableCoffeeTrip: boolean;
	compactDeskTools: boolean;
	showBlofinBadges: boolean;
	soundOff: boolean;
	/** Dim evening skyline tint for late sessions. */
	nightModeTint: boolean;
	/** Soft CRT scanlines over the floor. */
	crtScanlines: boolean;
}

export const DEFAULT_DESK_SETTINGS: DeskSettings = {
	showClipboard: true,
	showPricePad: true,
	showFax: true,
	showPet: true,
	showTrash: true,
	hideAllDraggables: false,
	reduceMotion: false,
	disableCoffeeTrip: false,
	compactDeskTools: true,
	showBlofinBadges: true,
	soundOff: true,
	nightModeTint: false,
	crtScanlines: false
};

export function loadDeskSettings(): DeskSettings {
	const raw = readJson<Partial<DeskSettings>>(DESK_SETTINGS_KEY, {});
	return { ...DEFAULT_DESK_SETTINGS, ...raw };
}

export function saveDeskSettings(settings: DeskSettings): void {
	writeJson(DESK_SETTINGS_KEY, settings);
}
