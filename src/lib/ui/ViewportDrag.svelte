<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import type { Action } from 'svelte/action';
	import { ensureHudRoot, releaseHudChild } from './hudRoot';

	type Props = {
		children: Snippet;
		defaultLeft?: number;
		defaultTop?: number;
		defaultRight?: number;
		defaultBottom?: number;
		ariaLabel?: string;
	};

	let {
		children,
		defaultLeft,
		defaultTop,
		defaultRight,
		defaultBottom,
		ariaLabel = 'Draggable viewport overlay'
	}: Props = $props();

	let root: HTMLDivElement | undefined = $state();
	let left = $state(0);
	let top = $state(0);
	let ready = $state(false);
	let dragging = $state(false);
	let activePointer: number | null = null;
	let offsetX = 0;
	let offsetY = 0;
	let placed = false;

	function viewportSize() {
		const hud = document.getElementById('phf-hud-root');
		if (hud) {
			return { w: hud.clientWidth, h: hud.clientHeight };
		}
		return { w: window.innerWidth, h: window.innerHeight };
	}

	function clamp(x: number, y: number, width: number, height: number) {
		const { w, h } = viewportSize();
		return {
			left: Math.min(Math.max(0, x), Math.max(0, w - width)),
			top: Math.min(Math.max(0, y), Math.max(0, h - height))
		};
	}

	/** Double-lock: fixed !important + left/top/z-index on the drag root itself. */
	function applyPosition(nextLeft: number, nextTop: number) {
		left = nextLeft;
		top = nextTop;
		if (!root) return;
		const z = dragging ? 100001 : 100000;
		root.style.cssText = [
			'position: fixed !important',
			`left: ${nextLeft}px`,
			`top: ${nextTop}px`,
			'pointer-events: auto',
			`z-index: ${z}`,
			'margin: 0',
			'width: max-content',
			'max-width: 100vw',
			`cursor: ${dragging ? 'grabbing' : 'grab'}`,
			'touch-action: none',
			'user-select: none',
			'-webkit-user-select: none',
			'transform: none',
			'filter: none',
			`visibility: ${ready ? 'visible' : 'hidden'}`
		].join('; ');
	}

	function moveTo(x: number, y: number) {
		if (!root) return;
		const rect = root.getBoundingClientRect();
		const next = clamp(x, y, rect.width, rect.height);
		applyPosition(next.left, next.top);
	}

	function reassert() {
		if (!ready || !root) return;
		const hud = ensureHudRoot();
		if (root.parentElement !== hud) {
			hud.appendChild(root);
		}
		applyPosition(left, top);
		moveTo(left, top);
	}

	function placeInitial() {
		if (!root || placed) return;
		applyPosition(0, 0);
		const rect = root.getBoundingClientRect();
		const { w, h } = viewportSize();
		const initialLeft =
			defaultLeft ?? (defaultRight == null ? 0 : w - defaultRight - rect.width);
		const initialTop =
			defaultTop ?? (defaultBottom == null ? 0 : h - defaultBottom - rect.height);
		ready = true;
		placed = true;
		moveTo(initialLeft, initialTop);
	}

	/**
	 * Svelte action: keep the node under #phf-hud-root even when reactivity
	 * tries to move it back under TradingFloor on each update.
	 */
	const hudPortal: Action<HTMLElement> = (node) => {
		const hud = ensureHudRoot();
		hud.appendChild(node);

		let destroyed = false;
		let resizeObserver: ResizeObserver | undefined;
		let rafId = 0;

		const keepParented = () => {
			if (destroyed) return;
			const h = ensureHudRoot();
			if (node.parentElement !== h) {
				h.appendChild(node);
			}
			rafId = requestAnimationFrame(keepParented);
		};
		rafId = requestAnimationFrame(keepParented);

		window.addEventListener('resize', reassert);
		window.addEventListener('scroll', reassert, true);
		const vv = window.visualViewport;
		vv?.addEventListener('resize', reassert);
		vv?.addEventListener('scroll', reassert);

		void (async () => {
			await tick();
			if (destroyed) return;
			placeInitial();
			resizeObserver = new ResizeObserver(reassert);
			resizeObserver.observe(node);
		})();

		return {
			update() {
				const h = ensureHudRoot();
				if (node.parentElement !== h) {
					h.appendChild(node);
				}
			},
			destroy() {
				destroyed = true;
				cancelAnimationFrame(rafId);
				window.removeEventListener('resize', reassert);
				window.removeEventListener('scroll', reassert, true);
				vv?.removeEventListener('resize', reassert);
				vv?.removeEventListener('scroll', reassert);
				resizeObserver?.disconnect();
				releaseHudChild(node);
			}
		};
	};

	function onPointerDown(event: PointerEvent) {
		if (!root || activePointer !== null) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		if ((event.target as HTMLElement).closest('a, button, input, select, textarea, [data-no-drag]')) {
			return;
		}

		event.preventDefault();
		const rect = root.getBoundingClientRect();
		offsetX = event.clientX - rect.left;
		offsetY = event.clientY - rect.top;
		activePointer = event.pointerId;
		dragging = true;
		root.setPointerCapture(event.pointerId);
		applyPosition(left, top);
	}

	function onPointerMove(event: PointerEvent) {
		if (!dragging || event.pointerId !== activePointer) return;
		moveTo(event.clientX - offsetX, event.clientY - offsetY);
	}

	function onLostPointerCapture(event: PointerEvent) {
		if (event.pointerId !== activePointer) return;
		dragging = false;
		activePointer = null;
		applyPosition(left, top);
	}

	function stopDragging(event: PointerEvent) {
		if (!root || event.pointerId !== activePointer) return;
		dragging = false;
		activePointer = null;
		if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
		applyPosition(left, top);
	}

	// Re-apply fixed styles whenever drag/ready state flips (Svelte may rewrite style attrs).
	$effect(() => {
		if (!root || !ready) return;
		void dragging;
		applyPosition(left, top);
		const hud = ensureHudRoot();
		if (root.parentElement !== hud) {
			hud.appendChild(root);
		}
	});
</script>

<div
	bind:this={root}
	use:hudPortal
	class="viewport-drag"
	class:is-dragging={dragging}
	role="group"
	aria-label={ariaLabel}
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={stopDragging}
	onpointercancel={stopDragging}
	onlostpointercapture={onLostPointerCapture}
>
	{@render children()}
</div>

<style>
	/* Non-positioning chrome only — left/top/position live on inline style after HUD mount. */
	.viewport-drag {
		width: max-content;
		max-width: 100vw;
		cursor: grab;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
	}

	.viewport-drag.is-dragging {
		cursor: grabbing;
	}
</style>
