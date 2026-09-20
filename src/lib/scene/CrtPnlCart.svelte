<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { exchangeFetch } from '$lib/client/exchangeHeaders';
	import type { TraderLeg } from '$lib/data/types';
	import type { BloFinBalanceResponse, BloFinPositionsResponse } from '$lib/data/blofinTypes';
	import type { BybitBalanceResponse, BybitPositionsResponse } from '$lib/data/bybitTypes';
	import {
		loadScenePosition,
		saveScenePosition,
		type ScenePosition
	} from '$lib/persist/scenePositions';

	let {
		legs = [],
		sceneFrame,
		compact = false,
		crtScanlines = false,
		reduceMotion = false
	}: {
		legs?: TraderLeg[];
		sceneFrame?: HTMLElement;
		compact?: boolean;
		crtScanlines?: boolean;
		reduceMotion?: boolean;
	} = $props();

	const STORAGE_KEY = 'phf-crt-cart-pos';
	const DRAG_THRESHOLD = 5;
	const POLL_MS = 12_000;

	type Page = 'both' | 'exchange' | 'floor';
	const PAGES: Page[] = ['both', 'exchange', 'floor'];

	let root = $state<HTMLDivElement>();
	let left = $state(40);
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

	let page = $state<Page>('both');

	let bfUpnl = $state<number | null>(null);
	let byUpnl = $state<number | null>(null);
	let equityUsdt = $state<number | null>(null);
	let bfLive = $state(false);
	let byLive = $state(false);
	let bfSample = $state(false);
	let bySample = $state(false);
	let networkNote = $state(false);
	let pollBusy = $state(false);
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	const floorUpnl = $derived(
		legs.reduce((sum, leg) => sum + (Number.isFinite(leg.unrealizedPnlUsd) ? leg.unrealizedPnlUsd : 0), 0)
	);
	const floorSample = $derived(legs.length === 0 || legs.some((l) => l.sample));

	function fmtSigned(n: number | null | undefined): string {
		if (n == null || !Number.isFinite(n)) return '—';
		const sign = n > 0 ? '+' : '';
		return `${sign}${n.toFixed(2)}`;
	}

	function fmtEq(n: number | null | undefined): string {
		if (n == null || !Number.isFinite(n)) return '—';
		return `~${n.toFixed(2)} USDT`;
	}

	const feedLabel = $derived.by(() => {
		if (networkNote) return 'NETWORK';
		const exchangeWanted = page !== 'floor';
		if (exchangeWanted && (bfLive || byLive) && !(bfSample || bySample)) return 'LIVE';
		if (exchangeWanted && (bfSample || bySample)) return 'SAMPLE';
		if (page === 'floor') return floorSample ? 'SAMPLE' : 'LIVE';
		return floorSample ? 'SAMPLE' : 'FLOOR';
	});

	const screenText = $derived.by(() => {
		if (page === 'floor') {
			return [
				`CRT · FLOOR [${feedLabel}]`,
				'BOOK uPNL',
				fmtSigned(floorUpnl),
				`legs ${legs.length}`
			].join('\n');
		}
		const lines = [
			`CRT · P&L  [${feedLabel}]`,
			`BF  uPNL  ${fmtSigned(bfUpnl)}`,
			`BY  uPNL  ${fmtSigned(byUpnl)}`
		];
		if (page === 'both') lines.push(`FLOOR     ${fmtSigned(floorUpnl)}`);
		lines.push(`EQ ${fmtEq(equityUsdt)}`);
		return lines.join('\n');
	});

	onMount(() => {
		savedPosition = loadScenePosition(STORAGE_KEY);
		storageReady = true;
		void refreshExchange();
		pollTimer = setInterval(() => {
			void refreshExchange();
		}, POLL_MS);
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
	});

	async function refreshExchange() {
		if (pollBusy) return;
		pollBusy = true;
		let nextBf: number | null = null;
		let nextBy: number | null = null;
		let nextEq: number | null = null;
		let nextBfLive = false;
		let nextByLive = false;
		let nextBfSample = false;
		let nextBySample = false;
		let nextNetwork = false;
		let bfConfigured = false;
		let byConfigured = false;

		try {
			const [pBf, bBf, pBy, bBy] = await Promise.all([
				exchangeFetch('/api/blofin/positions'),
				exchangeFetch('/api/blofin/balance'),
				exchangeFetch('/api/bybit/positions'),
				exchangeFetch('/api/bybit/balance')
			]);

			if (pBf.status === 403) nextNetwork = true;
			if (pBf.ok || pBf.status === 503) {
				const p = (await pBf.json()) as BloFinPositionsResponse;
				if (p.sample || p.fromSnapshot) nextBfSample = true;
				if (p.ok) {
					bfConfigured = true;
					nextBf = (p.positions ?? []).reduce(
						(s, row) => s + (Number.isFinite(row.unrealizedPnl) ? row.unrealizedPnl : 0),
						0
					);
					nextBfLive = !(p.sample || p.fromSnapshot);
				} else if (p.error && /403|network|block|cloudfront|country/i.test(p.error)) {
					nextNetwork = true;
				}
			}
			if (bBf.ok || bBf.status === 503) {
				const b = (await bBf.json()) as BloFinBalanceResponse;
				if (b.ok && b.totalEquityUsd != null && Number.isFinite(b.totalEquityUsd)) {
					nextEq = b.totalEquityUsd;
				}
			}

			if (pBy.status === 403) nextNetwork = true;
			if (pBy.ok || pBy.status === 503) {
				const p = (await pBy.json()) as BybitPositionsResponse;
				if (p.sample) nextBySample = true;
				if (p.note) nextNetwork = true;
				if (p.configured) byConfigured = true;
				if (p.ok) {
					byConfigured = true;
					nextBy = (p.positions ?? []).reduce(
						(s, row) => s + (Number.isFinite(row.unrealisedPnl) ? row.unrealisedPnl : 0),
						0
					);
					nextByLive = !p.sample;
				} else if (p.error && /403|network|block/i.test(p.error)) {
					nextNetwork = true;
				}
			}
			if ((bBy.ok || bBy.status === 503) && nextEq == null) {
				const b = (await bBy.json()) as BybitBalanceResponse;
				if (b.ok && b.totalEquityUsd != null && Number.isFinite(b.totalEquityUsd)) {
					nextEq = b.totalEquityUsd;
				}
			}

			// Keep dash when venue not configured / no usable book — never invent numbers.
			if (!bfConfigured) nextBf = null;
			if (!byConfigured) nextBy = null;
		} catch {
			nextNetwork = true;
		} finally {
			bfUpnl = nextBf;
			byUpnl = nextBy;
			equityUsdt = nextEq;
			bfLive = nextBfLive;
			byLive = nextByLive;
			bfSample = nextBfSample;
			bySample = nextBySample;
			networkNote = nextNetwork;
			pollBusy = false;
		}
	}


	function cyclePage() {
		const i = PAGES.indexOf(page);
		page = PAGES[(i + 1) % PAGES.length];
	}

	function handleClick(event: MouseEvent) {
		if (suppressClick) {
			suppressClick = false;
			event.preventDefault();
			return;
		}
		cyclePage();
	}

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

	/** Park left of lounge / near risk aisle — floor prop, not on trader desks. */
	function defaultPosition(): ScenePosition {
		if (!sceneFrame || !root) return { left: 220, top: 280 };
		const frameRect = sceneFrame.getBoundingClientRect();
		const scale = frameScale();
		const lounge = sceneFrame.querySelector('.lounge');
		if (lounge) {
			const loungeRect = lounge.getBoundingClientRect();
			return {
				left: (loungeRect.left - frameRect.left) * scale.x - root.offsetWidth - 10,
				top: (loungeRect.bottom - frameRect.top) * scale.y - root.offsetHeight - 4
			};
		}
		const aisle = sceneFrame.querySelector('.aisle');
		if (aisle) {
			const aisleRect = aisle.getBoundingClientRect();
			return {
				left: (aisleRect.left - frameRect.left) * scale.x - root.offsetWidth / 2,
				top: (aisleRect.bottom - frameRect.top) * scale.y - root.offsetHeight + 8
			};
		}
		const floor = sceneFrame.querySelector('.office-floor');
		if (!floor) return { left: 220, top: 280 };
		const floorRect = floor.getBoundingClientRect();
		return {
			left: (floorRect.left - frameRect.left) * scale.x + floorRect.width * scale.x * 0.38,
			top: (floorRect.bottom - frameRect.top) * scale.y - root.offsetHeight - 10
		};
	}

	function place() {
		if (!sceneFrame || !root || placed === true) return;
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
		if (!storageReady || !sceneFrame || !root || placed) return;
		requestAnimationFrame(place);
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
	class="crt-cart-wrap"
	class:is-dragging={dragging}
	class:compact
	style:left={`${left}px`}
	style:top={`${top}px`}
	style:visibility={ready ? 'visible' : 'hidden'}
	role="group"
	aria-label="Draggable CRT TV on rolling cart — P&L readout"
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={finishPointer}
	onpointercancel={finishPointer}
	onlostpointercapture={finishPointer}
>
	<button
		type="button"
		class="crt-cart"
		aria-label="CRT P&L cart — click to cycle pages, drag to move"
		title="CRT · P&L — click cycles EXCHANGE / FLOOR / BOTH"
		onclick={handleClick}
	>
		<!-- CRT beige monitor -->
		<div class="crt-monitor">
			<div class="crt-bezel">
				<div
					class="crt-screen"
					class:scan={crtScanlines && !reduceMotion}
					class:dim-scan={crtScanlines && reduceMotion}
				>
					<pre class="crt-text">{screenText}</pre>
				</div>
			</div>
			<div class="crt-knobs"><i></i><i></i></div>
			<div class="crt-vent"></div>
		</div>
		<!-- Metal AV cart stand -->
		<div class="cart-stand">
			<div class="cart-shelf top-shelf"></div>
			<div class="cart-legs">
				<span class="leg l"></span>
				<span class="leg r"></span>
				<span class="cross"></span>
			</div>
			<div class="cart-shelf bottom-shelf"></div>
			<div class="cart-wheels">
				<b class="w fl"></b>
				<b class="w fr"></b>
				<b class="w bl"></b>
				<b class="w br"></b>
			</div>
		</div>
		<span class="cart-tag">AV</span>
	</button>
</div>

<style>
	.crt-cart-wrap {
		position: absolute;
		z-index: 13;
		width: 72px;
		touch-action: none;
		user-select: none;
		image-rendering: pixelated;
	}
	.crt-cart-wrap.compact {
		transform: scale(0.88);
		transform-origin: bottom left;
	}
	.crt-cart-wrap.is-dragging {
		z-index: 40;
	}
	.crt-cart {
		display: block;
		width: 72px;
		padding: 0;
		border: none;
		background: transparent;
		cursor: grab;
		font-family: var(--mono, 'Courier New', monospace);
		color: inherit;
	}
	.crt-cart-wrap.is-dragging .crt-cart {
		cursor: grabbing;
	}
	.crt-cart:hover .crt-bezel,
	.crt-cart:focus-visible .crt-bezel {
		filter: brightness(1.06);
	}

	.crt-monitor {
		position: relative;
		width: 68px;
		margin: 0 auto;
		background: linear-gradient(180deg, #c9b896 0%, #a89870 55%, #8a7a58 100%);
		border: 3px solid #4a3e2a;
		box-shadow:
			2px 2px 0 rgba(20, 10, 5, 0.5),
			inset 1px 1px #ddd2b0;
	}
	.crt-bezel {
		padding: 5px 5px 4px;
		background: #3a3428;
		border-bottom: 2px solid #2a2418;
	}
	.crt-screen {
		position: relative;
		height: 54px;
		background: #020804;
		border: 2px solid #1a2818;
		box-shadow: inset 0 0 8px rgba(40, 180, 80, 0.25);
		overflow: hidden;
	}
	.crt-screen.scan::after {
		content: '';
		pointer-events: none;
		position: absolute;
		inset: 0;
		background: repeating-linear-gradient(
			180deg,
			transparent 0 2px,
			rgba(0, 0, 0, 0.28) 2px 3px
		);
		animation: crt-flicker 2.4s steps(2) infinite;
	}
	.crt-screen.dim-scan::after {
		content: '';
		pointer-events: none;
		position: absolute;
		inset: 0;
		background: repeating-linear-gradient(
			180deg,
			transparent 0 2px,
			rgba(0, 0, 0, 0.18) 2px 3px
		);
	}
	@keyframes crt-flicker {
		50% {
			opacity: 0.85;
		}
	}
	.crt-text {
		margin: 0;
		padding: 3px 3px 2px;
		font-size: 5.5px;
		line-height: 1.35;
		letter-spacing: 0.02em;
		color: #5dff8a;
		text-shadow: 0 0 3px rgba(60, 255, 120, 0.55);
		white-space: pre;
		overflow: hidden;
	}
	.crt-knobs {
		display: flex;
		justify-content: flex-end;
		gap: 4px;
		padding: 2px 4px 3px;
		background: #9a8a68;
	}
	.crt-knobs i {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #3a3428;
		border: 1px solid #1a1510;
		box-shadow: inset 1px 1px #6a6050;
	}
	.crt-vent {
		height: 4px;
		background: repeating-linear-gradient(
			90deg,
			#6a5e48 0 2px,
			#8a7a58 2px 4px
		);
		border-top: 1px solid #4a3e2a;
	}

	.cart-stand {
		position: relative;
		width: 56px;
		margin: 0 auto;
		height: 42px;
	}
	.cart-shelf {
		position: absolute;
		left: 0;
		right: 0;
		height: 5px;
		background: linear-gradient(180deg, #8a9098 0%, #5a6068 100%);
		border: 2px solid #2a2e32;
		box-shadow: inset 1px 1px #b0b6bc;
	}
	.top-shelf {
		top: 0;
	}
	.bottom-shelf {
		bottom: 8px;
	}
	.cart-legs {
		position: absolute;
		left: 6px;
		right: 6px;
		top: 4px;
		bottom: 10px;
	}
	.cart-legs .leg {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 3px;
		background: #6a7078;
		border: 1px solid #2a2e32;
	}
	.cart-legs .leg.l {
		left: 0;
	}
	.cart-legs .leg.r {
		right: 0;
	}
	.cart-legs .cross {
		position: absolute;
		left: 2px;
		right: 2px;
		top: 50%;
		height: 2px;
		background: #4a5058;
		border: 1px solid #2a2e32;
		transform: translateY(-50%) skewX(-18deg);
	}
	.cart-wheels {
		position: absolute;
		left: -2px;
		right: -2px;
		bottom: 0;
		height: 8px;
	}
	.cart-wheels .w {
		position: absolute;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #2a2e32;
		border: 1px solid #0a0c0e;
		box-shadow: inset 1px 1px #5a6068;
	}
	.cart-wheels .fl {
		left: 2px;
		bottom: 0;
	}
	.cart-wheels .fr {
		right: 2px;
		bottom: 0;
	}
	.cart-wheels .bl {
		left: 10px;
		bottom: 1px;
		width: 6px;
		height: 6px;
		opacity: 0.7;
	}
	.cart-wheels .br {
		right: 10px;
		bottom: 1px;
		width: 6px;
		height: 6px;
		opacity: 0.7;
	}
	.cart-tag {
		display: block;
		margin-top: 1px;
		text-align: center;
		font-size: 6px;
		letter-spacing: 0.12em;
		color: #9b7657;
		text-shadow: 1px 1px #1a1008;
	}
</style>
