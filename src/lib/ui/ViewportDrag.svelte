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
		return { w: window.innerWidth, h: window.innerHeight };
	}

	function clamp(x: number, y: number, width: number, height: number) {
		const { w, h } = viewportSize();
		return {
			left: Math.min(Math.max(0, x), Math.max(0, w - width)),
			top: Math.min(Math.max(0, y), Math.max(0, h - height))
		};
	}

	/**
	 * Plain position:fixed - no visualViewport offset, no scroll reassert.
	 * Parent is #phf-hud-root on document.body (no transformed ancestors).
	 */
	function applyPosition(nextLeft: number, nextTop: number) {
		left = nextLeft;
		top = nextTop;
		if (!root) return;
		const z = dragging ? 100001 : 100000;
		root.style.setProperty('position', 'fixed', 'important');
		root.style.left = `${nextLeft}px`;
		root.style.top = `${nextTop}px`;
		root.style.right = 'auto';
		root.style.bottom = 'auto';
		root.style.margin = '0';
		root.style.width = 'max-content';
		root.style.maxWidth = '100vw';
		root.style.pointerEvents = 'auto';
		root.style.zIndex = String(z);
		root.style.cursor = dragging ? 'grabbing' : 'grab';
		root.style.touchAction = 'none';
		root.style.userSelect = 'none';
		root.style.setProperty('-webkit-user-select', 'none');
		root.style.transform = 'none';
		root.style.filter = 'none';
		root.style.visibility = ready ? 'visible' : 'hidden';
	}

	function moveTo(x: number, y: number) {
		if (!root) return;
		const rect = root.getBoundingClientRect();
		const next = clamp(x, y, rect.width, rect.height);
		applyPosition(next.left, next.top);
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

	/** Move node under body HUD once; keep it there if Svelte reparents. */
	const hudPortal: Action<HTMLElement> = (node) => {
		const hud = ensureHudRoot();
		hud.appendChild(node);

		let destroyed = false;
		let mo: MutationObserver | undefined;

		const keepParented = () => {
			if (destroyed) return;
			const h = ensureHudRoot();
			if (node.parentElement !== h) {
				h.appendChild(node);
				if (ready) applyPosition(left, top);
			}
		};

		mo = new MutationObserver(keepParented);
		mo.observe(document.body, { childList: true, subtree: true });

		const onResize = () => {
			if (!ready || !root) return;
			moveTo(left, top);
		};
		window.addEventListener('resize', onResize);

		void (async () => {
			await tick();
			if (destroyed) return;
			placeInitial();
		})();

		return {
			destroy() {
				destroyed = true;
				window.removeEventListener('resize', onResize);
				mo?.disconnect();
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

	$effect(() => {
		if (!root || !ready) return;
		void dragging;
		applyPosition(left, top);
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
	.viewport-drag {
		position: fixed;
		width: max-content;
		max-width: 100vw;
		cursor: grab;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		z-index: 100000;
		pointer-events: auto;
		transform: none;
		filter: none;
	}

	.viewport-drag.is-dragging {
		cursor: grabbing;
	}
</style>
