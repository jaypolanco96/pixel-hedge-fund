<script lang="ts">
	import { onMount } from 'svelte';
	import Skyline from './Skyline.svelte';
	import RainLayer from './RainLayer.svelte';
	import TickerTape from './TickerTape.svelte';
	import TaHud from './TaHud.svelte';
	import CharacterSprite from './CharacterSprite.svelte';
	import MiniChart from './MiniChart.svelte';
	import FaxMachine from './FaxMachine.svelte';
	import StickyNotes from './StickyNotes.svelte';
	import FloorPet from './FloorPet.svelte';
	import TrashCan from './TrashCan.svelte';
	import MariachiBand from './MariachiBand.svelte';
	import ViewportDrag from '$lib/ui/ViewportDrag.svelte';
	import { TRADERS, STAFF } from '$lib/characters/cast';
	import { initialSimClock, tickSimClock, SIM_MINUTES_PER_REAL_SECOND } from '$lib/weather/timeCycle';
	import { initialKong, tickKong } from '$lib/weather/kongEvent';
	import { initialMariachi, tickMariachi } from '$lib/weather/mariachiEvent';
	import { DEFAULT_DISPLAY, SYMBOLS, resolveSymbol } from '$lib/data/symbols';
	import type {
		Bar,
		CandlesResponse,
		QuoteResponse,
		SignalResponse,
		SimClockState,
		StaffDef,
		TraderDef,
		TraderLeg,
	} from '$lib/data/types';
	import { postureForTrader, reconcileBook, staffNote, statusLabel, type OpenBook } from '$lib/ta/posture';
	import {
		loadLeverageOverrides,
		saveLeverageOverrides,
		applyLeverageOverrides,
		isLeverage,
		type LeverageOverrides
	} from '$lib/persist/leverage';

	const STORAGE_KEY = 'phf-active-symbol';

	let clock = $state<SimClockState>(initialSimClock());
	let quote = $state<QuoteResponse | null>(null);
	let tapeQuotes = $state<QuoteResponse[]>([]);
	let signal = $state<SignalResponse | null>(null);
	let bars = $state<Bar[]>([]);
	let legs = $state<TraderLeg[]>([]);
	let book = $state<OpenBook>({});
	let err = $state<string | null>(null);
	let animTick = $state(0);
	let totalSimMinutes = $state(0);
	let inspectedId = $state('L05');
	let pinnedId = $state<string | null>(null);
	let activeDisplay = $state(DEFAULT_DISPLAY);
	let kong = $state(initialKong());
	let lastKongPulse = $state(-1);
	let mariachi = $state(initialMariachi());
	let leverageOverrides = $state<LeverageOverrides>({});
	let sceneFrame = $state<HTMLDivElement>();
	let clipboardRoot = $state<HTMLElement>();
	let clipboardLeft = $state(16);
	let clipboardTop = $state(155);
	let clipboardReady = $state(false);
	let clipboardDragging = $state(false);
	let clipboardPointerId: number | null = null;
	let clipboardOffsetX = 0;
	let clipboardOffsetY = 0;

	const activeDef = $derived(resolveSymbol(activeDisplay));
	const traders = $derived(applyLeverageOverrides(TRADERS, leverageOverrides));
	const longTraders = $derived(traders.filter((t) => t.side === 'long'));
	const shortTraders = $derived(traders.filter((t) => t.side === 'short'));
	const inspectedTrader = $derived(traders.find((t) => t.id === inspectedId) ?? null);
	const inspectedStaff = $derived(STAFF.find((s) => s.id === inspectedId) ?? null);
	const pinnedTrader = $derived(traders.find((t) => t.id === pinnedId) ?? null);
	const inspectedLeg = $derived(
		inspectedTrader ? (legs.find((l) => l.traderId === inspectedTrader.id) ?? null) : null
	);
	const inspectedPosture = $derived(
		inspectedTrader ? postureForTrader(inspectedTrader, signal, inspectedLeg) : null
	);
	const pinnedLeg = $derived(
		pinnedTrader ? (legs.find((l) => l.traderId === pinnedTrader.id) ?? null) : null
	);
	const pinnedPosture = $derived(
		pinnedTrader ? postureForTrader(pinnedTrader, signal, pinnedLeg) : null
	);
	const longOpen = $derived(
		longTraders.filter(
			(t) =>
				postureForTrader(t, signal, legs.find((l) => l.traderId === t.id) ?? null).posture ===
				'open'
		).length
	);
	const shortOpen = $derived(
		shortTraders.filter(
			(t) =>
				postureForTrader(t, signal, legs.find((l) => l.traderId === t.id) ?? null).posture ===
				'open'
		).length
	);
	const priceDecimals = $derived(activeDef.decimals);

	function legFor(id: string) {
		return legs.find((l) => l.traderId === id) ?? null;
	}
	function postureFor(t: TraderDef) {
		return postureForTrader(t, signal, legFor(t.id));
	}
	function pin(id: string) {
		inspectedId = id;
		pinnedId = pinnedId === id ? null : id;
	}
	function inspectStaff(s: StaffDef) {
		inspectedId = s.id;
	}
	function setTraderLeverage(traderId: string, raw: number | string) {
		const n = Number(raw);
		if (!isLeverage(n)) return;
		const next: LeverageOverrides = { ...leverageOverrides, [traderId]: n };
		leverageOverrides = next;
		legs = legs.map((leg) =>
			leg.traderId === traderId
				? { ...leg, leverage: n, unrealizedPnlPctMargin: leg.unrealizedPnlUsd / (leg.notionalUsd / n) }
				: leg
		);
		saveLeverageOverrides(next);
		pollMarket();
	}

	function fmt(n: number | undefined, digits = priceDecimals) {
		return n == null || !Number.isFinite(n) ? '—' : n.toFixed(digits);
	}
	function pnl(n: number | undefined) {
		if (n == null) return '—';
		return `${n >= 0 ? '+' : ''}$${Math.abs(n).toFixed(2)}`;
	}

	function clipboardBounds() {
		if (!sceneFrame || !clipboardRoot) return null;
		const width = clipboardRoot.offsetWidth;
		const height = clipboardRoot.offsetHeight;
		const maxLeft = Math.max(0, sceneFrame.clientWidth - width);
		const maxTop = Math.max(0, sceneFrame.clientHeight - height);
		return { maxLeft, maxTop };
	}

	function clampClipboard(left: number, top: number) {
		const bounds = clipboardBounds();
		if (!bounds) return { left, top };
		return {
			left: Math.min(Math.max(0, left), bounds.maxLeft),
			top: Math.min(Math.max(0, top), bounds.maxTop)
		};
	}

	function setClipboardPosition(left: number, top: number) {
		const next = clampClipboard(left, top);
		clipboardLeft = next.left;
		clipboardTop = next.top;
	}

	function placeClipboard() {
		if (!sceneFrame || !clipboardRoot) return;
		const w = clipboardRoot.offsetWidth || 246;
		setClipboardPosition(sceneFrame.clientWidth - w - 16, 155);
		clipboardReady = true;
	}

	function reflowClipboard() {
		if (!clipboardReady || !clipboardRoot) return;
		setClipboardPosition(clipboardLeft, clipboardTop);
	}

	function onClipboardPointerDown(event: PointerEvent) {
		if (!clipboardRoot || clipboardPointerId !== null) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		const target = event.target;
		if (target instanceof HTMLElement && target.closest('a, button, input, select, textarea, [data-no-drag]')) return;

		event.preventDefault();
		const frameRect = sceneFrame?.getBoundingClientRect();
		const panelRect = clipboardRoot.getBoundingClientRect();
		const scaleX = frameRect && frameRect.width > 0 ? sceneFrame!.clientWidth / frameRect.width : 1;
		const scaleY = frameRect && frameRect.height > 0 ? sceneFrame!.clientHeight / frameRect.height : 1;
		clipboardOffsetX = (event.clientX - panelRect.left) * scaleX;
		clipboardOffsetY = (event.clientY - panelRect.top) * scaleY;
		clipboardPointerId = event.pointerId;
		clipboardDragging = true;
		clipboardRoot.setPointerCapture(event.pointerId);
	}

	function onClipboardPointerMove(event: PointerEvent) {
		if (!clipboardDragging || clipboardPointerId !== event.pointerId || !sceneFrame) return;
		const frameRect = sceneFrame.getBoundingClientRect();
		const scaleX = frameRect.width > 0 ? sceneFrame.clientWidth / frameRect.width : 1;
		const scaleY = frameRect.height > 0 ? sceneFrame.clientHeight / frameRect.height : 1;
		setClipboardPosition(
			(event.clientX - frameRect.left) * scaleX - clipboardOffsetX,
			(event.clientY - frameRect.top) * scaleY - clipboardOffsetY
		);
	}

	function stopClipboardDragging(event: PointerEvent) {
		if (!clipboardRoot || clipboardPointerId !== event.pointerId) return;
		clipboardDragging = false;
		clipboardPointerId = null;
		if (clipboardRoot.hasPointerCapture(event.pointerId)) clipboardRoot.releasePointerCapture(event.pointerId);
	}

	function persistSymbol(display: string) {
		try {
			localStorage.setItem(STORAGE_KEY, display);
		} catch {
			/* ignore */
		}
		const url = new URL(window.location.href);
		url.searchParams.set('symbol', display);
		history.replaceState(null, '', url);
	}

	function setSymbol(display: string) {
		const def = resolveSymbol(display);
		if (def.display === activeDisplay) return;
		activeDisplay = def.display;
		book = {};
		legs = [];
		quote = null;
		signal = null;
		bars = [];
		persistSymbol(def.display);
		pollMarket();
	}

	function onChannelChange(e: Event) {
		const v = (e.currentTarget as HTMLSelectElement).value;
		setSymbol(v);
	}

	async function pollMarket() {
		const sym = activeDisplay;
		try {
			const [qRes, sRes, cRes, tRes] = await Promise.all([
				fetch(`/api/market/quote?symbol=${encodeURIComponent(sym)}`),
				fetch(`/api/market/signal?symbol=${encodeURIComponent(sym)}`),
				fetch(`/api/market/candles?symbol=${encodeURIComponent(sym)}&tf=15m&limit=80`),
				fetch('/api/market/tape')
			]);
			if (!qRes.ok || !sRes.ok) throw new Error('Tape Wire unavailable');
			const q = (await qRes.json()) as QuoteResponse;
			const s = (await sRes.json()) as SignalResponse;
			// Ignore stale responses if user switched mid-flight
			if (sym !== activeDisplay) return;
			quote = q;
			signal = s;
			if (cRes.ok) bars = ((await cRes.json()) as CandlesResponse).bars;
			if (tRes.ok) {
				const tape = (await tRes.json()) as { quotes: QuoteResponse[] };
				tapeQuotes = tape.quotes ?? [];
			}
			const mark = q.mark || q.price;
			const def = resolveSymbol(sym);
			const result = reconcileBook(
				book,
				s,
				traders,
				mark,
				q.sample || s.sample,
				def.display,
				def.kraken
			);
			book = result.book;
			legs = result.legs;
			err = null;
		} catch (e) {
			err = e instanceof Error ? e.message : 'Market poll failed';
		}
	}

	onMount(() => {
		let initial = DEFAULT_DISPLAY;
		try {
			const params = new URLSearchParams(window.location.search);
			const fromUrl = params.get('symbol');
			const fromStore = localStorage.getItem(STORAGE_KEY);
			initial = resolveSymbol(fromUrl || fromStore || DEFAULT_DISPLAY).display;
		} catch {
			initial = DEFAULT_DISPLAY;
		}
		activeDisplay = initial;
		persistSymbol(initial);

		let raf = 0;
		let last = performance.now();
		let pollAcc = 0;
		leverageOverrides = loadLeverageOverrides();
		pollMarket();
		const loop = (now: number) => {
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			totalSimMinutes += dt * SIM_MINUTES_PER_REAL_SECOND;
			clock = tickSimClock(clock, dt, totalSimMinutes);
			const pulse = Math.floor(now / 350);
			const animPulse = pulse !== lastKongPulse;
			if (animPulse) lastKongPulse = pulse;
			kong = tickKong(kong, clock.phase, totalSimMinutes, animPulse);
			mariachi = tickMariachi(mariachi, clock.phase, totalSimMinutes, animPulse);
			pollAcc += dt;
			if (pollAcc >= 10) {
				pollAcc = 0;
				pollMarket();
			}
			animTick = Math.floor(now / 2800);
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	});
	$effect(() => {
		if (!clipboardRoot || !sceneFrame) return;
		requestAnimationFrame(() => {
			if (!clipboardRoot || !sceneFrame) return;
			placeClipboard();
		});
	});
</script>

<svelte:window
	onresize={reflowClipboard}
	onkeydown={(e) => {
		if (e.key === 'Escape') pinnedId = null;
	}}
/>

<main class="scene" data-phase={clock.phase}>
	<div class="scene-frame" bind:this={sceneFrame}>
		<section class="upper-wall">
			<div class="wall-panel left-wall">
				<div class="fund-sign">
					<div class="monogram">PHF</div>
					<div>
						<strong>PIXEL HEDGE FUND</strong><small>DISCIPLINE · RESEARCH · RETURNS</small>
					</div>
				</div>
				<div class="whiteboard">
					<h3>TODAY:</h3>
					<p>□ Review {activeDef.label} regime</p>
					<p>□ Check ST risk stops</p>
					<p>□ Rebalance allocation</p>
					<p>□ Watch funding / tape</p>
					<b>↗ SMALL EDGE COMPOUNDS</b>
				</div>
			</div>

			<div class="window-wall" aria-label="Panoramic New York skyline at sunset">
				<!-- Render the view once so the skyline, sun, and ESB span all panes. -->
				<div class="panoramic-skyline">
					<Skyline
						phase={clock.phase}
						outdoorLux={clock.outdoorLux}
						raining={clock.raining}
						kongActive={kong.active}
						kongFrame={kong.frame}
					/>
					<RainLayer intensity={clock.rainIntensity} />
				</div>
				{#each [0, 1, 2] as pane}
					<div class="window-pane">
						<div class="glass-glare"></div>
					</div>
				{/each}
				<StickyNotes />
			</div>

			<div class="wall-panel right-wall">
				<div class="market-board">
					<header>
						<span>MARKET WIRE</span><i>{quote?.sample ? 'SAMPLE' : `LIVE ${activeDef.label}`}</i>
					</header>
					<!-- Diegetic channel switch: CRT-style desk pad selector -->
					<label class="channel-switch">
						<span>CHANNEL</span>
						<select value={activeDisplay} onchange={onChannelChange} aria-label="Active trading symbol">
							{#each SYMBOLS as s (s.display)}
								<option value={s.display}>{s.label} · {s.display}</option>
							{/each}
						</select>
					</label>
					<div>
						<b>{activeDef.label} PERP</b>
						<strong>{quote?.price?.toFixed(priceDecimals) ?? '—'}</strong>
						<em class:down={(quote?.change24h ?? 0) < 0}
							>{quote?.change24h == null
								? '—'
								: `${quote.change24h >= 0 ? '+' : ''}${quote.change24h.toFixed(2)}%`}</em
						>
					</div>
					{#each tapeQuotes.filter((q) => q.display !== activeDisplay).slice(0, 5) as tq (tq.display)}
						<div>
							<b>{resolveSymbol(tq.display).label}</b>
							<strong
								>{tq.price.toFixed(resolveSymbol(tq.display).decimals)}{tq.sample
									? '*'
									: ''}</strong
							>
							<em class:down={(tq.change24h ?? 0) < 0}
								>{tq.change24h == null
									? '—'
									: `${tq.change24h >= 0 ? '+' : ''}${tq.change24h.toFixed(1)}%`}</em
							>
						</div>
					{/each}
				</div>
				<div class="bull-cabinet">
					<div class="bull">♞</div>
					<div class="cabinet"><i></i><i></i><i></i></div>
					<div class="plant tall"><i></i><i></i><i></i></div>
				</div>
			</div>
		</section>

		<div class="ticker-anchor">
			<TickerTape quotes={tapeQuotes} {activeDisplay} bias={signal?.bias ?? 'FLAT'} />
		</div>

		<section class="office-floor">
			<div class="floor-light"></div>
			<div class="back-staff">
				{#each STAFF as s (s.id)}
					<CharacterSprite
						staff={s}
						note={staffNote(s, signal)}
						{bars}
						lampBoost={0.22}
						tick={animTick}
						pinned={pinnedId === s.id}
						onInspect={() => inspectStaff(s)}
						onPin={() => {
							inspectedId = s.id;
							pinnedId = pinnedId === s.id ? null : s.id;
						}}
					/>
				{/each}
			</div>

			<div class="desk-zones">
				<div class="desk-zone long-zone" class:active={signal?.bias === 'LONG'}>
					<div class="zone-sign"><span>LONG BOOK</span><b>{longOpen} OPEN</b></div>
					<div class="trader-row">
						{#each longTraders as t (t.id)}
							<CharacterSprite
								trader={t}
								leg={legFor(t.id)}
								posture={postureFor(t)}
								{bars}
								lampBoost={signal?.bias === 'LONG' ? 0.22 : 0}
								tick={animTick}
								pinned={pinnedId === t.id}
								onInspect={() => (inspectedId = t.id)}
								onPin={() => pin(t.id)}
								onLeverageCommit={(value) => setTraderLeverage(t.id, value)}
							/>
						{/each}
					</div>
				</div>
				<div class="aisle">
					<span>RISK<br />AISLE</span><i></i><i></i><i></i>
				</div>
				<div class="desk-zone short-zone" class:active={signal?.bias === 'SHORT'}>
					<div class="zone-sign"><span>SHORT BOOK</span><b>{shortOpen} OPEN</b></div>
					<div class="trader-row">
						{#each shortTraders as t (t.id)}
							<CharacterSprite
								trader={t}
								leg={legFor(t.id)}
								posture={postureFor(t)}
								{bars}
								lampBoost={signal?.bias === 'SHORT' ? 0.22 : 0}
								tick={animTick}
								pinned={pinnedId === t.id}
								onInspect={() => (inspectedId = t.id)}
								onPin={() => pin(t.id)}
								onLeverageCommit={(value) => setTraderLeverage(t.id, value)}
							/>
						{/each}
					</div>
				</div>
			</div>

			<div class="lounge" aria-hidden="true">
				<div class="sofa"><i></i><i></i></div>
				<div class="coffee-table"><span>FORTUNE</span></div>
				<div class="plant"><i></i><i></i><i></i></div>
			</div>

			<MariachiBand active={mariachi.active} frame={mariachi.frame} />

		</section>

		<FaxMachine
			{signal}
			{quote}
			{bars}
			displaySymbol={activeDisplay}
			decimals={priceDecimals}
			sceneFrame={sceneFrame}
		/>
		<FloorPet
			bias={signal?.bias ?? 'FLAT'}
			confluenceBand={signal?.confluenceBand ?? 'weak'}
			tick={animTick}
			sceneFrame={sceneFrame}
		/>
		<TrashCan
			{signal}
			{quote}
			displaySymbol={activeDisplay}
			decimals={priceDecimals}
			sceneFrame={sceneFrame}
		/>

		<section class="foreground-desk">
			<div class="desk-edge"></div>
			<div class="book-stack" aria-hidden="true">
				<div>SECURITIES<br />ANALYSIS</div>
				<div>TECHNICAL<br />ANALYSIS</div>
				<div>OPTIONS<br />STRATEGIES</div>
				<div>INTELLIGENT<br />INVESTOR</div>
			</div>
			<div class="wsj">
				<header>THE WALL STREET JOURNAL</header>
				<b>Markets Watch<br />AI Optimism</b><i></i><i></i><i></i>
			</div>
			<div class="legal-pad">
				<header>POSITIONS:</header>
				<p>
					{signal?.bias === 'LONG' ? 'LONG' : signal?.bias === 'SHORT' ? 'SHORT' : 'FLAT'}
					{activeDef.label}
				</p>
				<p>Conf: {signal?.confluence ?? '—'}/5</p>
				<p>Risk: {signal?.risk.risk_pct.toFixed(2) ?? '—'}%</p>
				<span></span>
			</div>
			<div class="foreground-monitor">
				<div class="monitor-bezel">
					{#if pinnedTrader && pinnedPosture}
						<div class="pinned-head">
							<span>PINNED: {pinnedTrader.name} · {pinnedTrader.leverage}×</span>
							<b>{pinnedPosture.status.toUpperCase()}</b>
						</div>
						<div class="pinned-chart">
							<MiniChart
								{bars}
								bias={pinnedPosture.bias}
								label={`${activeDef.kraken} · PINNED DESK`}
								showLevels={true}
								stop={pinnedPosture.stop}
								tp1={pinnedPosture.tp1}
								tp2={pinnedPosture.tp2}
							/>
						</div>
						<div class="pinned-risk">
							SL {fmt(pinnedPosture.stop)} · TP1 {fmt(pinnedPosture.tp1)} · TP2 {fmt(
								pinnedPosture.tp2
							)}
						</div>
					{:else}
						<TaHud {signal} displaySymbol={activeDisplay} />
					{/if}
				</div>
				<div class="monitor-foot"></div>
			</div>
			<div class="keyboard-main"><i></i></div>
			<div class="phone-main"><span></span><i></i></div>
			<div class="calculator">789<br />456<br />123</div>
			<div class="coffee"><i></i><b></b></div>
			<!-- Desk pad: secondary diegetic pair switch -->
			<label class="desk-pair-pad">
				<span>PAIR</span>
				<select value={activeDisplay} onchange={onChannelChange} aria-label="Desk pair selector">
					{#each SYMBOLS as s (s.display)}
						<option value={s.display}>{s.display}</option>
					{/each}
				</select>
			</label>
		</section>
{#if (inspectedTrader && inspectedPosture) || inspectedStaff}
	<aside
		bind:this={clipboardRoot}
		class="clipboard-panel"
		class:is-dragging={clipboardDragging}
		class:staff-card={!!inspectedStaff && !inspectedTrader}
		data-side={inspectedTrader?.side ?? 'staff'}
		role="group"
		aria-label="Draggable desk clipboard"
		title="Drag clipboard"
		style:left={`${clipboardLeft}px`}
		style:top={`${clipboardTop}px`}
		onpointerdown={onClipboardPointerDown}
		onpointermove={onClipboardPointerMove}
		onpointerup={stopClipboardDragging}
		onpointercancel={stopClipboardDragging}
		onlostpointercapture={stopClipboardDragging}
	>
			<div class="clip"></div>
			{#if inspectedTrader && inspectedPosture}
				<header>
					<div>
						<small>DESK CLIPBOARD · DRAG</small><strong>{inspectedTrader.name}</strong>
					</div>
					<b>{inspectedTrader.side.toUpperCase()} · {inspectedTrader.leverage}×</b>
				</header>
				<div class="panel-status" data-status={inspectedPosture.status}>
					<i></i>{statusLabel(inspectedPosture.status)}
				</div>
				<dl>
					<div>
						<dt>PAIR</dt>
						<dd>{activeDisplay}</dd>
					</div>
					<div>
						<dt>BIAS / STRUCTURE</dt>
						<dd>{inspectedPosture.bias} / {inspectedPosture.structure}</dd>
					</div>
					<div>
						<dt>CONFLUENCE</dt>
						<dd
							>{inspectedPosture.confluence}/5 {inspectedPosture.aligned
								? '· ALIGNED'
								: '· COUNTER'}</dd
						>
					</div>
					<div>
						<dt>ENTRY</dt>
						<dd>{fmt(inspectedPosture.entryMark)}</dd>
					</div>
					<div>
						<dt>MARK</dt>
						<dd>{fmt(inspectedPosture.mark ?? quote?.mark)}</dd>
					</div>
					<div>
						<dt>UNREALIZED</dt>
						<dd
							class:positive={(inspectedPosture.unrealizedPnlUsd ?? 0) >= 0}
							class:negative={(inspectedPosture.unrealizedPnlUsd ?? 0) < 0}
							>{pnl(inspectedPosture.unrealizedPnlUsd)}</dd
						>
					</div>
					<div>
						<dt>STOP · SUPERTREND</dt>
						<dd class="negative">{fmt(inspectedPosture.stop)}</dd>
					</div>
					<div>
						<dt>TP1 · 1.5R</dt>
						<dd class="positive">{fmt(inspectedPosture.tp1)}</dd>
					</div>
					<div>
						<dt>TP2 · 2.5R</dt>
						<dd class="positive">{fmt(inspectedPosture.tp2)}</dd>
					</div>
				</dl>
				<p>
					{inspectedPosture.posture === 'open'
						? 'Invalidation: Supertrend flips against position.'
						: (inspectedPosture.cloud ?? 'Mandate does not support current tape. No fill.')}
				</p>
				<footer>
					CLICK DESK TO {pinnedId === inspectedTrader.id ? 'UNPIN' : 'PIN CRT'}
					{inspectedPosture.sample ? '· SAMPLE' : ''}
				</footer>
			{:else if inspectedStaff}
				<header>
					<div>
						<small>STAFF NOTE · DRAG</small><strong>{inspectedStaff.name}</strong>
					</div>
					<b>{inspectedStaff.title}</b>
				</header>
				<div class="staff-sheet">{staffNote(inspectedStaff, signal)}</div>
				<p>
					{inspectedStaff.role === 'cio'
						? 'Scanning floor risk and mandate alignment.'
						: inspectedStaff.role === 'pm'
							? 'Maintaining allocation notes across long and short books.'
							: inspectedStaff.role === 'quant'
								? 'Monitoring model confidence and volatility state.'
								: 'Research clipboard tied to live Chart Desk structure.'}
				</p>
			{/if}
	</aside>
{/if}
	</div>


</main>

<ViewportDrag defaultLeft={18} defaultBottom={18} ariaLabel="Draggable price widget">
	<div class="wire-status" title="Drag price widget">
		<div class="clip"></div>
		<div>
			<span class:dot-live={!quote?.sample}></span>{quote?.sample
				? 'SAMPLE TAPE'
				: `KRAKEN · ${activeDef.kraken}`}
		</div>
		<strong>{quote?.price?.toFixed(priceDecimals) ?? 'CONNECTING'}</strong>
		<small
			>{clock.label} · {clock.phase.toUpperCase()}{clock.raining ? ' · RAIN' : ''}{kong.active
				? ' · KONG!'
				: ''}{mariachi.active ? ' · MARIACHI!' : ''}</small
		>
	</div>
</ViewportDrag>
	{#if err}<div class="error-note">TAPE WIRE: {err}</div>{/if}

<style>
	:global(:root) {
		--pixel: 'Courier New', monospace;
		--mono: 'Courier New', monospace;
	}
	.scene {
		position: relative;
		min-height: 100vh;
		background: #0c0807;
		color: #f0e4cf;
		font-family: var(--mono);
		overflow-x: hidden;
		display: block;
		padding: 0;
	}
	.scene-frame {
		position: relative;
		width: min(1440px, 100%);
		min-width: 0;
		min-height: 900px;
		margin: 0 auto;
		overflow: hidden;
		background: #21130e;
		box-shadow: 0 0 80px #000;
		image-rendering: pixelated;
	}
	.upper-wall {
		position: relative;
		height: 295px;
		display: grid;
		grid-template-columns: 230px 1fr 275px;
		background: #3a2117;
		border-bottom: 8px solid #6f4225;
		box-shadow: inset 0 -12px 25px rgba(30, 10, 4, 0.65);
	}
	.wall-panel {
		position: relative;
		background: linear-gradient(90deg, #4b2c1e, #372017);
		border-right: 6px solid #24140e;
		border-left: 4px solid #6c442a;
	}
	.fund-sign {
		display: flex;
		gap: 8px;
		align-items: center;
		margin: 16px 10px 10px;
		padding: 10px 8px;
		background: #1b1512;
		border: 3px solid #9c7040;
		box-shadow:
			0 0 12px rgba(239, 183, 89, 0.18),
			4px 4px 0 rgba(20, 8, 3, 0.5);
	}
	.monogram {
		display: grid;
		place-items: center;
		width: 42px;
		height: 42px;
		color: #1d140d;
		background: #d7ae63;
		border: 3px solid #76512e;
		font-size: 12px;
		font-weight: 900;
	}
	.fund-sign strong {
		display: block;
		color: #efc66f;
		font-size: 9px;
		letter-spacing: 0.08em;
	}
	.fund-sign small {
		display: block;
		margin-top: 4px;
		color: #ab8e64;
		font-size: 5px;
		letter-spacing: 0.08em;
	}
	.whiteboard {
		margin: 16px 13px;
		padding: 10px 10px 8px;
		background: #ece6d5;
		color: #26333a;
		border: 5px solid #6e5136;
		box-shadow: 4px 5px 0 rgba(20, 8, 4, 0.5);
		transform: rotate(-0.4deg);
	}
	.whiteboard h3 {
		margin: 0 0 5px;
		font-size: 10px;
		border-bottom: 2px solid #45585d;
	}
	.whiteboard p {
		margin: 3px 0;
		font-size: 6px;
	}
	.whiteboard b {
		display: block;
		margin-top: 7px;
		color: #9c412c;
		font-size: 6px;
		transform: rotate(-2deg);
	}
	.window-wall {
		position: relative;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 7px;
		padding: 10px 8px 0;
		background: #1e1513;
	}
	.panoramic-skyline {
		position: absolute;
		inset: 10px 8px 0;
		overflow: hidden;
		z-index: 1;
	}
	.window-wall::after {
		content: '';
		position: absolute;
		inset: 10px 8px 0;
		pointer-events: none;
		z-index: 3;
		background: linear-gradient(
			90deg,
			transparent 0 calc(33.333% - 3.5px),
			#1e1513 calc(33.333% - 3.5px) calc(33.333% + 3.5px),
			transparent calc(33.333% + 3.5px) calc(66.666% - 3.5px),
			#1e1513 calc(66.666% - 3.5px) calc(66.666% + 3.5px),
			transparent calc(66.666% + 3.5px) 100%
		);
	}
	.window-pane {
		position: relative;
		overflow: hidden;
		border: 5px solid #433128;
		border-bottom: 10px solid #5e4030;
		box-shadow: inset 0 0 0 2px #8a6042;
		z-index: 2;
	}
	.glass-glare {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			115deg,
			rgba(255, 255, 255, 0.1),
			transparent 24%,
			transparent 67%,
			rgba(255, 190, 130, 0.06)
		);
		z-index: 8;
		pointer-events: none;
	}
	.market-board {
		margin: 14px 12px 8px;
		padding: 8px;
		background: #11130f;
		border: 5px solid #79603f;
		box-shadow:
			inset 0 0 16px #000,
			4px 5px 0 rgba(15, 5, 2, 0.5);
	}
	.market-board header {
		display: flex;
		justify-content: space-between;
		padding-bottom: 5px;
		color: #d8b76c;
		border-bottom: 1px solid #5a5134;
		font-size: 7px;
	}
	.market-board header i {
		color: #6ed898;
		font-style: normal;
	}
	.channel-switch {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		margin: 6px 0 4px;
		padding: 4px 5px;
		background: #1a1c16;
		border: 1px solid #5a5134;
		font-size: 6px;
		color: #9d886f;
	}
	.channel-switch select {
		flex: 1;
		max-width: 150px;
		background: #0c0e0a;
		color: #79dfa0;
		border: 1px solid #3a5134;
		font: 7px var(--mono);
		padding: 2px 3px;
		cursor: pointer;
	}
	.market-board > div {
		display: grid;
		grid-template-columns: 1fr auto 37px;
		gap: 6px;
		margin-top: 5px;
		font-size: 6px;
	}
	.market-board strong {
		color: #e8d9b7;
	}
	.market-board em {
		color: #62d18b;
		font-style: normal;
		text-align: right;
	}
	.market-board em.down {
		color: #ed6c59;
	}
	.bull-cabinet {
		position: absolute;
		left: 14px;
		right: 14px;
		bottom: 8px;
		height: 72px;
	}
	.cabinet {
		position: absolute;
		left: 33px;
		bottom: 0;
		width: 62px;
		height: 48px;
		background: #5b5a4f;
		border: 3px solid #2e2d28;
	}
	.cabinet i {
		display: block;
		height: 14px;
		border-bottom: 2px solid #34332d;
	}
	.bull {
		position: absolute;
		left: 47px;
		bottom: 46px;
		color: #d5a84e;
		font-size: 25px;
		transform: scaleX(1.2);
		text-shadow: 2px 2px #402711;
	}
	.plant {
		position: absolute;
		width: 48px;
		height: 72px;
	}
	.plant.tall {
		right: 3px;
		bottom: 0;
	}
	.plant:after {
		content: '';
		position: absolute;
		left: 14px;
		bottom: 0;
		width: 26px;
		height: 24px;
		background: #8b4d2a;
		border: 3px solid #402517;
	}
	.plant i {
		position: absolute;
		left: 22px;
		bottom: 19px;
		width: 12px;
		height: 47px;
		background: #35582d;
		clip-path: polygon(50% 0, 100% 65%, 65% 55%, 65% 100%, 35% 100%, 35% 55%, 0 65%);
	}
	.plant i:nth-child(2) {
		transform: rotate(38deg);
		height: 39px;
	}
	.plant i:nth-child(3) {
		transform: rotate(-42deg);
		height: 36px;
	}

	.office-floor {
		position: relative;
		height: 435px;
		padding: 7px 10px 0;
		background: linear-gradient(170deg, #6a412c 0 6%, #34231c 6% 100%);
		overflow: visible;
	}
	.office-floor:before {
		content: '';
		position: absolute;
		inset: 0;
		background:
			repeating-linear-gradient(90deg, rgba(227, 147, 74, 0.05) 0 2px, transparent 2px 35px),
			repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.12) 0 2px, transparent 2px 35px);
		transform: perspective(480px) rotateX(7deg);
		transform-origin: top;
	}
	.floor-light {
		position: absolute;
		inset: 0;
		background: radial-gradient(ellipse at 50% 0, rgba(235, 133, 63, 0.22), transparent 60%);
		pointer-events: none;
	}
	.back-staff {
		position: relative;
		z-index: 4;
		height: 148px;
		display: flex;
		justify-content: center;
		gap: 17px;
		padding-top: 2px;
		border-bottom: 3px solid rgba(103, 66, 43, 0.9);
	}
	.desk-zones {
		position: relative;
		z-index: 7;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 58px minmax(0, 1fr);
		height: 260px;
		padding: 5px 18px 0 12px;
		gap: 4px;
	}
	.desk-zone {
		position: relative;
		min-width: 0;
		padding: 15px 4px 4px;
		border: 2px solid rgba(114, 74, 47, 0.75);
		background: rgba(31, 20, 16, 0.36);
		transition: box-shadow 0.4s;
	}
	.desk-zone.active {
		box-shadow: inset 0 0 28px rgba(72, 217, 137, 0.11);
	}
	.short-zone.active {
		box-shadow: inset 0 0 28px rgba(239, 100, 78, 0.12);
	}
	.zone-sign {
		position: absolute;
		left: 9px;
		top: 4px;
		right: 9px;
		display: flex;
		justify-content: space-between;
		font-size: 7px;
		letter-spacing: 0.12em;
		color: #72d99a;
	}
	.zone-sign b {
		font-size: 6px;
		color: #d1b16a;
	}
	.short-zone .zone-sign {
		color: #ef7767;
	}
	.trader-row {
		display: flex;
		justify-content: center;
		align-items: flex-end;
		gap: 0;
		min-width: 0;
		padding-top: 15px;
	}
	.trader-row :global(.character) {
		flex: 1 1 0;
		width: auto;
		min-width: 0;
		max-width: 128px;
	}
	.trader-row :global(.thought) {
		max-width: min(115px, calc(100% + 8px));
	}
	.trader-row :global(.character:nth-child(even)) {
		transform: translateY(10px);
	}
	.aisle {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: 33px;
		color: #9b7657;
		font-size: 6px;
		text-align: center;
		letter-spacing: 0.13em;
	}
	.aisle i {
		display: block;
		width: 3px;
		height: 34px;
		margin: 5px 0;
		background: repeating-linear-gradient(#b38961 0 6px, transparent 6px 12px);
	}
	.lounge {
		position: absolute;
		z-index: 6;
		right: 9px;
		bottom: 11px;
		width: 126px;
		height: 135px;
	}
	.sofa {
		position: absolute;
		bottom: 28px;
		right: 0;
		width: 105px;
		height: 53px;
		background: #28201f;
		border: 4px solid #130f0e;
		border-radius: 8px 8px 2px 2px;
		box-shadow: inset 0 -14px #191414;
	}
	.sofa i {
		position: absolute;
		top: 7px;
		width: 43px;
		height: 26px;
		background: #3b302e;
		border: 2px solid #1b1514;
	}
	.sofa i:first-child {
		left: 7px;
	}
	.sofa i:last-child {
		right: 7px;
	}
	.coffee-table {
		position: absolute;
		left: 0;
		bottom: 0;
		width: 77px;
		height: 22px;
		background: #7a4829;
		border: 3px solid #331d12;
		transform: skewX(-8deg);
	}
	.coffee-table span {
		display: block;
		width: 38px;
		margin: 2px 5px;
		background: #cfb364;
		color: #3d2918;
		font-size: 5px;
		transform: rotate(-7deg);
	}
	.lounge .plant {
		right: 86px;
		bottom: 61px;
		transform: scale(0.78);
	}

	.clipboard-panel {
		position: absolute;
		z-index: 70;
		box-sizing: border-box;
		width: 246px;
		min-height: 238px;
		padding: 17px 14px 11px;
		background: #d5bd84;
		color: #382719;
		border: 4px solid #5b3a22;
		box-shadow:
			7px 7px 0 rgba(25, 10, 4, 0.48),
			inset 0 1px 0 rgba(255, 255, 255, 0.2);
		font-family: var(--mono);
		margin: 0;
		touch-action: none;
		user-select: none;
		cursor: grab;
	}
	.clipboard-panel.is-dragging,
	.clipboard-panel.is-dragging .clip {
		cursor: grabbing;
	}
	.clipboard-panel:before {
		content: '';
		position: absolute;
		inset: 6px;
		border: 1px solid rgba(91, 58, 34, 0.25);
		pointer-events: none;
	}
	.clip {
		position: absolute;
		top: -9px;
		left: 83px;
		width: 70px;
		height: 20px;
		background: #74543a;
		border: 3px solid #392619;
		box-shadow: inset 0 3px #9e7957;
		cursor: grab;
	}
	.clipboard-panel header {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 10px;
		padding-bottom: 7px;
		border-bottom: 2px solid #5d4930;
	}
	.clipboard-panel header small,
	.clipboard-panel header strong {
		display: block;
	}
	.clipboard-panel header small {
		font-size: 6px;
		opacity: 0.7;
	}
	.clipboard-panel header strong {
		font-size: 11px;
	}
	.clipboard-panel header > b {
		font-size: 7px;
		color: #355f4a;
	}
	.clipboard-panel[data-side='short'] header > b {
		color: #9a4436;
	}
	.panel-status {
		display: inline-flex;
		gap: 5px;
		align-items: center;
		margin: 6px 0;
		padding: 3px 5px;
		background: #f0dfac;
		border: 1px solid #6f5230;
		font-size: 7px;
		text-transform: uppercase;
	}
	.panel-status i {
		width: 7px;
		height: 7px;
		background: #6abf84;
	}
	.panel-status[data-status='thinking'] i {
		background: #d4a94f;
	}
	.panel-status[data-status='flat'] i,
	.panel-status[data-status='watching'] i {
		background: #807970;
	}
	.panel-status[data-status='stress'] i {
		background: #c8503f;
	}
	.panel-status[data-status='celebrating'] i {
		background: #4ecf72;
		box-shadow: 0 0 4px #4ecf72;
	}
	.clipboard-panel dl {
		margin: 0;
	}
	.clipboard-panel dl div {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		padding: 3px 0;
		border-bottom: 1px dotted rgba(70, 45, 25, 0.35);
		font-size: 7px;
	}
	.clipboard-panel dt {
		opacity: 0.68;
	}
	.clipboard-panel dd {
		margin: 0;
		font-weight: 900;
		text-align: right;
	}
	.positive {
		color: #287348;
	}
	.negative {
		color: #9c392e;
	}
	.clipboard-panel p {
		margin: 7px 0;
		font-size: 6px;
		line-height: 1.35;
	}
	.clipboard-panel footer {
		font-size: 6px;
		color: #694b2c;
		border-top: 1px solid #80613d;
		padding-top: 5px;
	}
	.staff-sheet {
		margin: 15px 0 8px;
		padding: 11px;
		background: #f0e2b9;
		border: 1px solid #7f6240;
		font-size: 9px;
		font-weight: 900;
	}
	.staff-card {
		min-height: 150px;
	}

	.foreground-desk {
		position: relative;
		z-index: 55;
		height: 150px;
		background: linear-gradient(#a76530 0 9px, #78451f 9px 100%);
		border-top: 7px solid #3d2516;
		box-shadow:
			0 -12px 24px rgba(24, 9, 3, 0.45),
			inset 0 5px #c57c3c;
	}
	.desk-edge {
		position: absolute;
		inset: auto 0 0;
		height: 14px;
		background: #462817;
		border-top: 3px solid #9b5a2d;
	}
	.book-stack {
		position: absolute;
		left: 18px;
		bottom: 13px;
		width: 155px;
	}
	.book-stack div {
		height: 25px;
		padding: 4px 8px;
		border: 2px solid #2f1b11;
		box-shadow: inset 0 2px rgba(255, 255, 255, 0.12);
		color: #ead7a1;
		font-size: 6px;
		font-weight: 900;
		letter-spacing: 0.08em;
	}
	.book-stack div:nth-child(1) {
		background: #49392d;
	}
	.book-stack div:nth-child(2) {
		width: 145px;
		background: #7a3430;
	}
	.book-stack div:nth-child(3) {
		width: 135px;
		background: #284e47;
	}
	.book-stack div:nth-child(4) {
		width: 148px;
		background: #62513b;
	}
	.wsj {
		position: absolute;
		left: 185px;
		top: 20px;
		width: 130px;
		height: 94px;
		padding: 6px;
		background: #d8d1bb;
		color: #2d2a25;
		border: 2px solid #554d41;
		transform: rotate(-2deg);
	}
	.wsj header {
		font: 7px Georgia, serif;
		border-bottom: 2px solid #333;
	}
	.wsj b {
		display: block;
		margin: 5px 0;
		font: 11px Georgia, serif;
	}
	.wsj i {
		display: block;
		height: 3px;
		margin: 3px 0;
		background: #8b867a;
	}
	.legal-pad {
		position: absolute;
		left: 325px;
		top: 16px;
		width: 105px;
		height: 105px;
		padding: 10px;
		background: repeating-linear-gradient(#f1d77b 0 13px, #c9b365 13px 14px);
		color: #3d3422;
		border: 2px solid #6e5d37;
		transform: rotate(1deg);
		font-size: 7px;
	}
	.legal-pad header {
		font-weight: 900;
		border-bottom: 2px solid #594626;
	}
	.legal-pad p {
		margin: 5px 0;
	}
	.legal-pad span {
		position: absolute;
		right: 17px;
		bottom: 5px;
		width: 4px;
		height: 74px;
		background: #242521;
		transform: rotate(36deg);
		box-shadow: 1px 0 #b7a367;
	}
	.foreground-monitor {
		position: absolute;
		left: 455px;
		bottom: 4px;
		width: 325px;
		height: 176px;
		background: #a99e82;
		border: 5px solid #403a31;
		border-radius: 8px 8px 3px 3px;
		box-shadow:
			inset 4px 4px #d4c9a6,
			6px 6px 0 rgba(32, 14, 6, 0.45);
	}
	.monitor-bezel {
		position: absolute;
		inset: 12px 14px 24px;
		border: 4px solid #35342b;
		background: #06120d;
		overflow: hidden;
	}
	.monitor-foot {
		position: absolute;
		left: 130px;
		bottom: -18px;
		width: 67px;
		height: 18px;
		background: #8e846d;
		border: 4px solid #3e3930;
		border-top: 0;
	}
	.pinned-head {
		display: flex;
		justify-content: space-between;
		padding: 6px 8px 3px;
		color: #70dfa1;
		background: #07150f;
		font-size: 7px;
	}
	.pinned-head b {
		color: #e9c76d;
	}
	.pinned-chart {
		height: 91px;
	}
	.pinned-risk {
		padding: 4px 8px;
		color: #e9c76d;
		background: #07150f;
		font-size: 7px;
	}
	.keyboard-main {
		position: absolute;
		left: 790px;
		top: 52px;
		width: 180px;
		height: 57px;
		background: #b3a88d;
		border: 4px solid #474139;
		transform: skewX(-12deg);
		box-shadow: 5px 5px 0 rgba(40, 17, 7, 0.38);
	}
	.keyboard-main i {
		position: absolute;
		inset: 8px;
		background:
			repeating-linear-gradient(90deg, #776f5e 0 3px, transparent 3px 10px),
			repeating-linear-gradient(0deg, #776f5e 0 3px, transparent 3px 10px);
	}
	.phone-main {
		position: absolute;
		left: 990px;
		top: 40px;
		width: 103px;
		height: 67px;
		background: #a59c83;
		border: 4px solid #3b3731;
		border-radius: 8px;
	}
	.phone-main span {
		position: absolute;
		left: 5px;
		top: -10px;
		width: 90px;
		height: 19px;
		background: #797365;
		border: 4px solid #3a3630;
		border-radius: 10px;
	}
	.phone-main i {
		position: absolute;
		left: 28px;
		top: 23px;
		width: 45px;
		height: 30px;
		background: repeating-radial-gradient(#4c4940 0 2px, #aaa085 2px 6px);
	}
	.calculator {
		position: absolute;
		left: 1110px;
		top: 42px;
		width: 56px;
		height: 69px;
		padding: 7px;
		background: #343733;
		color: #b8e0be;
		border: 3px solid #171a17;
		font-size: 8px;
		line-height: 1.7;
		letter-spacing: 8px;
	}
	.coffee {
		position: absolute;
		left: 1186px;
		top: 42px;
		width: 52px;
		height: 61px;
		background: #2b2623;
		border: 4px solid #15110f;
		border-radius: 3px 3px 12px 12px;
	}
	.coffee i {
		position: absolute;
		right: -19px;
		top: 10px;
		width: 22px;
		height: 29px;
		border: 5px solid #211b18;
		border-left: 0;
		border-radius: 0 14px 14px 0;
	}
	.coffee b {
		position: absolute;
		left: 12px;
		top: -24px;
		width: 3px;
		height: 20px;
		background: rgba(235, 225, 205, 0.45);
		box-shadow: 10px -5px rgba(235, 225, 205, 0.35);
		animation: steam 2s ease-in-out infinite;
	}
	@keyframes steam {
		50% {
			transform: translateY(-5px);
			opacity: 0.3;
		}
	}
	.desk-pair-pad {
		position: absolute;
		left: 790px;
		top: 12px;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 3px 6px;
		background: #3a2a1c;
		border: 2px solid #6a4a2e;
		font-size: 6px;
		color: #c9a878;
		transform: rotate(-1deg);
		z-index: 2;
	}
	.desk-pair-pad select {
		background: #1a120e;
		color: #79dfa0;
		border: 1px solid #5a3b27;
		font: 7px var(--mono);
		padding: 1px 2px;
		cursor: pointer;
	}
	.wire-status {
		position: relative;
		box-sizing: border-box;
		width: 170px;
		padding: 17px 8px 8px;
		background: #241914;
		border: 3px solid #5a3b27;
		box-shadow: inset 0 0 9px #000;
	}
	.wire-status .clip {
		left: 50%;
		transform: translateX(-50%);
	}
	.wire-status div {
		font-size: 6px;
		color: #9d886f;
	}
	.wire-status span {
		display: inline-block;
		width: 6px;
		height: 6px;
		margin-right: 5px;
		background: #d09a45;
	}
	.wire-status span.dot-live {
		background: #59cf84;
		box-shadow: 0 0 5px #59cf84;
	}
	.wire-status strong {
		display: block;
		margin: 5px 0;
		color: #efc870;
		font-size: 18px;
	}
	.wire-status small {
		display: block;
		font-size: 6px;
		color: #bca58d;
	}
	.error-note {
		position: fixed;
		left: 12px;
		bottom: 12px;
		z-index: 100;
		padding: 8px 10px;
		background: #7d3028;
		color: #ffe0d4;
		border: 2px solid #c66b59;
		font-size: 8px;
	}
	/* —— Responsive: tablet (~768–1100) + phone (~375–480) —— */
	@media (max-width: 1100px) {
		.scene-frame {
			min-height: 0;
		}
		.upper-wall {
			grid-template-columns: minmax(160px, 200px) minmax(0, 1fr) minmax(180px, 230px);
			height: 260px;
		}
		.desk-zones {
			padding: 5px 10px 0;
		}
		.clipboard-panel {
			max-width: calc(100vw - 16px);
		}
		.foreground-monitor {
			left: 380px;
			width: 300px;
		}
		.keyboard-main {
			left: 700px;
		}
		.desk-pair-pad {
			left: 700px;
		}
		.phone-main {
			left: 900px;
		}
		.calculator {
			left: 1020px;
		}
		.coffee {
			left: 1090px;
		}
	}

	/* Tablet: stack books, compress skyline, keep desk props readable */
	@media (max-width: 768px) {
		.scene {
			padding-bottom: env(safe-area-inset-bottom, 0);
		}
		.scene-frame {
			width: 100%;
			min-height: 0;
			overflow-x: hidden;
		}
		.upper-wall {
			display: grid;
			grid-template-columns: 1fr;
			grid-template-rows: auto auto auto;
			height: auto;
		}
		.left-wall {
			border-right: 0;
			border-bottom: 4px solid #24140e;
		}
		.right-wall {
			border-left: 0;
			border-top: 4px solid #24140e;
			min-height: 160px;
		}
		.bull-cabinet {
			position: relative;
			left: auto;
			right: auto;
			bottom: auto;
			height: 56px;
			margin: 0 12px 8px;
		}
		.window-wall {
			height: 160px;
			order: -1; /* panoramic skyline first on narrow */
		}
		.panoramic-skyline {
			inset: 8px 6px 0;
		}
		.window-wall::after {
			inset: 8px 6px 0;
		}
		.fund-sign {
			margin: 10px 10px 8px;
		}
		.fund-sign strong {
			font-size: 10px;
		}
		.fund-sign small {
			font-size: 6px;
		}
		.whiteboard {
			margin: 8px 12px 12px;
		}
		.whiteboard p,
		.whiteboard b {
			font-size: 8px;
		}
		.market-board {
			margin: 10px 12px 8px;
		}
		.market-board header {
			font-size: 9px;
		}
		.channel-switch {
			font-size: 8px;
			padding: 6px 8px;
			gap: 8px;
		}
		.channel-switch select {
			max-width: none;
			font-size: 11px;
			padding: 6px 8px;
			min-height: 36px; /* touch-friendly */
		}
		.market-board > div {
			font-size: 9px;
			grid-template-columns: 1fr auto minmax(44px, auto);
		}

		.office-floor {
			height: auto;
			min-height: 0;
			padding: 8px 8px 16px;
			overflow: visible;
		}
		.back-staff {
			height: auto;
			flex-wrap: wrap;
			justify-content: center;
			gap: 8px 10px;
			padding: 8px 4px 12px;
		}
		.desk-zones {
			display: flex;
			flex-direction: column;
			height: auto;
			padding: 4px 4px 0;
			gap: 10px;
		}
		.desk-zone {
			padding: 22px 6px 10px;
		}
		.zone-sign {
			font-size: 9px;
		}
		.zone-sign b {
			font-size: 8px;
		}
		.trader-row {
			flex-wrap: wrap;
			justify-content: center;
			align-items: flex-end;
			gap: 4px 2px;
			padding-top: 8px;
		}
		.trader-row :global(.character) {
			flex: 0 1 auto;
			width: 96px;
			max-width: 110px;
			min-width: 84px;
		}
		.trader-row :global(.character:nth-child(even)) {
			transform: none;
		}
		.aisle {
			flex-direction: row;
			justify-content: center;
			gap: 10px;
			padding: 6px 0;
			font-size: 8px;
			letter-spacing: 0.16em;
		}
		.aisle br {
			display: none;
		}
		.aisle i {
			width: 28px;
			height: 3px;
			margin: 0;
			background: repeating-linear-gradient(90deg, #b38961 0 6px, transparent 6px 12px);
		}
		.lounge {
			display: none; /* avoid overlap when floor stacks */
		}

		/* Foreground desk: flex layout for key controls; hide overflow props */
		.foreground-desk {
			height: auto;
			min-height: 0;
			padding: 12px 10px 18px;
			display: grid;
			grid-template-columns: 1fr;
			gap: 10px;
		}
		.desk-edge {
			display: none;
		}
		.book-stack,
		.wsj,
		.keyboard-main,
		.phone-main,
		.calculator,
		.coffee {
			display: none;
		}
		.legal-pad {
			position: relative;
			left: auto;
			top: auto;
			width: 100%;
			max-width: 280px;
			height: auto;
			min-height: 72px;
			margin: 0 auto;
			transform: none;
			font-size: 10px;
		}
		.foreground-monitor {
			position: relative;
			left: auto;
			bottom: auto;
			width: 100%;
			max-width: 420px;
			height: 200px;
			margin: 0 auto;
		}
		.monitor-foot {
			left: 50%;
			transform: translateX(-50%);
		}
		.desk-pair-pad {
			position: relative;
			left: auto;
			top: auto;
			width: 100%;
			max-width: 280px;
			margin: 0 auto;
			transform: none;
			justify-content: space-between;
			padding: 8px 10px;
			font-size: 9px;
		}
		.desk-pair-pad select {
			font-size: 12px;
			padding: 6px 8px;
			min-height: 36px;
			flex: 1;
		}

		.clipboard-panel {
			width: min(246px, calc(100vw - 16px));
			font-size: inherit;
		}
		.clipboard-panel header strong {
			font-size: 13px;
		}
		.clipboard-panel dl div,
		.panel-status {
			font-size: 9px;
		}
		.clip {
			left: 50%;
			transform: translateX(-50%);
			width: 84px;
			height: 24px; /* larger drag handle */
		}
		.wire-status {
			width: min(180px, calc(100vw - 24px));
			padding: 10px;
		}
		.wire-status strong {
			font-size: 16px;
		}
		.wire-status div,
		.wire-status small {
			font-size: 8px;
		}
	}

	/* Phone (~375px): tighter skyline crop, denser trader wrap, safer overlays */
	@media (max-width: 480px) {
		.window-wall {
			height: 120px;
			padding: 6px 4px 0;
			gap: 4px;
		}
		.panoramic-skyline {
			inset: 6px 4px 0;
		}
		.window-wall::after {
			inset: 6px 4px 0;
		}
		.window-pane {
			border-width: 3px;
			border-bottom-width: 6px;
		}
		.fund-sign {
			flex-wrap: wrap;
		}
		.monogram {
			width: 36px;
			height: 36px;
			font-size: 11px;
		}
		.whiteboard {
			display: none; /* reclaim vertical space on phone */
		}
		.channel-switch {
			flex-wrap: wrap;
		}
		.channel-switch select {
			width: 100%;
			max-width: 100%;
			font-size: 12px;
		}
		.back-staff :global(.character) {
			width: 88px;
			max-width: 96px;
		}
		.trader-row :global(.character) {
			width: 72px;
			min-width: 68px;
			max-width: 88px;
		}
		.foreground-monitor {
			height: 180px;
		}
		.pinned-head,
		.pinned-risk {
			font-size: 8px;
		}
		.clipboard-panel {
			width: calc(100vw - 16px);
			max-height: calc(100vh - 24px);
			overflow-y: auto;
			-webkit-overflow-scrolling: touch;
		}
		.clipboard-panel header {
			flex-wrap: wrap;
		}
		.error-note {
			left: 8px;
			right: 8px;
			bottom: max(8px, env(safe-area-inset-bottom, 8px));
			font-size: 10px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.coffee b {
			animation: none;
		}
	}
</style>
