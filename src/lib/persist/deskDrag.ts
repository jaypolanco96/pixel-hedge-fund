/**
 * Click-aware desk prop dragging.
 * Pointerdown arms drag; drag starts after >4px move OR 200ms hold.
 * Click without drag still fires onclick. Positions persist via scenePositions.
 */
import {
	loadScenePosition,
	saveScenePosition,
	type ScenePosition
} from './scenePositions';

export type DeskDragDefaults = ScenePosition;

export type DeskDragHandle = {
	key: string;
	defaults: DeskDragDefaults;
	left: number;
	top: number;
	ready: boolean;
	placed: boolean;
	dragging: boolean;
	/** True after a drag — consume in onclick to suppress action. */
	suppressClick: boolean;
	el: HTMLElement | null;
	place: (parent: HTMLElement | null | undefined) => void;
	reflow: (parent: HTMLElement | null | undefined) => void;
	onPointerDown: (event: PointerEvent, parent: HTMLElement | null | undefined) => void;
	onPointerMove: (event: PointerEvent, parent: HTMLElement | null | undefined) => void;
	onPointerUp: (event: PointerEvent) => void;
	consumeClickSuppress: () => boolean;
};

const MOVE_PX = 4;
const HOLD_MS = 200;

function clamp(
	parent: HTMLElement,
	el: HTMLElement,
	left: number,
	top: number
): ScenePosition {
	const maxLeft = Math.max(0, parent.clientWidth - el.offsetWidth);
	const maxTop = Math.max(0, parent.clientHeight - el.offsetHeight);
	return {
		left: Math.min(Math.max(0, left), maxLeft),
		top: Math.min(Math.max(0, top), maxTop)
	};
}

export function createDeskDrag(key: string, defaults: DeskDragDefaults): DeskDragHandle {
	const saved = typeof localStorage !== 'undefined' ? loadScenePosition(key) : null;
	const h: DeskDragHandle = {
		key,
		defaults,
		left: saved?.left ?? defaults.left,
		top: saved?.top ?? defaults.top,
		ready: false,
		placed: false,
		dragging: false,
		suppressClick: false,
		el: null,
		place() {},
		reflow() {},
		onPointerDown() {},
		onPointerMove() {},
		onPointerUp() {},
		consumeClickSuppress() {
			if (h.suppressClick) {
				h.suppressClick = false;
				return true;
			}
			return false;
		}
	};

	let pointerId: number | null = null;
	let offsetX = 0;
	let offsetY = 0;
	let startX = 0;
	let startY = 0;
	let armed = false;
	let holdTimer: ReturnType<typeof setTimeout> | null = null;

	function setPos(parent: HTMLElement, left: number, top: number) {
		if (!h.el) {
			h.left = left;
			h.top = top;
			return;
		}
		const next = clamp(parent, h.el, left, top);
		h.left = next.left;
		h.top = next.top;
	}

	h.place = (parent) => {
		if (h.placed || !h.el || !parent) return;
		const fromStore = loadScenePosition(key);
		setPos(parent, fromStore?.left ?? defaults.left, fromStore?.top ?? defaults.top);
		h.placed = true;
		h.ready = true;
	};

	h.reflow = (parent) => {
		if (!h.ready || !h.el || !parent) return;
		setPos(parent, h.left, h.top);
	};

	function beginDrag(event: PointerEvent, parent: HTMLElement) {
		if (!h.el) return;
		const parentRect = parent.getBoundingClientRect();
		const panelRect = h.el.getBoundingClientRect();
		const scaleX = parentRect.width > 0 ? parent.clientWidth / parentRect.width : 1;
		const scaleY = parentRect.height > 0 ? parent.clientHeight / parentRect.height : 1;
		offsetX = (event.clientX - panelRect.left) * scaleX;
		offsetY = (event.clientY - panelRect.top) * scaleY;
		h.dragging = true;
		h.suppressClick = true;
		h.el.setPointerCapture(event.pointerId);
	}

	h.onPointerDown = (event, parent) => {
		if (!h.el || pointerId !== null) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		pointerId = event.pointerId;
		armed = true;
		h.dragging = false;
		startX = event.clientX;
		startY = event.clientY;
		if (parent) {
			const parentRect = parent.getBoundingClientRect();
			const panelRect = h.el.getBoundingClientRect();
			const scaleX = parentRect.width > 0 ? parent.clientWidth / parentRect.width : 1;
			const scaleY = parentRect.height > 0 ? parent.clientHeight / parentRect.height : 1;
			offsetX = (event.clientX - panelRect.left) * scaleX;
			offsetY = (event.clientY - panelRect.top) * scaleY;
		}
		holdTimer = setTimeout(() => {
			if (armed && pointerId === event.pointerId && !h.dragging && parent) {
				beginDrag(event, parent);
			}
		}, HOLD_MS);
	};

	h.onPointerMove = (event, parent) => {
		if (pointerId !== event.pointerId || !armed || !parent || !h.el) return;
		const dx = event.clientX - startX;
		const dy = event.clientY - startY;
		if (!h.dragging && Math.hypot(dx, dy) > MOVE_PX) {
			if (holdTimer) {
				clearTimeout(holdTimer);
				holdTimer = null;
			}
			beginDrag(event, parent);
		}
		if (!h.dragging) return;
		event.preventDefault();
		const parentRect = parent.getBoundingClientRect();
		const scaleX = parentRect.width > 0 ? parent.clientWidth / parentRect.width : 1;
		const scaleY = parentRect.height > 0 ? parent.clientHeight / parentRect.height : 1;
		setPos(
			parent,
			(event.clientX - parentRect.left) * scaleX - offsetX,
			(event.clientY - parentRect.top) * scaleY - offsetY
		);
	};

	h.onPointerUp = (event) => {
		if (pointerId !== event.pointerId) return;
		if (holdTimer) {
			clearTimeout(holdTimer);
			holdTimer = null;
		}
		if (h.dragging) {
			saveScenePosition(key, { left: h.left, top: h.top });
		}
		h.dragging = false;
		armed = false;
		pointerId = null;
		if (h.el?.hasPointerCapture(event.pointerId)) {
			h.el.releasePointerCapture(event.pointerId);
		}
	};

	return h;
}
