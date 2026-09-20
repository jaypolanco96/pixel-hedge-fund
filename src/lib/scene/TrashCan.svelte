<script lang="ts">
	import { onMount } from 'svelte';
	import type { QuoteResponse, SignalResponse } from '$lib/data/types';
	import { buildTrashReport } from '$lib/reports/trashReports';
	import {
		loadScenePosition,
		saveScenePosition,
		type ScenePosition
	} from '$lib/persist/scenePositions';

	let {
		signal = null,
		quote = null,
		displaySymbol = 'SOLUSDT',
		decimals = 4,
		sceneFrame
	}: {
		signal?: SignalResponse | null;
		quote?: QuoteResponse | null;
		displaySymbol?: string;
		decimals?: number;
		sceneFrame?: HTMLElement;
	} = $props();

	const STORAGE_KEY = 'phf-trash-pos';
	const DRAG_THRESHOLD = 5;

	let root = $state<HTMLDivElement>();
	let left = $state(10);
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
	let suppressClick = false;

	let open = $state(false);
	let reportTitle = $state('');
	let reportBody = $state('');
	let reportSample = $state(false);
	let reportLabel = $state('');

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
		if (!sceneFrame || !root) return { left: 120, top: 10 };
		const floor = sceneFrame.querySelector('.office-floor');
		if (!floor) return { left: 120, top: 10 };
		const frameRect = sceneFrame.getBoundingClientRect();
		const floorRect = floor.getBoundingClientRect();
		const scale = frameScale();
		return {
			left: (floorRect.left - frameRect.left) * scale.x + 96,
			top: (floorRect.bottom - frameRect.top) * scale.y - root.offsetHeight - 10
		};
	}

	function place() {
		if (!sceneFrame || !root || placed === true) return;
		setPosition(savedPosition?.left ?? defaultPosition().left, savedPosition?.top ?? defaultPosition().top);
		placed = true;
		ready = true;
	}

	function reflow() {
		if (!ready || !root) return;
		setPosition(left, top);
	}

	$effect(() => {
		if (!storageReady || !sceneFrame || !root || placed) return;
		requestAnimationFrame(place);
	});

	function openReport() {
		const report = buildTrashReport({ signal, quote, displaySymbol, decimals });
		reportTitle = report.title;
		reportBody = report.body;
		reportSample = report.sample;
		reportLabel = report.thesisLabel;
		open = true;
	}

	function handleCanClick(event: MouseEvent) {
		if (suppressClick) {
			suppressClick = false;
			event.preventDefault();
			return;
		}
		if (open) open = false;
		else openReport();
	}

	function onPointerDown(event: PointerEvent) {
		if (!root || activePointer !== null) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		const target = event.target;
		if (target instanceof HTMLElement && target.closest('.trash-panel')) return;
		const rect = root.getBoundingClientRect();
		const scale = frameScale();
		startX = event.clientX;
		startY = event.clientY;
		offsetX = (event.clientX - rect.left) * scale.x;
		offsetY = (event.clientY - rect.top) * scale.y;
		activePointer = event.pointerId;
		dragging = false;
		suppressClick = false;
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
		if (!root || activePointer !== event.pointerId) return;
		if (dragging) {
			suppressClick = true;
			saveScenePosition(STORAGE_KEY, { left, top });
			event.preventDefault();
		}
		dragging = false;
		activePointer = null;
		if (root.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId);
	}
</script>

<svelte:window onresize={reflow} onpointerup={finishPointer} onpointercancel={finishPointer} />

<div
	bind:this={root}
	class="trash-wrap"
	class:is-dragging={dragging}
	style:left={`${left}px`}
	style:top={`${top}px`}
	style:visibility={ready ? 'visible' : 'hidden'}
	role="group"
	aria-label="Draggable office trash can"
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={finishPointer}
	onpointercancel={finishPointer}
	onlostpointercapture={finishPointer}
>
	<button
		type="button"
		class="trash-can"
		class:open
		aria-expanded={open}
		aria-label="Office trash can — open busted thesis report"
		onclick={handleCanClick}
	>
		<svg viewBox="0 0 40 48" width="40" height="48" aria-hidden="true">
			<!-- lid -->
			<rect x="6" y="6" width="28" height="5" rx="1" fill="#5a5048" stroke="#2a2218" stroke-width="1" />
			<rect x="14" y="3" width="12" height="4" rx="1" fill="#6a6058" stroke="#2a2218" stroke-width="1" />
			<!-- body -->
			<path
				d="M8 12 L10 44 H30 L32 12 Z"
				fill="#4a6b4a"
				stroke="#1a2818"
				stroke-width="1.5"
			/>
			<!-- rivets / ribs -->
			<line x1="14" y1="16" x2="13" y2="40" stroke="#2a3a28" stroke-width="1.5" />
			<line x1="20" y1="16" x2="20" y2="40" stroke="#2a3a28" stroke-width="1.5" />
			<line x1="26" y1="16" x2="27" y2="40" stroke="#2a3a28" stroke-width="1.5" />
			<!-- crumpled paper peek -->
			<path d="M16 18 L19 22 L15 24 L20 28" stroke="#e8dcc0" stroke-width="1.5" fill="none" />
		</svg>
		<span class="tag">BIN</span>
	</button>

	{#if open}
		<div class="trash-panel" role="dialog" aria-label="Busted thesis report">
			<header>
				<strong>BUSTED THESIS</strong>
				<button type="button" class="close" onclick={() => (open = false)} aria-label="Close trash report"
					>×</button
				>
			</header>
			<p class="hint">
				Discarded research · {displaySymbol}
				{#if reportLabel}<span class="pill">{reportLabel}</span>{/if}
				{#if reportSample}
					· <em>SAMPLE</em>
				{:else}
					· LIVE CONTEXT
				{/if}
			</p>
			<p class="sub">{reportTitle} — crumpled note from the pit (narrative, not a P&amp;L ticket).</p>
			<pre class:sample={reportSample}>{reportBody}</pre>
			<div class="actions">
				<button type="button" class="ghost" onclick={() => (open = false)}>Stuff back in</button>
				<button type="button" onclick={openReport}>Re-fish scrap</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.trash-wrap {
		position: absolute;
		z-index: 12;
		width: 48px;
		touch-action: none;
		user-select: none;
		pointer-events: auto;
	}
	.trash-can {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		width: 48px;
		padding: 0;
		border: none;
		background: transparent;
		cursor: grab;
		image-rendering: pixelated;
		font-family: var(--mono, monospace);
	}
	.trash-can:hover,
	.trash-can.open {
		filter: brightness(1.1);
	}
	.trash-wrap.is-dragging .trash-can {
		cursor: grabbing;
	}
	.tag {
		font: 6px/1 var(--mono, monospace);
		letter-spacing: 0.1em;
		background: #1a1512;
		border: 1px solid #5a4030;
		padding: 1px 4px;
		color: #9dba8a;
	}
	.trash-panel {
		position: absolute;
		touch-action: auto;
		user-select: text;
		left: 0;
		bottom: 64px;
		width: min(340px, 82vw);
		max-height: 440px;
		overflow: auto;
		background: #1a1512;
		border: 3px solid #6a7a5a;
		box-shadow: 6px 6px 0 rgba(10, 5, 2, 0.65);
		color: #e8dcc0;
		z-index: 40;
		padding: 8px;
		font-family: var(--mono, monospace);
		transform: rotate(-0.6deg);
	}
	.trash-panel header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		color: #c9b07a;
		font-size: 10px;
		letter-spacing: 0.08em;
		margin-bottom: 4px;
	}
	.close {
		background: transparent;
		border: none;
		color: #c9a878;
		font-size: 16px;
		cursor: pointer;
		line-height: 1;
	}
	.hint {
		margin: 0 0 4px;
		font-size: 8px;
		color: #9d886f;
	}
	.hint em {
		color: #ed6c59;
		font-style: normal;
	}
	.pill {
		display: inline-block;
		margin-left: 4px;
		padding: 0 4px;
		border: 1px solid #5a4030;
		background: #2a2218;
		color: #ed6c59;
		font-size: 7px;
		letter-spacing: 0.06em;
	}
	.sub {
		margin: 0 0 6px;
		font-size: 7px;
		color: #ab8e64;
		line-height: 1.35;
	}
	pre {
		margin: 0;
		padding: 8px;
		background: #12100e;
		border: 1px dashed #5a5040;
		color: #d4c4a0;
		font-size: 8px;
		line-height: 1.4;
		white-space: pre-wrap;
		word-break: break-word;
		max-height: 280px;
		overflow: auto;
	}
	pre.sample {
		border-color: #8a5040;
	}
	.actions {
		display: flex;
		gap: 6px;
		margin-top: 8px;
		justify-content: flex-end;
	}
	.actions button {
		font: 8px/1 var(--mono, monospace);
		padding: 5px 8px;
		border: 2px solid #5a4030;
		background: #3a2a1c;
		color: #efc66f;
		cursor: pointer;
	}
	.actions button.ghost {
		background: transparent;
		color: #9d886f;
	}
	.actions button:hover {
		filter: brightness(1.12);
	}
</style>
