<script lang="ts">
	import { onMount } from 'svelte';
	import type { Bias, ConfluenceBand } from '$lib/data/types';
	import {
		loadScenePosition,
		saveScenePosition,
		type ScenePosition
	} from '$lib/persist/scenePositions';

	let {
		bias = 'FLAT',
		confluenceBand = 'weak',
		tick = 0,
		sceneFrame
	}: {
		bias?: Bias;
		confluenceBand?: ConfluenceBand;
		tick?: number;
		sceneFrame?: HTMLElement;
	} = $props();

	const STORAGE_KEY = 'phf-pet-pos';
	const DRAG_THRESHOLD = 5;

	let root = $state<HTMLDivElement>();
	let left = $state(0);
	let top = $state(0);
	let ready = $state(false);
	let placed = $state(false);
	let storageReady = $state(false);
	let savedPosition = $state<ScenePosition | null>(null);
	let dragging = $state(false);
	let activePointer: number | null = null;
	let offsetX = 0;
	let offsetY = 0;
	let startX = 0;
	let startY = 0;

	const tradeable = $derived(confluenceBand === 'tradeable' || confluenceBand === 'high');
	const mode = $derived.by(() => {
		void tick;
		if (bias === 'LONG' && tradeable) return 'bull' as const;
		if (bias === 'SHORT' && tradeable) return 'bear' as const;
		if (bias === 'FLAT') return 'sleep' as const;
		return 'hide' as const;
	});

	onMount(() => {
		savedPosition = loadScenePosition(STORAGE_KEY);
		storageReady = true;
	});

	function frameScale() {
		if (!sceneFrame) return { x: 1, y: 1 };
		const rect = sceneFrame.getBoundingClientRect();
		return {
			x: rect.width > 0 ? sceneFrame.clientWidth / rect.width : 1,
			y: rect.height > 0 ? sceneFrame.clientHeight / rect.height : 1
		};
	}

	function clampPosition(nextLeft: number, nextTop: number): ScenePosition {
		if (!sceneFrame || !root) return { left: nextLeft, top: nextTop };
		return {
			left: Math.min(Math.max(0, nextLeft), Math.max(0, sceneFrame.clientWidth - root.offsetWidth)),
			top: Math.min(Math.max(0, nextTop), Math.max(0, sceneFrame.clientHeight - root.offsetHeight))
		};
	}

	function setPosition(nextLeft: number, nextTop: number) {
		const next = clampPosition(nextLeft, nextTop);
		left = next.left;
		top = next.top;
	}

	function defaultPosition(): ScenePosition {
		if (!sceneFrame || !root) return { left: 10, top: 10 };
		const floor = sceneFrame.querySelector('.office-floor');
		if (!floor) return { left: 10, top: 10 };
		const frameRect = sceneFrame.getBoundingClientRect();
		const floorRect = floor.getBoundingClientRect();
		const scale = frameScale();
		return {
			left: (floorRect.right - frameRect.left) * scale.x - root.offsetWidth - 96,
			top: (floorRect.bottom - frameRect.top) * scale.y - root.offsetHeight - 14
		};
	}

	function place() {
		if (!sceneFrame || !root || placed) return;
		const fallback = defaultPosition();
		setPosition(savedPosition?.left ?? fallback.left, savedPosition?.top ?? fallback.top);
		placed = true;
		ready = true;
	}

	function reflow() {
		if (!ready || !root) return;
		setPosition(left, top);
	}

	$effect(() => {
		if (!storageReady || !sceneFrame || !root) return;
		const node = root;
		requestAnimationFrame(() => {
			if (!sceneFrame || root !== node) return;
			if (!placed) place();
			else setPosition(left, top);
		});
	});

	// Remount after hide mode: keep prior coords, just ensure clamp + visibility.
	$effect(() => {
		if (!root || !placed) return;
		ready = true;
	});

	function onPointerDown(event: PointerEvent) {
		if (!root || activePointer !== null) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		const rect = root.getBoundingClientRect();
		const scale = frameScale();
		startX = event.clientX;
		startY = event.clientY;
		offsetX = (event.clientX - rect.left) * scale.x;
		offsetY = (event.clientY - rect.top) * scale.y;
		activePointer = event.pointerId;
		dragging = false;
	}

	function onPointerMove(event: PointerEvent) {
		if (activePointer !== event.pointerId || !sceneFrame) return;
		if (!dragging && Math.hypot(event.clientX - startX, event.clientY - startY) < DRAG_THRESHOLD) return;
		if (!dragging) {
			dragging = true;
			root?.setPointerCapture(event.pointerId);
		}
		event.preventDefault();
		const frameRect = sceneFrame.getBoundingClientRect();
		const scale = frameScale();
		setPosition(
			(event.clientX - frameRect.left) * scale.x - offsetX,
			(event.clientY - frameRect.top) * scale.y - offsetY
		);
	}

	function finishPointer(event: PointerEvent) {
		if (activePointer !== event.pointerId) return;
		if (!root) {
			activePointer = null;
			dragging = false;
			return;
		}
		if (dragging) {
			saveScenePosition(STORAGE_KEY, { left, top });
			event.preventDefault();
		}
		dragging = false;
		activePointer = null;
		if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
	}
</script>

<svelte:window onresize={reflow} onpointerup={finishPointer} onpointercancel={finishPointer} />

{#if mode !== 'hide'}
	<div
		bind:this={root}
		class="floor-pet"
		class:is-dragging={dragging}
		style:left={`${left}px`}
		style:top={`${top}px`}
		style:visibility={ready ? 'visible' : 'hidden'}
		role="group"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={finishPointer}
		onpointercancel={finishPointer}
		onlostpointercapture={finishPointer}
		class:bull={mode === 'bull'}
		class:bear={mode === 'bear'}
		class:sleep={mode === 'sleep'}
		aria-label={mode === 'bull'
			? 'Mini bull pet — floor bias bullish'
			: mode === 'bear'
				? 'Bear cub pet — floor bias bearish'
				: 'Office pet sleeping — flat bias'}
		title={mode === 'bull' ? 'Bull pet' : mode === 'bear' ? 'Bear cub' : 'Sleeping (FLAT)'}
	>
		{#if mode === 'bull'}
			<svg viewBox="0 0 40 28" width="48" height="34" aria-hidden="true">
				<!-- mini bull -->
				<ellipse cx="20" cy="18" rx="12" ry="7" fill="#8b5a2b" />
				<rect x="8" y="12" width="18" height="10" rx="3" fill="#a06a35" />
				<circle cx="28" cy="12" r="6" fill="#8b5a2b" />
				<rect x="30" y="10" width="5" height="3" fill="#5a3a1a" />
				<polygon points="24,6 26,11 22,11" fill="#5a3a1a" />
				<polygon points="30,5 32,10 28,10" fill="#5a3a1a" />
				<circle cx="30" cy="11" r="1" fill="#1a1008" />
				<rect x="10" y="22" width="3" height="5" fill="#5a3a1a" />
				<rect x="16" y="22" width="3" height="5" fill="#5a3a1a" />
				<rect x="22" y="22" width="3" height="5" fill="#5a3a1a" />
				<rect x="27" y="21" width="3" height="5" fill="#5a3a1a" />
				<path d="M6 16 Q2 14 4 18" stroke="#5a3a1a" stroke-width="2" fill="none" />
			</svg>
			<span class="tag">BULL</span>
		{:else if mode === 'bear'}
			<svg viewBox="0 0 40 28" width="48" height="34" aria-hidden="true">
				<!-- bear cub -->
				<ellipse cx="18" cy="18" rx="11" ry="8" fill="#5c4030" />
				<circle cx="28" cy="14" r="7" fill="#6a4a38" />
				<circle cx="24" cy="8" r="3" fill="#5c4030" />
				<circle cx="32" cy="8" r="3" fill="#5c4030" />
				<circle cx="30" cy="13" r="1.2" fill="#1a1008" />
				<ellipse cx="33" cy="16" rx="2.5" ry="1.8" fill="#3a2818" />
				<rect x="10" y="22" width="3" height="5" fill="#3a2818" />
				<rect x="16" y="23" width="3" height="4" fill="#3a2818" />
				<rect x="21" y="22" width="3" height="5" fill="#3a2818" />
				<path d="M8 14 Q4 10 6 16" stroke="#3a2818" stroke-width="2" fill="none" />
			</svg>
			<span class="tag">BEAR</span>
		{:else}
			<svg viewBox="0 0 40 24" width="44" height="28" aria-hidden="true">
				<ellipse cx="20" cy="16" rx="12" ry="6" fill="#6a5a48" opacity="0.85" />
				<circle cx="28" cy="12" r="5" fill="#7a6a58" />
				<circle cx="26" cy="11" r="0.8" fill="#1a1008" />
				<text x="8" y="10" font-size="6" fill="#c9b07a">z</text>
				<text x="12" y="6" font-size="5" fill="#c9b07a">z</text>
			</svg>
			<span class="tag dim">ZZZ</span>
		{/if}
	</div>
{/if}

<style>
	.floor-pet {
		position: absolute;
		z-index: 12;
		touch-action: none;
		user-select: none;
		cursor: grab;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		image-rendering: pixelated;
		pointer-events: auto;
		animation: pet-bob 1.6s ease-in-out infinite;
	}
	.floor-pet :global(svg) {
		pointer-events: none;
	}
	.floor-pet.sleep {
		animation: none;
		opacity: 0.75;
	}
	.floor-pet.is-dragging {
		cursor: grabbing;
		z-index: 60;
	}
	.floor-pet.bull .tag {
		color: #72d99a;
	}
	.floor-pet.bear .tag {
		color: #ed6c59;
	}
	.tag {
		font: 6px/1 var(--mono, monospace);
		letter-spacing: 0.1em;
		background: #1a1512;
		border: 1px solid #5a4030;
		padding: 1px 4px;
		color: #efc66f;
	}
	.tag.dim {
		color: #9d886f;
	}
	@keyframes pet-bob {
		50% {
			transform: translateY(-3px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.floor-pet {
			animation: none !important;
		}
	}
</style>
