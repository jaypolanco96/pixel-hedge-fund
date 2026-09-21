<script lang="ts">
	import { onMount } from 'svelte';
	import type { Bar, QuoteResponse, SignalResponse } from '$lib/data/types';
	import {
		FAX_REPORTS,
		buildFaxReport,
		faxHtmlDocument,
		type FaxReportId
	} from '$lib/reports/faxReports';
	import {
		loadScenePosition,
		saveScenePosition,
		type ScenePosition
	} from '$lib/persist/scenePositions';

	let {
		signal = null,
		quote = null,
		bars = [],
		displaySymbol = 'SOLUSDT',
		decimals = 4,
		sceneFrame
	}: {
		signal?: SignalResponse | null;
		quote?: QuoteResponse | null;
		bars?: Bar[];
		displaySymbol?: string;
		decimals?: number;
		sceneFrame?: HTMLElement;
	} = $props();

	const STORAGE_KEY = 'phf-fax-pos';
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
	let printing = $state(false);
	let spitText = $state('');
	let spitTitle = $state('');
	let spitSample = $state(false);
	let spitVisible = $state(false);

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
			left: (floorRect.left - frameRect.left) * scale.x + 10,
			top: (floorRect.bottom - frameRect.top) * scale.y - root.offsetHeight - 8
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

	function toggle() {
		open = !open;
		if (!open) spitVisible = false;
	}

	function handleMachineClick(event: MouseEvent) {
		if (suppressClick) {
			suppressClick = false;
			event.preventDefault();
			return;
		}
		toggle();
	}

	function printReport(id: FaxReportId) {
		const report = buildFaxReport(id, { signal, quote, bars, displaySymbol, decimals });
		spitTitle = report.title;
		spitText = report.body;
		spitSample = report.sample;
		printing = true;
		spitVisible = true;
		window.setTimeout(() => {
			printing = false;
		}, 900);
	}

	function downloadTxt() {
		if (!spitText) return;
		const blob = new Blob([spitText], { type: 'text/plain;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `phf-fax-${displaySymbol.toLowerCase()}-${Date.now()}.txt`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function openPrintable() {
		if (!spitText) return;
		const html = faxHtmlDocument(spitTitle, spitText, spitSample);
		const w = window.open('', '_blank', 'noopener,noreferrer,width=720,height=900');
		if (!w) return;
		w.document.write(html);
		w.document.close();
	}

	function onPointerDown(event: PointerEvent) {
		if (!root || activePointer !== null) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		const target = event.target;
		if (target instanceof HTMLElement && target.closest('.fax-panel')) return;
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
	class="fax-wrap"
	class:is-dragging={dragging}
	style:z-index={open ? 300010 : 12}
	style:left={`${left}px`}
	style:top={`${top}px`}
	style:visibility={ready ? 'visible' : 'hidden'}
	role="group"
	aria-label="Draggable office fax printer"
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={finishPointer}
	onpointercancel={finishPointer}
	onlostpointercapture={finishPointer}
>
	<button
		type="button"
		class="fax-machine"
		class:open
		class:printing
		aria-expanded={open}
		aria-label="Office fax printer - open print reports"
		onclick={handleMachineClick}
	>
		<div class="fax-top">
			<span class="led" class:on={!!signal && !signal.sample}></span>
			<small>FAX</small>
		</div>
		<div class="fax-body">
			<div class="paper-slot"><i></i></div>
			<div class="fax-keys"><b></b><b></b><b></b></div>
			<div class="fax-display">{signal?.bias ?? '...'}</div>
		</div>
		<div class="fax-tray"></div>
		{#if printing}<div class="spit-anim" aria-hidden="true"></div>{/if}
	</button>

	{#if open}
		<div class="fax-panel" role="dialog" aria-label="Print report options">
			<header>
				<strong>PRINT REPORT</strong>
				<button type="button" class="close" onclick={() => (open = false)} aria-label="Close fax panel"
					>x</button
				>
			</header>
			<p class="hint">
				Chart Desk fax . {displaySymbol}
				{#if signal?.sample || quote?.sample || !signal}
					. <em>SAMPLE</em>
				{:else}
					. LIVE
				{/if}
			</p>
			<ul>
				{#each FAX_REPORTS as r (r.id)}
					<li>
						<button type="button" onclick={() => printReport(r.id)}>
							<span>{r.title}</span>
							<small>{r.blurb}</small>
						</button>
					</li>
				{/each}
			</ul>

			{#if spitVisible}
				<div class="fax-spit" class:sample={spitSample}>
					<div class="spit-head">
						<span>FAX OUTPUT</span>
						{#if spitSample}<b>SAMPLE</b>{/if}
					</div>
					<pre>{spitText}</pre>
					<div class="spit-actions">
						<button type="button" onclick={openPrintable}>Printable HTML</button>
						<button type="button" onclick={downloadTxt}>Download .txt</button>
						<button type="button" class="ghost" onclick={() => (spitVisible = false)}>Clear</button>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.fax-wrap {
		position: absolute;
		z-index: 12;
		width: 78px;
		touch-action: none;
		user-select: none;
	}
	.fax-machine {
		position: relative;
		width: 78px;
		height: 68px;
		padding: 0;
		border: 3px solid #3a2a1c;
		background: linear-gradient(180deg, #c4b89a 0%, #9a8e72 55%, #7a6e56 100%);
		box-shadow:
			3px 3px 0 rgba(20, 10, 5, 0.55),
			inset 1px 1px #ddd2b4;
		cursor: grab;
		image-rendering: pixelated;
		font-family: var(--mono, monospace);
	}
	.fax-machine:hover,
	.fax-machine.open {
		filter: brightness(1.08);
	}
	.fax-machine.printing {
		animation: fax-shake 0.12s steps(2) infinite;
	}
	.fax-wrap.is-dragging .fax-machine {
		cursor: grabbing;
	}
	@keyframes fax-shake {
		50% {
			transform: translateX(1px);
		}
	}
	.fax-top {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 4px;
		background: #2a2218;
		color: #d8b76c;
		font-size: 7px;
		letter-spacing: 0.1em;
	}
	.led {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #5a4030;
		box-shadow: inset 0 0 2px #000;
	}
	.led.on {
		background: #4adf7a;
		box-shadow: 0 0 4px #4adf7a;
	}
	.fax-body {
		position: relative;
		height: 40px;
		padding: 4px;
	}
	.paper-slot {
		height: 8px;
		background: #1a1510;
		border: 1px solid #4a3a28;
		margin-bottom: 4px;
	}
	.paper-slot i {
		display: block;
		height: 100%;
		width: 40%;
		background: #f0ead8;
		opacity: 0.85;
	}
	.fax-keys {
		display: flex;
		gap: 3px;
		margin-bottom: 3px;
	}
	.fax-keys b {
		width: 8px;
		height: 6px;
		background: #3a3428;
		border: 1px solid #1a1510;
	}
	.fax-display {
		font-size: 7px;
		color: #79dfa0;
		background: #0c100e;
		border: 1px solid #2a3a28;
		padding: 1px 3px;
		text-align: center;
	}
	.fax-tray {
		position: absolute;
		left: 6px;
		right: 6px;
		bottom: 2px;
		height: 6px;
		background: #5a4e3a;
		border: 1px solid #2a2218;
	}
	.spit-anim {
		position: absolute;
		left: 12px;
		bottom: 8px;
		width: 36px;
		height: 14px;
		background: #f5eedc;
		border: 1px solid #3a2a1c;
		animation: spit-out 0.9s steps(4) forwards;
		pointer-events: none;
	}
	@keyframes spit-out {
		from {
			transform: translateY(8px);
			opacity: 0;
		}
		to {
			transform: translateY(-18px);
			opacity: 1;
		}
	}

	.fax-panel {
		position: absolute;
		touch-action: auto;
		user-select: text;
		left: 0;
		bottom: 76px;
		width: min(320px, 78vw);
		max-height: 420px;
		overflow: auto;
		background: #1a1512;
		border: 3px solid #9c7040;
		box-shadow: 6px 6px 0 rgba(10, 5, 2, 0.65);
		color: #f0e4cf;
		z-index: 1;
		padding: 8px;
		font-family: var(--mono, monospace);
	}
	.fax-panel header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		color: #efc66f;
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
		margin: 0 0 8px;
		font-size: 7px;
		color: #9d886f;
	}
	.hint em {
		color: #ed6c59;
		font-style: normal;
		font-weight: 700;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	ul button {
		width: 100%;
		text-align: left;
		padding: 7px 8px;
		background: #241c16;
		border: 2px solid #5a4030;
		color: #f0e4cf;
		cursor: pointer;
		font-family: inherit;
	}
	ul button:hover {
		border-color: #d7ae63;
		background: #2e241c;
	}
	ul span {
		display: block;
		font-size: 8px;
		font-weight: 700;
		color: #efc66f;
	}
	ul small {
		display: block;
		margin-top: 3px;
		font-size: 6px;
		color: #9d886f;
		line-height: 1.3;
	}
	.fax-spit {
		margin-top: 8px;
		background: #f3ead4;
		color: #1e1610;
		border: 2px dashed #6a5038;
		padding: 6px;
	}
	.fax-spit.sample {
		border-color: #c45c4a;
	}
	.spit-head {
		display: flex;
		justify-content: space-between;
		font-size: 7px;
		font-weight: 700;
		margin-bottom: 4px;
		letter-spacing: 0.06em;
	}
	.spit-head b {
		color: #c45c4a;
	}
	.fax-spit pre {
		margin: 0;
		max-height: 160px;
		overflow: auto;
		font-size: 6px;
		line-height: 1.35;
		white-space: pre-wrap;
	}
	.spit-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 6px;
	}
	.spit-actions button {
		font: 7px var(--mono, monospace);
		padding: 4px 6px;
		background: #2a211d;
		color: #efc66f;
		border: 1px solid #6a5038;
		cursor: pointer;
	}
	.spit-actions button.ghost {
		background: transparent;
		color: #5a4030;
	}
	@media (max-width: 768px) {
		.fax-panel {
			width: min(300px, 88vw);
			max-height: 360px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.fax-machine.printing,
		.spit-anim {
			animation: none !important;
		}
	}
</style>
