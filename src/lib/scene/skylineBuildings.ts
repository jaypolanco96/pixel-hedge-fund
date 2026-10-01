import type { OfficeTheme } from '$lib/persist/deskSettings';

/** Building silhouettes for <Skyline>, all in its 640 x 180 viewBox (ground at y = 180). */
export type BuildingKind =
	| 'slab'
	| 'setback'
	| 'chrysler'
	| 'taper'
	| 'spire'
	| 'pencil'
	| 'slant'
	| 'citi'
	| 'jenga'
	| 'curve'
	| 'sail'
	| 'cupola';

export interface SkylineBuilding {
	name: string;
	kind: BuildingKind;
	x: number;
	w: number;
	/** Roof (or crown) height, as a y coordinate. */
	top: number;
}

export interface BuildingShape {
	/** Glass faces: each gets the One WTC treatment (dark edges, lit center, window bands). */
	parts: string[];
	/** Dark structural detail: antennas, spires, parapets. */
	trims: { x: number; y: number; w: number; h: number }[];
	/** Rough roofline, for snow dusting and roosting birds. */
	roof: { x: number; y: number; w: number };
}

const G = 180;
const rect = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h${-w}Z`;
const poly = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${x} ${y}`).join('L')}Z`;

export function buildingShape(b: SkylineBuilding): BuildingShape {
	const { x, w, top } = b;
	const H = G - top;
	const cx = x + w / 2;
	switch (b.kind) {
		case 'setback': {
			const t1 = top + H * 0.38;
			const t2 = top + H * 0.18;
			return {
				parts: [rect(x, t1, w, G - t1), rect(x + w * 0.14, t2, w * 0.72, t1 - t2), rect(x + w * 0.3, top, w * 0.4, t2 - top)],
				trims: [{ x: cx - 1, y: top - 10, w: 2, h: 10 }],
				roof: { x: x + w * 0.3, y: top, w: w * 0.4 }
			};
		}
		case 'chrysler': {
			const body = top + H * 0.34;
			const terrace = top + H * 0.2;
			return {
				parts: [
					rect(x, body, w, G - body),
					rect(x + w * 0.16, terrace, w * 0.68, body - terrace),
					poly([[x + w * 0.2, terrace], [x + w * 0.8, terrace], [x + w * 0.6, top], [x + w * 0.4, top]])
				],
				trims: [{ x: cx - 0.8, y: top - 16, w: 1.6, h: 16 }],
				roof: { x: x + w * 0.16, y: terrace, w: w * 0.68 }
			};
		}
		case 'taper':
			return {
				parts: [poly([[x, G], [x + w * 0.1, top + H * 0.14], [x + w * 0.32, top], [x + w * 0.72, top + H * 0.05], [x + w * 0.9, top + H * 0.2], [x + w, G]])],
				trims: [{ x: x + w * 0.32 - 0.7, y: top - 12, w: 1.4, h: 12 }],
				roof: { x: x + w * 0.32, y: top, w: w * 0.4 }
			};
		case 'spire':
			return {
				parts: [poly([[x, G], [x, top + H * 0.18], [x + w * 0.42, top], [x + w * 0.6, top], [x + w, top + H * 0.12], [x + w, G]])],
				trims: [{ x: x + w * 0.5 - 0.8, y: top - 18, w: 1.6, h: 18 }],
				roof: { x: x + w * 0.42, y: top, w: w * 0.18 }
			};
		case 'pencil':
			return {
				parts: [rect(x, top, w, H)],
				trims: [{ x, y: top - 2, w, h: 2 }],
				roof: { x, y: top - 2, w }
			};
		case 'slant':
			return {
				parts: [poly([[x, G], [x, top + H * 0.16], [x + w, top], [x + w, G]])],
				trims: [],
				roof: { x: x + w * 0.5, y: top + H * 0.08, w: w * 0.5 }
			};
		case 'citi':
			return {
				parts: [poly([[x, G], [x, top + w * 0.7], [x + w, top], [x + w, G]])],
				trims: [],
				roof: { x: x + w * 0.5, y: top + w * 0.35, w: w * 0.5 }
			};
		case 'jenga': {
			const step = H / 5;
			return {
				parts: [
					rect(x, top + step * 2.5, w, G - top - step * 2.5),
					rect(x - 2, top + step * 1.2, w, step * 1.3),
					rect(x + 2, top, w - 3, step * 1.2)
				],
				trims: [],
				roof: { x: x + 2, y: top, w: w - 3 }
			};
		}
		case 'curve': {
			const r = Math.min(w * 0.6, H * 0.3);
			return {
				parts: [`M${x} ${G}V${top + r}Q${x} ${top} ${cx} ${top}Q${x + w} ${top} ${x + w} ${top + r}V${G}Z`],
				trims: [],
				roof: { x: x + w * 0.25, y: top + 1, w: w * 0.5 }
			};
		}
		case 'sail':
			return {
				parts: [`M${x} ${G}V${top + H * 0.22}Q${x + w * 0.3} ${top} ${x + w} ${top + H * 0.04}V${G}Z`],
				trims: [],
				roof: { x: x + w * 0.5, y: top + 2, w: w * 0.5 }
			};
		case 'cupola': {
			const body = top + H * 0.3;
			const tower = top + H * 0.08;
			return {
				parts: [
					rect(x, body, w, G - body),
					rect(x + w * 0.3, tower, w * 0.4, body - tower),
					`M${x + w * 0.32} ${tower}Q${cx} ${top - 3} ${x + w * 0.68} ${tower}Z`
				],
				trims: [{ x: cx - 0.6, y: top - 8, w: 1.2, h: 6 }],
				roof: { x: x + w * 0.3, y: tower, w: w * 0.4 }
			};
		}
		case 'slab':
		default:
			return {
				parts: [rect(x, top, w, H)],
				trims: [{ x: x + 1, y: top - 2, w: w - 2, h: 2 }],
				roof: { x, y: top - 2, w }
			};
	}
}

/** Real, recognisable towers. The center slot (x 300 to 372) is reserved for the theme's own
 * centerpiece tower (Empire State / Miami Tower), drawn separately because the UFO event,
 * crown glow, and the home page's landmark offset all target it. */
const NYC: SkylineBuilding[] = [
	{ name: '56 Leonard', kind: 'jenga', x: 4, w: 22, top: 72 },
	{ name: 'One Vanderbilt', kind: 'taper', x: 108, w: 34, top: 26 },
	{ name: 'Woolworth Building', kind: 'setback', x: 148, w: 26, top: 54 },
	{ name: 'Bank of America Tower', kind: 'spire', x: 180, w: 30, top: 32 },
	{ name: '432 Park Avenue', kind: 'pencil', x: 216, w: 14, top: 16 },
	{ name: '8 Spruce Street', kind: 'slab', x: 236, w: 26, top: 50 },
	{ name: 'Citigroup Center', kind: 'citi', x: 268, w: 26, top: 58 },
	{ name: 'Central Park Tower', kind: 'pencil', x: 380, w: 18, top: 10 },
	{ name: '30 Hudson Yards', kind: 'slant', x: 404, w: 34, top: 38 },
	{ name: 'One57', kind: 'curve', x: 444, w: 28, top: 44 },
	{ name: 'MetLife Building', kind: 'slab', x: 478, w: 36, top: 66 },
	{ name: 'Hearst Tower', kind: 'slab', x: 520, w: 24, top: 76 },
	{ name: 'Steinway Tower', kind: 'pencil', x: 550, w: 14, top: 18 },
	{ name: 'Chrysler Building', kind: 'chrysler', x: 580, w: 30, top: 22 },
	{ name: 'Seagram Building', kind: 'slab', x: 614, w: 24, top: 80 }
];

const MIAMI: SkylineBuilding[] = [
	{ name: 'Faena House', kind: 'slab', x: 4, w: 30, top: 84 },
	{ name: 'Freedom Tower', kind: 'cupola', x: 108, w: 26, top: 70 },
	{ name: 'Southeast Financial Center', kind: 'slab', x: 140, w: 30, top: 30 },
	{ name: 'Wells Fargo Center', kind: 'slab', x: 176, w: 28, top: 46 },
	{ name: 'Four Seasons Miami', kind: 'slab', x: 210, w: 26, top: 28 },
	{ name: 'Panorama Tower', kind: 'pencil', x: 242, w: 24, top: 18 },
	{ name: 'Brickell City Centre', kind: 'slant', x: 272, w: 24, top: 56 },
	{ name: 'One Thousand Museum', kind: 'curve', x: 380, w: 24, top: 20 },
	{ name: 'Echo Brickell', kind: 'taper', x: 410, w: 26, top: 40 },
	{ name: 'Porsche Design Tower', kind: 'curve', x: 442, w: 22, top: 46 },
	{ name: 'Aston Martin Residences', kind: 'sail', x: 470, w: 30, top: 24 },
	{ name: 'Paramount Miami Worldcenter', kind: 'slab', x: 506, w: 28, top: 32 },
	{ name: 'Brickell Flatiron', kind: 'taper', x: 540, w: 26, top: 36 },
	{ name: 'Marquis Miami', kind: 'slab', x: 572, w: 28, top: 50 },
	{ name: 'Icon Brickell', kind: 'slab', x: 606, w: 30, top: 54 }
];

/** Unnamed, hazy towers behind the named ones, for depth. */
export const FAR_BUILDINGS: { x: number; w: number; top: number }[] = [
	{ x: 28, w: 22, top: 96 },
	{ x: 52, w: 20, top: 78 },
	{ x: 74, w: 30, top: 100 },
	{ x: 160, w: 24, top: 86 },
	{ x: 470, w: 26, top: 92 },
	{ x: 512, w: 30, top: 70 },
	{ x: 596, w: 24, top: 98 }
];

export function skylineBuildings(theme: OfficeTheme): SkylineBuilding[] {
	return theme === 'miami-vice' ? MIAMI : NYC;
}
