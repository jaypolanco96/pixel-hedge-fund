/** Desk office settings — localStorage `phf-desk-settings`. */
import { readJson, writeJson } from './local';

export const DESK_SETTINGS_KEY = 'phf-desk-settings';

export interface DeskSettings {
	showClipboard: boolean;
	showPricePad: boolean;
	showFax: boolean;
	showPet: boolean;
	showTrash: boolean;
	showCrtCart: boolean;
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
	/** Force Christmas snow on the skyline (for streams / demos). */
	forceChristmasSnow: boolean;
}

export const DEFAULT_DESK_SETTINGS: DeskSettings = {
	showClipboard: true,
	showPricePad: true,
	showFax: true,
	showPet: true,
	showTrash: true,
	showCrtCart: true,
	hideAllDraggables: false,
	reduceMotion: false,
	disableCoffeeTrip: false,
	compactDeskTools: true,
	showBlofinBadges: true,
	soundOff: true,
	nightModeTint: false,
	crtScanlines: false,
	forceChristmasSnow: false
};

export function loadDeskSettings(): DeskSettings {
	const raw = readJson<Partial<DeskSettings>>(DESK_SETTINGS_KEY, {});
	const settings = { ...DEFAULT_DESK_SETTINGS };
	if (raw && typeof raw === 'object') {
		for (const key of Object.keys(settings) as (keyof DeskSettings)[]) {
			if (typeof raw[key] === 'boolean') settings[key] = raw[key];
		}
	}
	return settings;
}

export function saveDeskSettings(settings: DeskSettings): void {
	writeJson(DESK_SETTINGS_KEY, settings);
}
