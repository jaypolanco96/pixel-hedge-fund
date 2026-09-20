/** Shared fixed HUD overlay so drag widgets stay viewport-locked on scroll. */

const HUD_ID = 'phf-hud-root';

const HUD_STYLE = [
	'position: fixed !important',
	'inset: 0',
	'width: 100vw',
	'height: 100vh',
	'margin: 0',
	'pointer-events: none',
	'z-index: 100000',
	'overflow: hidden',
	'transform: none',
	'filter: none',
	'perspective: none'
].join('; ');

export function ensureHudRoot(): HTMLElement {
	let hud = document.getElementById(HUD_ID);
	if (hud) {
		hud.setAttribute('style', HUD_STYLE);
		return hud;
	}
	hud = document.createElement('div');
	hud.id = HUD_ID;
	hud.setAttribute('style', HUD_STYLE);
	document.body.appendChild(hud);
	return hud;
}

export function releaseHudChild(node: HTMLElement): void {
	const parent = node.parentElement;
	if (parent?.id === HUD_ID) {
		parent.removeChild(node);
		if (parent.childElementCount === 0) parent.remove();
	} else if (node.parentNode) {
		node.parentNode.removeChild(node);
	}
}
