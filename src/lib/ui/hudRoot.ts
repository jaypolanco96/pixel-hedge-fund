/** Body-level fixed HUD host — no transform/filter ancestors, so position:fixed is real. */

const HUD_ID = 'phf-hud-root';

const HUD_STYLE = [
	'position: fixed',
	'inset: 0',
	'width: 100%',
	'height: 100%',
	'margin: 0',
	'padding: 0',
	'pointer-events: none',
	'z-index: 100000',
	'overflow: visible',
	'transform: none',
	'filter: none',
	'perspective: none',
	'contain: none',
	'isolation: auto',
	'will-change: auto'
].join('; ');

export function ensureHudRoot(): HTMLElement {
	if (typeof document === 'undefined') {
		throw new Error('ensureHudRoot requires document');
	}
	let hud = document.getElementById(HUD_ID);
	if (!hud) {
		hud = document.createElement('div');
		hud.id = HUD_ID;
		document.body.appendChild(hud);
	}
	hud.setAttribute('style', HUD_STYLE);
	// Must stay a direct child of <body> — never under .scene-frame / sveltekit wrappers.
	if (hud.parentElement !== document.body) {
		document.body.appendChild(hud);
	}
	return hud;
}

export function releaseHudChild(node: HTMLElement): void {
	const parent = node.parentElement;
	if (parent?.id === HUD_ID) {
		parent.removeChild(node);
		if (parent.childElementCount === 0 && !parent.hasAttribute('data-static')) {
			parent.remove();
		}
	} else if (node.parentNode) {
		node.parentNode.removeChild(node);
	}
}
