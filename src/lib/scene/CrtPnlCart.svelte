<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { exchangeFetch } from '$lib/client/exchangeHeaders';
	import { TRADERS } from '$lib/characters/cast';
	import type { TraderLeg } from '$lib/data/types';
	import type {
		BloFinBalanceResponse,
		BloFinPosition,
		BloFinPositionsResponse
	} from '$lib/data/blofinTypes';
	import type {
		BybitBalanceResponse,
		BybitPosition,
		BybitPositionsResponse
	} from '$lib/data/bybitTypes';
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
	let detailOpen = $state(false);

	let bfUpnl = $state<number | null>(null);
	let byUpnl = $state<number | null>(null);
	let equityUsdt = $state<number | null>(null);
	let bfAvailable = $state<number | null>(null);
	let byAvailable = $state<number | null>(null);
	let byEquity = $state<number | null>(null);
	let bfPositions = $state<BloFinPosition[]>([]);
	let byPositions = $state<BybitPosition[]>([]);
	let bfConfigured = $state(false);
	let byConfigured = $state(false);
	let bfLive = $state(false);
	let byLive = $state(false);
	let bfSample = $state(false);
	let bySample = $state(false);
	let networkNote = $state(false);
	let pollBusy = $state(false);
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let lastRefreshAt = $state<number | null>(null);

	const floorUpnl = $derived(
		legs.reduce((sum, leg) => sum + (Number.isFinite(leg.unrealizedPnlUsd) ? leg.unrealizedPnlUsd : 0), 0)
	);
	const floorSample = $derived(legs.length === 0 || legs.some((l) => l.sample));

	const traderName = (id: string) => TRADERS.find((t) => t.id === id)?.name ?? id;

	function fmtSigned(n: number | null | undefined): string {
		if (n == null || !Number.isFinite(n)) return '—';
		const sign = n > 0 ? '+' : '';
		return `${sign}${n.toFixed(2)}`;
	}

	function fmtEq(n: number | null | undefined): string {
		if (n == null || !Number.isFinite(n)) return '—';
		return `~${n.toFixed(2)} USDT`;
	}

	function fmtNum(n: number | null | undefined, d = 4): string {
		if (n == null || !Number.isFinite(n)) return '—';
		return n.toFixed(d);
	}

	function fmtPx(n: number | null | undefined): string {
		if (n == null || !Number.isFinite(n)) return '—';
		if (Math.abs(n) >= 1000) return n.toFixed(2);
		if (Math.abs(n) >= 1) return n.toFixed(4);
		return n.toFixed(6);
	}

	const feedLabel = $derived.by(() => {
		if (networkNote) return 'NETWORK';
		const exchangeWanted = page !== 'floor';
		if (exchangeWanted && (bfLive || byLive) && !(bfSample || bySample)) return 'LIVE';
		if (exchangeWanted && (bfSample || bySample)) return 'SAMPLE';
		if (page === 'floor') return floorSample ? 'SAMPLE' : 'LIVE';
		return floorSample ? 'SAMPLE' : 'FLOOR';
	});

	const detailStatus = $derived.by(() => {
		if (networkNote) return 'NETWORK';
		if ((bfLive || byLive) && !(bfSample || bySample) && !floorSample) return 'LIVE';
		if (bfSample || bySample || floorSample) return 'SAMPLE';
		if (bfLive || byLive) return 'LIVE';
		return 'SAMPLE';
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
		let nextBfAvail: number | null = null;
		let nextByAvail: number | null = null;
		let nextByEq: number | null = null;
		let nextBfPos: BloFinPosition[] = [];
		let nextByPos: BybitPosition[] = [];
		let nextBfLive = false;
		let nextByLive = false;
		let nextBfSample = false;
		let nextBySample = false;
		let nextNetwork = false;
		let nextBfConfigured = false;
		let nextByConfigured = false;

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
					nextBfConfigured = true;
					nextBfPos = p.positions ?? [];
					nextBf = nextBfPos.reduce(
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
				if (b.ok) {
					if (b.totalEquityUsd != null && Number.isFinite(b.totalEquityUsd)) {
						nextEq = b.totalEquityUsd;
					}
					const availSum = (b.details ?? []).reduce(
						(s, row) => s + (Number.isFinite(row.available) ? row.available : 0),
						0
					);
					if ((b.details ?? []).length) nextBfAvail = availSum;
				}
			}

			if (pBy.status === 403) nextNetwork = true;
			if (pBy.ok || pBy.status === 503) {
				const p = (await pBy.json()) as BybitPositionsResponse;
				if (p.sample) nextBySample = true;
				if (p.note) nextNetwork = true;
				if (p.configured) nextByConfigured = true;
				if (p.ok) {
					nextByConfigured = true;
					nextByPos = p.positions ?? [];
					nextBy = nextByPos.reduce(
						(s, row) => s + (Number.isFinite(row.unrealisedPnl) ? row.unrealisedPnl : 0),
						0
					);
					nextByLive = !p.sample;
				} else if (p.error && /403|network|block/i.test(p.error)) {
					nextNetwork = true;
				}
			}
			if (bBy.ok || bBy.status === 503) {
				const b = (await bBy.json()) as BybitBalanceResponse;
				if (b.ok) {
					if (b.totalEquityUsd != null && Number.isFinite(b.totalEquityUsd)) {
						nextByEq = b.totalEquityUsd;
						if (nextEq == null) nextEq = b.totalEquityUsd;
					}
					const availSum = (b.coins ?? []).reduce(
						(s, row) => s + (Number.isFinite(row.available) ? row.available : 0),
						0
					);
					if ((b.coins ?? []).length) nextByAvail = availSum;
				}
			}

			if (!nextBfConfigured) nextBf = null;
			if (!nextByConfigured) nextBy = null;
		} catch {
			nextNetwork = true;
		} finally {
			bfUpnl = nextBf;
			byUpnl = nextBy;
			equityUsdt = nextEq;
			bfAvailable = nextBfAvail;
			byAvailable = nextByAvail;
			byEquity = nextByEq;
			bfPositions = nextBfPos;
			byPositions = nextByPos;
			bfConfigured = nextBfConfigured;
			byConfigured = nextByConfigured;
			bfLive = nextBfLive;
			byLive = nextByLive;
			bfSample = nextBfSample;
			bySample = nextBySample;
			networkNote = nextNetwork;
			lastRefreshAt = Date.now();
			pollBusy = false;
		}
	}

	function cyclePage(event?: MouseEvent) {
		event?.stopPropagation();
		const i = PAGES.indexOf(page);
		page = PAGES[(i + 1) % PAGES.length];
	}

	function openDetail(event: MouseEvent) {
		if (suppressClick) {
			suppressClick = false;
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		event.stopPropagation();
		detailOpen = true;
	}

	function closeDetail() {
		detailOpen = false;
	}

	function onKey(e: KeyboardEvent) {
		if (!detailOpen) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			closeDetail();
		}
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

	function refreshAgo(): string {
		if (lastRefreshAt == null) return '—';
		const s = Math.max(0, Math.round((Date.now() - lastRefreshAt) / 1000));
		return `${s}s ago`;
	}
</script>

<svelte:window
	onresize={reflow}
	onpointerup={finishPointer}
	onpointercancel={finishPointer}
	onkeydown={onKey}
/>

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
	<div class="crt-cart">
		<!-- CRT beige monitor -->
		<div class="crt-monitor">
			<div class="crt-bezel">
				<button
					type="button"
					class="crt-screen"
					class:scan={crtScanlines && !reduceMotion}
					class:dim-scan={crtScanlines && reduceMotion}
					aria-label="Open CRT P&L detail screen"
					title="Click glass for detail · drag cart to move"
					onclick={openDetail}
				>
					<pre class="crt-text">{screenText}</pre>
					<span class="page-chip" role="presentation">{page.toUpperCase()}</span>
				</button>
			</div>
			<div class="crt-knobs">
				<button
					type="button"
					class="page-btn"
					aria-label="Cycle CRT page"
					title="Cycle BOTH / EXCHANGE / FLOOR"
					onclick={cyclePage}
				>
					PAGE
				</button>
				<i></i><i></i>
			</div>
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
	</div>
</div>

{#if detailOpen}
	<div class="backdrop" role="presentation" onclick={closeDetail}></div>
	<div class="detail" role="dialog" aria-modal="true" aria-label="CRT P&L detail">
		<header class="titlebar">
			<div class="leds">
				<i class:on={detailStatus === 'LIVE'}></i>
				<i class:sample={detailStatus === 'SAMPLE'}></i>
				<i class:net={detailStatus === 'NETWORK'}></i>
			</div>
			<strong>CRT · P&amp;L DETAIL · {detailStatus}</strong>
			<button type="button" class="refresh" onclick={() => void refreshExchange()} disabled={pollBusy}>
				{pollBusy ? '…' : '↻'}
			</button>
			<button type="button" class="x" onclick={closeDetail} aria-label="Close P&L detail">×</button>
		</header>

		<div class="body">
			<section class="venue">
				<h3>BLOFIN {#if bfConfigured}<span class="tag">{bfSample ? 'SAMPLE' : bfLive ? 'LIVE' : '—'}</span>{:else}<span class="tag muted">NO KEYS / DATA</span>{/if}</h3>
				{#if bfConfigured}
					<dl class="summary">
						<div><dt>Equity</dt><dd>{fmtEq(equityUsdt)}</dd></div>
						<div><dt>Available</dt><dd>{bfAvailable == null ? '—' : fmtNum(bfAvailable, 2)}</dd></div>
						<div><dt>Σ uPNL</dt><dd class={bfUpnl != null && bfUpnl >= 0 ? 'pos' : 'neg'}>{fmtSigned(bfUpnl)}</dd></div>
					</dl>
					{#if bfPositions.length === 0}
						<p class="empty">No open BloFin positions.</p>
					{:else}
						<table>
							<thead>
								<tr>
									<th>instId</th>
									<th>side</th>
									<th>size</th>
									<th>entry</th>
									<th>mark</th>
									<th>uPNL</th>
								</tr>
							</thead>
							<tbody>
								{#each bfPositions as p (p.positionId)}
									<tr>
										<td>{p.instId}</td>
										<td class={p.side}>{p.side}</td>
										<td>{fmtNum(p.size, 4)}</td>
										<td>{fmtPx(p.averagePrice)}</td>
										<td>{fmtPx(p.markPrice)}</td>
										<td class={p.unrealizedPnl >= 0 ? 'pos' : 'neg'}>{fmtSigned(p.unrealizedPnl)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				{:else}
					<p class="empty">BloFin keys/data not present — nothing to show.</p>
				{/if}
			</section>

			<section class="venue">
				<h3>BYBIT {#if byConfigured}<span class="tag">{bySample ? 'SAMPLE' : byLive ? 'LIVE' : '—'}</span>{:else}<span class="tag muted">NO KEYS / DATA</span>{/if}</h3>
				{#if byConfigured}
					<dl class="summary">
						<div><dt>Equity</dt><dd>{fmtEq(byEquity ?? equityUsdt)}</dd></div>
						<div><dt>Available</dt><dd>{byAvailable == null ? '—' : fmtNum(byAvailable, 2)}</dd></div>
						<div><dt>Σ uPNL</dt><dd class={byUpnl != null && byUpnl >= 0 ? 'pos' : 'neg'}>{fmtSigned(byUpnl)}</dd></div>
					</dl>
					{#if byPositions.length === 0}
						<p class="empty">No open Bybit positions.</p>
					{:else}
						<table>
							<thead>
								<tr>
									<th>symbol</th>
									<th>side</th>
									<th>size</th>
									<th>entry</th>
									<th>mark</th>
									<th>uPNL</th>
								</tr>
							</thead>
							<tbody>
								{#each byPositions as p (`${p.symbol}-${p.positionIdx}-${p.side}`)}
									<tr>
										<td>{p.symbol}</td>
										<td class={p.deskSide}>{p.deskSide !== 'flat' ? p.deskSide : p.side}</td>
										<td>{fmtNum(p.size, 4)}</td>
										<td>{fmtPx(p.avgPrice)}</td>
										<td>{fmtPx(p.markPrice)}</td>
										<td class={p.unrealisedPnl >= 0 ? 'pos' : 'neg'}>{fmtSigned(p.unrealisedPnl)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				{:else}
					<p class="empty">Bybit keys/data not present — nothing to show.</p>
				{/if}
			</section>

			<section class="venue">
				<h3>FLOOR BOOK <span class="tag">{floorSample ? 'SAMPLE' : 'LIVE'}</span></h3>
				<dl class="summary">
					<div><dt>Total uPNL</dt><dd class={floorUpnl >= 0 ? 'pos' : 'neg'}>{fmtSigned(floorUpnl)}</dd></div>
					<div><dt>Legs</dt><dd>{legs.length}</dd></div>
				</dl>
				{#if legs.length === 0}
					<p class="empty">No floor legs.</p>
				{:else}
					<table>
						<thead>
							<tr>
								<th>trader</th>
								<th>id</th>
								<th>side</th>
								<th>uPNL</th>
							</tr>
						</thead>
						<tbody>
							{#each legs as leg (leg.traderId)}
								<tr>
									<td>{traderName(leg.traderId)}</td>
									<td>{leg.traderId}</td>
									<td class={leg.side}>{leg.side}</td>
									<td class={leg.unrealizedPnlUsd >= 0 ? 'pos' : 'neg'}>{fmtSigned(leg.unrealizedPnlUsd)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</section>
		</div>

		<footer>
			Status {detailStatus} · poll ~12s · refreshed {refreshAgo()} · Esc / × / backdrop closes
		</footer>
	</div>
{/if}

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
	.crt-cart:focus-within .crt-bezel {
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
		display: block;
		width: 100%;
		height: 54px;
		padding: 0;
		margin: 0;
		background: #020804;
		border: 2px solid #1a2818;
		box-shadow: inset 0 0 8px rgba(40, 180, 80, 0.25);
		overflow: hidden;
		cursor: pointer;
		font: inherit;
		color: inherit;
		text-align: left;
	}
	.crt-screen:hover,
	.crt-screen:focus-visible {
		box-shadow:
			inset 0 0 10px rgba(60, 220, 100, 0.4),
			0 0 0 1px #5dff8a;
		outline: none;
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
	.page-chip {
		position: absolute;
		right: 2px;
		bottom: 2px;
		padding: 0 2px;
		font-size: 4.5px;
		letter-spacing: 0.04em;
		color: #1a2818;
		background: #5dff8a;
		opacity: 0.85;
		pointer-events: none;
	}
	.crt-knobs {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 3px;
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
	.page-btn {
		margin-right: auto;
		padding: 0 3px;
		height: 10px;
		border: 1px solid #1a1510;
		background: #5a5040;
		color: #ddd2b0;
		font-size: 5px;
		font-family: inherit;
		font-weight: 800;
		letter-spacing: 0.06em;
		cursor: pointer;
		line-height: 1;
	}
	.page-btn:hover,
	.page-btn:focus-visible {
		background: #7a6a50;
		color: #fff8e0;
		outline: none;
	}
	.crt-vent {
		height: 4px;
		background: repeating-linear-gradient(90deg, #6a5e48 0 2px, #8a7a58 2px 4px);
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

	/* Detail modal */
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 200000;
		background: rgba(4, 10, 6, 0.72);
	}
	.detail {
		position: fixed;
		z-index: 200001;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(560px, calc(100vw - 20px));
		max-height: min(780px, calc(100vh - 20px));
		display: flex;
		flex-direction: column;
		background: #061208;
		color: #9fe0a8;
		border: 4px solid #2a5a34;
		box-shadow:
			0 0 0 2px #0a1a0c,
			10px 10px 0 rgba(0, 0, 0, 0.55),
			inset 0 0 50px rgba(80, 255, 120, 0.05);
		font-family: var(--mono, 'Courier New', monospace);
		image-rendering: auto;
	}
	.titlebar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		background: #0e1c10;
		border-bottom: 3px solid #1a3a22;
		font-size: 11px;
		letter-spacing: 0.04em;
	}
	.titlebar strong {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.leds {
		display: flex;
		gap: 4px;
	}
	.leds i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #1a2818;
		border: 1px solid #0a120a;
	}
	.leds i.on {
		background: #3dff7a;
		box-shadow: 0 0 6px #3dff7a;
	}
	.leds i.sample {
		background: #d4c04a;
		box-shadow: 0 0 6px #d4c04a;
	}
	.leds i.net {
		background: #ff6a4a;
		box-shadow: 0 0 6px #ff6a4a;
	}
	.refresh,
	.x {
		flex-shrink: 0;
		width: 28px;
		height: 28px;
		border: 2px solid #0a120a;
		background: #1a3a22;
		color: #9fe0a8;
		font-size: 16px;
		line-height: 1;
		cursor: pointer;
		font-family: inherit;
	}
	.refresh:hover:not(:disabled),
	.x:hover,
	.refresh:focus-visible:not(:disabled),
	.x:focus-visible {
		background: #2a5a34;
		outline: none;
	}
	.refresh:disabled {
		opacity: 0.5;
		cursor: wait;
	}
	.body {
		flex: 1;
		overflow: auto;
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.venue h3 {
		margin: 0 0 6px;
		font-size: 12px;
		letter-spacing: 0.08em;
		color: #c8f5c8;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.tag {
		font-size: 9px;
		padding: 1px 5px;
		border: 1px solid #3dff7a;
		color: #3dff7a;
		letter-spacing: 0.1em;
	}
	.tag.muted {
		border-color: #4a6a4a;
		color: #6a8a6a;
	}
	.summary {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 6px;
		margin: 0 0 8px;
	}
	.summary div {
		background: #0a160c;
		border: 1px solid #1a3a22;
		padding: 5px 6px;
	}
	.summary dt {
		margin: 0;
		font-size: 8px;
		letter-spacing: 0.08em;
		color: #6a9a70;
	}
	.summary dd {
		margin: 2px 0 0;
		font-size: 12px;
		font-weight: 700;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 10px;
	}
	th,
	td {
		border: 1px solid #1a3a22;
		padding: 4px 5px;
		text-align: left;
	}
	th {
		background: #0e1c10;
		color: #6a9a70;
		font-weight: 700;
		letter-spacing: 0.04em;
		font-size: 9px;
	}
	td.long,
	td.buy {
		color: #5dff8a;
	}
	td.short,
	td.sell {
		color: #ff8a7a;
	}
	.pos {
		color: #5dff8a;
	}
	.neg {
		color: #ff8a7a;
	}
	.empty {
		margin: 0;
		font-size: 11px;
		color: #6a8a6a;
		font-style: italic;
	}
	footer {
		padding: 6px 10px;
		border-top: 2px solid #1a3a22;
		font-size: 9px;
		letter-spacing: 0.04em;
		color: #5a7a5a;
		background: #0a140c;
	}
</style>
