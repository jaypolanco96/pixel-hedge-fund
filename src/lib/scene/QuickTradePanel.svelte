<script lang="ts">
	import { SYMBOLS } from '$lib/data/symbols';
	import { TRADERS } from '$lib/characters/cast';
	import type { QuoteResponse, SignalResponse, Side } from '$lib/data/types';
	import type {
		BloFinBalanceResponse,
		BloFinHealth,
		BloFinMarginMode,
		BloFinOrderType,
		BloFinPositionsResponse,
		BloFinTradeWriteResponse
	} from '$lib/data/blofinTypes';
	import type { BybitBalanceResponse, BybitHealth, BybitTradeWriteResponse } from '$lib/data/bybitTypes';
	import {
		displayToBloFinInstId,
		newIntentId,
		orderSideFromTradeSide,
		positionSideFromTradeSide,
		sizeFromFundsPct,
		type BloFinTradeIntent
	} from '$lib/data/blofinTrade';
	import { removeTradeIntent, upsertTradeIntent } from '$lib/persist/blofinTradeIntents';
	import {
		assignPosition,
		loadBloFinAssignments,
		saveBloFinAssignments,
		type BloFinAssignments
	} from '$lib/persist/blofinAssignments';
	import { loadLeverageOverrides } from '$lib/persist/leverage';
	import { formatExchangeError, toastErr, toastOk } from '$lib/ui/toast';
	import { exchangeFetch } from '$lib/client/exchangeHeaders';
	import { bybitSpotSymbol, resolveSymbol } from '$lib/data/symbols';

	type LeveragedToken = {
		exchange: 'bybit' | 'blofin';
		symbol: string;
		instId: string;
		base: string;
		quote: string;
		label: string;
	};

	const FUNDS_PCT_KEY = 'phf-quick-funds-pct';

	function loadFundsPct(): number {
		try {
			const raw = localStorage.getItem(FUNDS_PCT_KEY);
			if (raw == null) return 5;
			const n = Number(raw);
			if (Number.isFinite(n) && n >= 0 && n <= 100) return n;
		} catch {
			/* private mode */
		}
		return 5;
	}

	function persistFundsPct(n: number) {
		try {
			localStorage.setItem(FUNDS_PCT_KEY, String(n));
		} catch {
			/* ignore */
		}
	}

	let {
		open = $bindable(false),
		activeDisplay = 'SOLUSDT',
		quote = null,
		signal = null,
		priceDecimals = 2,
		presetTraderId = null as string | null,
		onSelectSymbol = (_d: string) => {},
		onAssignmentsChange = (_a: BloFinAssignments) => {}
	}: {
		open?: boolean;
		activeDisplay?: string;
		quote?: QuoteResponse | null;
		signal?: SignalResponse | null;
		priceDecimals?: number;
		/** When set (floor click), apply trader side + leverage on open. */
		presetTraderId?: string | null;
		onSelectSymbol?: (display: string) => void;
		onAssignmentsChange?: (a: BloFinAssignments) => void;
	} = $props();

	let side = $state<Side>('long');
	let exchange = $state<'blofin' | 'bybit'>('blofin');
	let marketType = $state<'futures' | 'spot'>('futures');
	let fundsPct = $state(loadFundsPct());
	let leverage = $state(10);
	let traderId = $state('L10');
	let marginMode = $state<BloFinMarginMode>('isolated');
	let orderType = $state<BloFinOrderType>('market');
	let limitPrice = $state<number | null>(null);
	let reduceOnly = $state(false);
	let overrideLev = $state(false);
	let lastAppliedPreset = $state<string | null>(null);
	let leveragedTokens = $state<LeveragedToken[]>([]);
	let tokenSelection = $state('');
	let tokenMark = $state(0);
	let tokenLoading = $state(false);

	let health = $state<BloFinHealth | null>(null);
	let balance = $state<BloFinBalanceResponse | null>(null);
	let bybitHealth = $state<BybitHealth | null>(null);
	let bybitBalance = $state<BybitBalanceResponse | null>(null);
	let loadingBal = $state(false);
	let pending = $state<BloFinTradeIntent | null>(null);
	let confirmOpen = $state(false);
	let sending = $state(false);
	let statusMsg = $state<string | null>(null);
	let statusErr = $state(false);

	const activeToken = $derived(
		leveragedTokens.find((t) => t.exchange === exchange && t.symbol === tokenSelection) ?? null
	);
	const availableTokens = $derived(leveragedTokens.filter((t) => t.exchange === exchange));
	const isLeveragedToken = $derived(!!activeToken);
	const pendingIsLeveragedToken = $derived(
		!!pending && pending.marketType === 'spot' && pending.takeProfitPrice == null && pending.stopLossPrice == null
	);
	const mark = $derived(isLeveragedToken ? tokenMark : quote?.mark || quote?.price || 0);
	const availableEquity = $derived.by(() => {
		if (exchange === 'bybit') {
			return bybitBalance?.coins.find((c) => c.coin.toUpperCase() === 'USDT')?.available ?? bybitBalance?.totalEquityUsd ?? 0;
		}
		if (!balance?.ok) return 0;
		const usdt = balance.details.find((d) => d.currency.toUpperCase() === 'USDT');
		if (usdt) return usdt.available;
		if (balance.totalEquityUsd != null) return balance.totalEquityUsd;
		return balance.details.reduce((s, d) => s + d.available, 0);
	});
	const sizing = $derived(
		marketType === 'spot'
			? (() => {
				const margin = Math.max(0, availableEquity) * (Math.min(100, Math.max(0, fundsPct)) / 100);
				return { margin, notional: margin, size: mark > 0 ? margin / mark : 0 };
			})()
			: sizeFromFundsPct({ availableEquity, fundsPct, leverage, markPrice: mark })
	);
	const assigned = $derived(TRADERS.find((t) => t.id === traderId) ?? null);
	const sideTraders = $derived(TRADERS.filter((t) => t.side === side));
	const writesReady = $derived(exchange === 'bybit' ? !!bybitHealth?.configured && bybitHealth.reachable !== false : !!health?.writesEnabled);
	const networkBlocked = $derived(
		exchange === 'bybit' ? !!bybitHealth?.configured && bybitHealth.reachable === false : !!health?.configured && (!!health?.networkBlocked || health?.reachable === false)
	);
	const activeConfigured = $derived(exchange === 'bybit' ? !!bybitHealth?.configured : !!health?.configured);
	const activeLive = $derived(exchange === 'bybit' ? activeConfigured && !networkBlocked : health?.mode === 'live');
	const instId = $derived(
		activeToken
			? activeToken.instId
			: exchange === 'bybit'
			? marketType === 'spot'
				? bybitSpotSymbol(resolveSymbol(activeDisplay))
				: resolveSymbol(activeDisplay).bybit
			: displayToBloFinInstId(activeDisplay)
	);
	const protection = $derived.by(() => {
		if (isLeveragedToken || !signal || !Number.isFinite(mark) || mark <= 0) return null;
		const aligned = signal.bias === side.toUpperCase();
		const stop = signal.risk.stop;
		const takeProfit = signal.risk.tp1;
		const valid = side === 'long' ? stop < mark && takeProfit > mark : stop > mark && takeProfit < mark;
		return aligned && valid
			? { stopLoss: stop, takeProfit, sample: signal.sample }
			: null;
	});

	function close() {
		confirmOpen = false;
		open = false;
	}

	function onKey(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			if (confirmOpen) {
				confirmOpen = false;
				return;
			}
			close();
		}
	}

	function fmt(n: number, d = 2) {
		if (!Number.isFinite(n)) return '—';
		return n.toFixed(d);
	}

	function setSide(s: Side) {
		side = s;
		const match = TRADERS.find((t) => t.side === s && t.id === traderId);
		if (!match) {
			const first = TRADERS.find((t) => t.side === s);
			if (first) {
				traderId = first.id;
				if (!overrideLev) leverage = first.leverage;
			}
		}
	}

	function onExchangeChange() {
		if (activeToken?.exchange !== exchange) tokenSelection = '';
		loadAccount();
	}

	async function loadLeveragedTokens() {
		tokenLoading = true;
		try {
			const res = await exchangeFetch('/api/market/leveraged-tokens');
			if (!res.ok) throw new Error(`Token list HTTP ${res.status}`);
			const body = (await res.json()) as { tokens?: LeveragedToken[] };
			leveragedTokens = Array.isArray(body.tokens) ? body.tokens : [];
		} catch (e) {
			leveragedTokens = [];
			statusMsg = `Leveraged token list unavailable · ${e instanceof Error ? e.message : String(e)}`;
			statusErr = true;
		} finally {
			tokenLoading = false;
		}
	}

	async function loadTokenMark(token: LeveragedToken) {
		try {
			const res = await exchangeFetch(`/api/market/leveraged-token-quote?exchange=${token.exchange}&symbol=${encodeURIComponent(token.instId)}`);
			const body = (await res.json()) as { price?: number; mark?: number };
			const price = Number(body.mark ?? body.price ?? 0);
			tokenMark = Number.isFinite(price) ? price : 0;
		} catch {
			tokenMark = 0;
		}
	}

	function onTokenChange() {
		if (!activeToken) {
			tokenMark = 0;
			return;
		}
		marketType = 'spot';
		void loadTokenMark(activeToken);
	}

	function onRegularSymbolChange(e: Event) {
		tokenSelection = '';
		onSelectSymbol((e.currentTarget as HTMLSelectElement).value);
	}

	function onTraderChange(e: Event) {
		const id = (e.currentTarget as HTMLSelectElement).value;
		applyTrader(id);
	}

	/** Resolve desk leverage (floor override wins over cast default). */
	function leverageForTrader(id: string, castLev: number): number {
		const ov = loadLeverageOverrides()[id];
		return ov != null ? ov : castLev;
	}

	function applyTrader(id: string) {
		const t = TRADERS.find((x) => x.id === id);
		if (!t) return;
		traderId = t.id;
		side = t.side;
		if (!overrideLev) leverage = leverageForTrader(t.id, t.leverage);
	}

	function positionIdFromOrderData(data: unknown): string | null {
		if (data == null) return null;
		const rows = Array.isArray(data) ? data : [data];
		for (const row of rows) {
			if (!row || typeof row !== 'object') continue;
			const r = row as Record<string, unknown>;
			const pid = r.positionId ?? r.posId;
			if (typeof pid === 'string' && pid) return pid;
			if (typeof pid === 'number' && Number.isFinite(pid)) return String(pid);
		}
		return null;
	}

	async function maybeAssignToTrader(
		trader: string,
		instId: string,
		positionSide: string,
		orderData: unknown
	) {
		let posId = positionIdFromOrderData(orderData);
		if (!posId) {
			try {
				const pRes = await exchangeFetch('/api/blofin/positions');
				const pos = (await pRes.json()) as BloFinPositionsResponse;
				if (pos?.ok && Array.isArray(pos.positions)) {
					const match = pos.positions.find(
						(p) =>
							p.instId === instId &&
							(p.positionSide === positionSide || p.side === positionSide) &&
							p.size > 0
					);
					posId = match?.positionId ?? null;
				}
			} catch {
				/* assignment is optional */
			}
		}
		if (!posId) return;
		const next = assignPosition(loadBloFinAssignments(), posId, trader);
		saveBloFinAssignments(next);
		onAssignmentsChange(next);
	}

	async function loadAccount() {
		loadingBal = true;
		try {
			if (exchange === 'bybit') {
				const [hRes, bRes] = await Promise.all([
					exchangeFetch('/api/bybit/health'),
					exchangeFetch('/api/bybit/balance')
				]);
				bybitHealth = (await hRes.json()) as BybitHealth;
				bybitBalance = (await bRes.json()) as BybitBalanceResponse;
				return;
			}
			const [hRes, bRes] = await Promise.all([
				exchangeFetch('/api/blofin/health'),
				exchangeFetch('/api/blofin/balance')
			]);
			health = (await hRes.json()) as BloFinHealth;
			balance = (await bRes.json()) as BloFinBalanceResponse;
		} catch (e) {
			statusErr = true;
			statusMsg = e instanceof Error ? e.message : String(e);
			toastErr('Order failed', statusMsg);
		} finally {
			loadingBal = false;
		}
	}

	function buildIntent(): BloFinTradeIntent {
		const sz = sizing;
		return {
			id: pending?.id ?? newIntentId(),
			createdAt: new Date().toISOString(),
			traderId,
			instId,
			exchange,
			display: activeToken?.symbol ?? activeDisplay,
			fundsPct,
			marketType,
			marginMode,
			positionSide: positionSideFromTradeSide(side),
			side: orderSideFromTradeSide(side),
			leverage,
			orderType,
			price: orderType === 'limit' ? limitPrice : null,
			reduceOnly,
			estSize: sz.size,
			estNotional: sz.notional,
			estMargin: sz.margin,
			availableEquity,
			markPrice: mark,
			stopLossPrice: protection?.stopLoss ?? null,
			takeProfitPrice: protection?.takeProfit ?? null,
			signalSample: protection?.sample ?? false,
			source: 'quick'
		};
	}

	
	function clientPrecheck(): string | null {
		if (!(fundsPct > 0)) return 'Percent of funds must be > 0';
		if (fundsPct > 100) return '% funds cannot exceed 100';
		if (!(leverage >= 1)) return 'Leverage must be ≥ 1';
		if (leverage > 125) return 'Leverage over max (125×)';
		if (!(sizing.size > 0)) return 'Size is empty — check % funds / mark / equity';
		if (availableEquity <= 0) return 'No available equity loaded';
		if (!isLeveragedToken && !protection) return 'No valid TP1 / Supertrend stop for this side — wait for an aligned Chart Desk signal';
		if (orderType === 'limit' && !(limitPrice && limitPrice > 0)) return 'Limit order needs a price';
		return null;
	}

	function storeIntent() {
		const intent = buildIntent();
		if (!(intent.estSize > 0)) {
			statusErr = true;
			statusMsg = 'Size is zero — check % funds / mark / equity';
			return;
		}
		if (orderType === 'limit' && !(intent.price && intent.price > 0)) {
			statusErr = true;
			statusMsg = 'Limit orders need a price';
			return;
		}
		upsertTradeIntent(intent);
		pending = intent;
		statusErr = false;
		statusMsg = `Intent stored · ${intent.instId} ${intent.side} · ${fmt(intent.estSize, 4)} cts`;
	}

	function requestSend() {
		const pre = clientPrecheck();
		if (pre) {
			statusErr = true;
			statusMsg = pre;
			toastErr('Check order', pre);
			return;
		}
		storeIntent();
		if (!(pending && pending.estSize > 0)) return;
		if (!writesReady) {
			statusErr = true;
			statusMsg = `${exchange === 'bybit' ? 'Bybit' : 'BloFin'} keys not configured or unreachable — open Desk LOGIN`;
			toastErr('Keys missing', statusMsg);
			return;
		}
		if (networkBlocked) {
			statusErr = true;
			statusMsg = `${exchange === 'bybit' ? 'Bybit' : 'BloFin'} network blocked — cannot place live order`;
			toastErr('Network blocked', statusMsg);
			return;
		}
		confirmOpen = true;
	}

	async function confirmLiveOrder() {
		if (!pending || sending) return;
		sending = true;
		statusErr = false;
		statusMsg = 'Sending live order…';
		try {
			if (exchange === 'bybit') {
				const bybitRes = await exchangeFetch('/api/bybit/order', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						category: pending.marketType === 'spot' ? 'spot' : 'linear',
						symbol: pending.instId,
						side: pending.side === 'buy' ? 'Buy' : 'Sell',
						orderType: pending.orderType === 'market' ? 'Market' : 'Limit',
						qty: String(Number(pending.estSize.toFixed(pending.marketType === 'spot' ? 8 : 4))),
						price: pending.orderType === 'limit' ? String(pending.price) : undefined,
						...(pending.marketType === 'spot'
							? {
								marketUnit: 'baseCoin',
								...(pending.takeProfitPrice != null && pending.stopLossPrice != null
									? {
										takeProfit: String(pending.takeProfitPrice),
										stopLoss: String(pending.stopLossPrice),
										tpOrderType: 'Market',
										slOrderType: 'Market'
									}
									: {})
							}
							: {
								positionIdx: pending.positionSide === 'long' ? 1 : 2,
								reduceOnly: pending.reduceOnly,
								takeProfit: String(pending.takeProfitPrice),
								stopLoss: String(pending.stopLossPrice),
								tpTriggerBy: 'MarkPrice',
								slTriggerBy: 'MarkPrice'
							}
						)
					})
				});
				const bybit = (await bybitRes.json()) as BybitTradeWriteResponse;
				if (!bybit.ok) throw new Error(formatExchangeError(bybit));
				const placed = pending;
				removeTradeIntent(pending.id);
				statusMsg = `BYBIT LIVE OK · ${pending.instId} ${pending.side} · ${fmt(pending.estSize, 4)}`;
				toastOk('Bybit order live', statusMsg);
				statusErr = false;
				confirmOpen = false;
				pending = null;
				await loadAccount();
				return;
			}

			if (pending.marketType === 'spot') {
				const spotRes = await exchangeFetch('/api/blofin/spot-order', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						instType: 'SPOT',
						instId: pending.instId,
						side: pending.side,
						orderType: pending.orderType,
						size: String(Number(pending.estSize.toFixed(8))),
						price: pending.orderType === 'limit' ? String(pending.price) : undefined,
						targetCurrency: 'base_currency'
					})
				});
				const spot = (await spotRes.json()) as BloFinTradeWriteResponse;
				if (!spot.ok) throw new Error(formatExchangeError(spot));
				removeTradeIntent(pending.id);
				statusMsg = `BLOFIN SPOT LIVE OK · ${pending.instId} · ${fmt(pending.estSize, 8)}`;
				toastOk('BloFin spot order live', statusMsg);
				statusErr = false;
				confirmOpen = false;
				pending = null;
				await loadAccount();
				return;
			}

			const mmRes = await exchangeFetch('/api/blofin/margin-mode', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ marginMode: pending.marginMode })
			});
			const mm = (await mmRes.json()) as BloFinTradeWriteResponse;
			if (!mm.ok) throw new Error(formatExchangeError(mm));

			const levRes = await exchangeFetch('/api/blofin/leverage', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					instId: pending.instId,
					leverage: pending.leverage,
					marginMode: pending.marginMode,
					positionSide: pending.positionSide
				})
			});
			const lev = (await levRes.json()) as BloFinTradeWriteResponse;
			if (!lev.ok) throw new Error(formatExchangeError(lev));

			const orderBody: Record<string, unknown> = {
				instId: pending.instId,
				marginMode: pending.marginMode,
				side: pending.side,
				orderType: pending.orderType,
				size: String(Number(pending.estSize.toFixed(4))),
				positionSide: pending.positionSide
			};
			if (pending.takeProfitPrice != null && pending.stopLossPrice != null) {
				orderBody.tpTriggerPrice = String(pending.takeProfitPrice);
				orderBody.tpOrderPrice = '-1';
				orderBody.tpTriggerPriceType = 'mark';
				orderBody.slTriggerPrice = String(pending.stopLossPrice);
				orderBody.slOrderPrice = '-1';
				orderBody.slTriggerPriceType = 'mark';
			}
			if (pending.orderType === 'limit' && pending.price != null) {
				orderBody.price = String(pending.price);
			}
			if (pending.reduceOnly) orderBody.reduceOnly = true;

			const oRes = await exchangeFetch('/api/blofin/order', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(orderBody)
			});
			const ord = (await oRes.json()) as BloFinTradeWriteResponse;
			if (!ord.ok) throw new Error(formatExchangeError(ord));

			const placed = pending;
			removeTradeIntent(pending.id);
			statusMsg = `LIVE OK · ${pending.instId} ${pending.side} · ${fmt(pending.estSize, 4)}`;
			toastOk('Order live', statusMsg);
			statusErr = false;
			confirmOpen = false;
			pending = null;
			if (placed.traderId) {
				await maybeAssignToTrader(
					placed.traderId,
					placed.instId,
					placed.positionSide,
					ord.data
				);
			}
			await loadAccount();
		} catch (e) {
			statusErr = true;
			statusMsg = e instanceof Error ? e.message : String(e);
			toastErr('Order failed', statusMsg);
		} finally {
			sending = false;
		}
	}

	$effect(() => {
		persistFundsPct(fundsPct);
	});

	$effect(() => {
		if (!open) {
			lastAppliedPreset = null;
			return;
		}
		const preset = presetTraderId;
		if (preset && preset !== lastAppliedPreset) {
			applyTrader(preset);
			lastAppliedPreset = preset;
			overrideLev = false;
		} else if (!TRADERS.some((t) => t.id === traderId)) {
			traderId = side === 'long' ? 'L10' : 'S10';
		}
		void loadAccount();
		void loadLeveragedTokens();
	});

	$effect(() => {
		if (activeToken) {
			marketType = 'spot';
			void loadTokenMark(activeToken);
		} else {
			tokenMark = 0;
		}
	});
</script>

<svelte:window onkeydown={onKey} />

{#if open}
	<div class="backdrop" role="presentation" onclick={close}></div>
	<div class="console" role="dialog" aria-modal="true" aria-label="Create position — fund trader with percent equity">
		<header class="titlebar">
			<div class="leds">
				<i class:on={writesReady} class:warn={!writesReady}></i>
				<i class:live={activeLive}></i>
				<i class:ok={activeConfigured && !networkBlocked}></i>
			</div>
			<strong>CREATE POSITION · {exchange.toUpperCase()} · {activeLive ? 'LIVE' : '—'}</strong>
			<button type="button" class="x" onclick={close} aria-label="Close quick trade">×</button>
		</header>

		{#if networkBlocked && activeConfigured}
			<div class="banner warn">{exchange === 'bybit' ? 'Bybit' : 'BloFin'} unreachable from this network. Keys OK — use VPN or deploy server-side.</div>
		{:else if exchange === 'blofin' && health?.fromSnapshot}
			<div class="banner cache">SNAPSHOT / CACHE — offline desk copy (not demo)</div>
		{:else if writesReady}
			<div class="banner live">FUND TRADER WITH % EQUITY · Confirm LIVE required before POST</div>
		{:else}
			<div class="banner warn">{exchange.toUpperCase()} KEYS NOT SET · open Desk LOGIN (browser session)</div>
		{/if}

		<div class="body">
			<p class="cta-sub">Fund trader with % available USDT equity · {activeDisplay}</p>

			<label class="field hero-funds">
				<span class="hero-label">% OF FUNDS</span>
				<div class="hero-pct">{fmt(fundsPct, 0)}%</div>
				<input type="range" min="0" max="100" step="1" bind:value={fundsPct} aria-label="Percent of funds" />
				<input type="number" min="0" max="100" step="0.1" bind:value={fundsPct} aria-label="Percent of funds number" />
				<em class="hero-hint">0% = no order · {marketType === 'spot' ? 'spot size = funds ÷ mark' : 'futures size = funds × leverage ÷ mark'}</em>
			</label>

			<label class="field">
				<span>EXCHANGE</span>
				<select bind:value={exchange} onchange={onExchangeChange}>
					<option value="blofin">BloFin</option>
					<option value="bybit">Bybit</option>
				</select>
			</label>

			<label class="field">
				<span>MARKET</span>
				<select bind:value={marketType} aria-label="Market type">
					<option value="futures">FUTURES / PERPETUAL</option>
					<option value="spot">SPOT</option>
				</select>
			</label>

			<label class="field">
				<span>FLOOR TRADER</span>
				<select value={traderId} onchange={onTraderChange}>
					{#each sideTraders as t (t.id)}
						<option value={t.id}>{t.id} {t.name} ({t.leverage}× {t.side})</option>
					{/each}
				</select>
			</label>

			<div class="sides">
				<button type="button" class:on={side === 'long'} onclick={() => setSide('long')}>LONG</button>
				<button type="button" class:on={side === 'short'} class="short" onclick={() => setSide('short')}
					>SHORT</button
				>
			</div>

			<label class="field">
				<span>SYMBOL</span>
				<select
					value={activeDisplay}
					onchange={onRegularSymbolChange}
				>
					{#each SYMBOLS as s (s.display)}
						<option value={s.display}>{s.display}</option>
					{/each}
				</select>
			</label>

			<label class="field">
				<span>LEVERAGED TOKEN {tokenLoading ? '· loading…' : ''}</span>
				<select bind:value={tokenSelection} onchange={onTokenChange} aria-label="Leveraged token">
					<option value="">REGULAR SYMBOL</option>
					{#each availableTokens as token (token.exchange + token.instId)}
						<option value={token.symbol}>{token.label}</option>
					{/each}
				</select>
				<em class="field-note">{isLeveragedToken ? 'Spot product · no liquidation · venue token price' : 'Venue-listed 3L / 3S and similar spot products appear here'}</em>
			</label>

			<label class="field">
				<span>MARGIN MODE</span>
				<select bind:value={marginMode}>
					<option value="isolated">isolated</option>
					<option value="cross">cross</option>
				</select>
			</label>

			<label class="field" class:disabled-field={marketType === 'spot'}>
				<span>LEVERAGE {overrideLev ? '(override)' : '(from trader)'}</span>
				<input type="number" min="1" max="125" step="1" bind:value={leverage} aria-label="Leverage" disabled={marketType === 'spot'} />
				<label class="check">
					<input type="checkbox" bind:checked={overrideLev} />
					override trader desk leverage
				</label>
			</label>

			<label class="field">
				<span>ORDER TYPE</span>
				<select bind:value={orderType}>
					<option value="market">market</option>
					<option value="limit">limit</option>
				</select>
			</label>

			{#if orderType === 'limit'}
				<label class="field">
					<span>LIMIT PRICE</span>
					<input type="number" min="0" step="any" bind:value={limitPrice} aria-label="Limit price" />
				</label>
			{/if}

			<label class="check">
				<input type="checkbox" bind:checked={reduceOnly} />
				reduce-only
			</label>

			<dl class="preview">
				<div><dt>INST</dt><dd class="mono">{instId}</dd></div>
				<div><dt>MARK</dt><dd>{mark ? fmt(mark, priceDecimals) : '—'}</dd></div>
				<div><dt>AVAIL EQ</dt><dd>${fmt(availableEquity, 2)}{loadingBal ? ' …' : ''}</dd></div>
			<div><dt>{marketType === 'spot' ? 'FUNDS' : 'MARGIN'}</dt><dd>${fmt(sizing.margin, 2)}</dd></div>
			<div><dt>{marketType === 'spot' ? 'VALUE' : 'NOTIONAL'}</dt><dd>${fmt(sizing.notional, 2)}</dd></div>
				<div><dt>EST SIZE</dt><dd>{fmt(sizing.size, 4)} cts</dd></div>
				<div><dt>STOP / TP1</dt><dd>{isLeveragedToken ? 'SPOT EXIT PLAN' : protection ? `${fmt(protection.stopLoss, priceDecimals)} / ${fmt(protection.takeProfit, priceDecimals)}` : 'WAITING FOR ALIGNED SIGNAL'}</dd></div>
				<div>
					<dt>ASSIGNED</dt>
					<dd>{assigned ? `${assigned.name} · ${assigned.side.toUpperCase()}` : '—'}</dd>
				</div>
			</dl>

			{#if statusMsg}
				<p class="status" class:bad={statusErr}>{statusMsg}</p>
			{/if}

			<div class="actions">
				<button type="button" class="ghost" onclick={storeIntent}>STORE INTENT</button>
				<button
					type="button"
					class="send"
					disabled={!writesReady || sizing.size <= 0 || fundsPct <= 0 || sending}
					onclick={requestSend}
				>
					CREATE POSITION
				</button>
			</div>
			<p class="hint">{isLeveragedToken ? 'Leveraged token is a spot product; TP1 / SL are an exit plan and are not attached to the entry.' : marketType === 'spot' ? 'Spot entry only; TP1 / SL are shown as the current plan.' : 'Create attaches full-size TP1 + Supertrend SL at mark, then arms CONFIRM LIVE.'} Esc / × closes.</p>
		</div>
		<footer>
			{networkBlocked ? 'NETWORK BLOCKED' : writesReady ? 'LIVE READY' : 'KEYS MISSING'} · CONFIRM LIVE required · never auto-fires · key {FUNDS_PCT_KEY}
		</footer>
	</div>

	{#if confirmOpen && pending}
		<div class="confirm-backdrop" role="presentation"></div>
		<div class="confirm" role="alertdialog" aria-modal="true" aria-label="Confirm live order">
			<strong>LIVE ORDER — confirm</strong>
			<p>
				{pending.instId} · {pending.side.toUpperCase()} · {pending.positionSide} · {pending.marginMode}<br />
				{pending.orderType} · {pending.leverage}× · size {fmt(pending.estSize, 4)} · notional ${fmt(pending.estNotional, 2)}
				{#if pending.orderType === 'limit'}
					<br />limit @ {pending.price}
				{/if}
				{#if pending.reduceOnly}
					<br />reduce-only
				{/if}
				{#if pending.signalSample}<br />SAMPLE signal — verify before sending{/if}
			</p>
			<div class="confirm-levels" aria-label="Attached take profit and stop loss">
				<div><span>TP1</span><b>{pendingIsLeveragedToken ? 'SPOT EXIT' : fmt(pending.takeProfitPrice ?? 0, priceDecimals)}</b></div>
				<div><span>SL</span><b>{pendingIsLeveragedToken ? 'SPOT EXIT' : fmt(pending.stopLossPrice ?? 0, priceDecimals)}</b></div>
			<small>{pendingIsLeveragedToken ? 'Leveraged token · no TP/SL attached · sell to exit' : pending.marketType === 'spot' ? (pending.exchange === 'bybit' ? 'Bybit spot TP1 / SL attached · market exits' : 'BloFin spot plan shown for review · protection is not attached to the entry') : 'Attached protection · mark-price triggers · market exits'}</small>
			</div>
			<div class="confirm-actions">
				<button type="button" class="ghost" disabled={sending} onclick={() => (confirmOpen = false)}>CANCEL</button>
				<button type="button" class="danger" disabled={sending} onclick={confirmLiveOrder}>
					{sending ? 'SENDING…' : 'LIVE ORDER — confirm'}
				</button>
			</div>
		</div>
	{/if}
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 200000;
		background: rgba(8, 4, 2, 0.62);
	}
	.console {
		position: fixed;
		z-index: 200001;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(440px, calc(100vw - 24px));
		max-height: min(760px, calc(100vh - 24px));
		display: flex;
		flex-direction: column;
		background: #120e06;
		color: #e3d072;
		border: 4px solid #5a4a2f;
		box-shadow:
			0 0 0 2px #1a140a,
			8px 8px 0 rgba(0, 0, 0, 0.55),
			inset 0 0 40px rgba(255, 200, 80, 0.06);
		font-family: var(--mono, 'Courier New', monospace);
	}
	.titlebar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		background: #1f180c;
		border-bottom: 2px solid #5a4a2f;
		font-size: 10px;
		letter-spacing: 0.08em;
	}
	.leds { display: flex; gap: 4px; }
	.leds i {
		width: 8px; height: 8px; border-radius: 50%;
		background: #2e2a1a; border: 1px solid #5a4a2f;
	}
	.leds i.warn { background: #efc870; box-shadow: 0 0 6px #efc870; }
	.leds i.on { background: #59cf84; box-shadow: 0 0 6px #59cf84; }
	.leds i.live { background: #ff766a; box-shadow: 0 0 6px #ff766a; }
	.leds i.ok { background: #59cf84; box-shadow: 0 0 6px #59cf84; }
	.titlebar strong { flex: 1; }
	.x {
		background: transparent; border: 1px solid #5a4a2f; color: #e3d072;
		width: 24px; height: 24px; cursor: pointer; font-size: 16px;
	}
	.banner {
		padding: 7px 10px; background: #3a2810; border-bottom: 2px solid #8a6a30;
		color: #ffe0a0; font-size: 8px; letter-spacing: 0.04em; text-align: center;
	}
	.banner.live { background: #2a1410; border-color: #8f392f; color: #ffb0a4; }
	.banner.cache { background: #1a2a22; border-color: #3d6b52; color: #8fd4a8; }
	.banner.warn { background: #2a2410; border-color: #5a4a28; color: #e8c976; }
	.body { padding: 12px; overflow: auto; display: flex; flex-direction: column; gap: 10px; }
	.cta-sub { margin: 0; font-size: 8px; letter-spacing: 0.06em; opacity: 0.75; color: #efc870; }
	.hero-funds {
		padding: 10px; background: #1a140a; border: 2px solid #8a6a30;
		box-shadow: inset 0 0 20px rgba(255, 200, 80, 0.08);
	}
	.hero-label { font-size: 9px; letter-spacing: 0.12em; color: #ffe0a0; }
	.hero-pct {
		font-size: 28px; font-weight: 900; line-height: 1.1; color: #ffe9a8;
		text-shadow: 0 0 12px rgba(255, 200, 80, 0.35);
	}
	.hero-hint { font-size: 7px; opacity: 0.65; font-style: normal; letter-spacing: 0.03em; }
	.field-note { font-size: 7px; opacity: 0.65; font-style: normal; letter-spacing: 0.02em; }
	.field { display: flex; flex-direction: column; gap: 4px; font-size: 8px; letter-spacing: 0.06em; }
	.field select,
	.field input[type='number'],
	.field input[type='range'] {
		background: #1a140a; border: 1px solid #5a4a2f; color: #efc870;
		font: 11px var(--mono, monospace); padding: 7px 8px;
	}
	.sides { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
	.sides button {
		padding: 8px; background: #1a140a; border: 2px solid #5a4a2f; color: #a09060;
		font: 10px var(--mono, monospace); letter-spacing: 0.1em; cursor: pointer;
	}
	.sides button.on { background: #1a3a28; border-color: #4a8a62; color: #7dffb0; }
	.sides button.short.on { background: #3a1a18; border-color: #8a4a42; color: #ff8a7a; }
	.check { display: flex; align-items: center; gap: 6px; font-size: 8px; letter-spacing: 0.04em; cursor: pointer; }
	.preview {
		display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; margin: 4px 0 0;
		padding: 8px; background: #1a140a; border: 1px solid #5a4a2f;
	}
	.preview div { display: flex; justify-content: space-between; gap: 8px; font-size: 9px; }
	.preview dt { opacity: 0.65; }
	.preview dd { margin: 0; font-weight: 700; }
	.mono { font-size: 8px; word-break: break-all; }
	.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
	.ghost, .send, .danger {
		padding: 10px; font: 9px var(--mono, monospace); letter-spacing: 0.08em; cursor: pointer;
	}
	.ghost { background: #2a2010; border: 2px dashed #6a5a30; color: #c8b870; }
	.send { background: #3a1a18; border: 2px solid #8a4a42; color: #ff8a7a; }
	.send:disabled, .danger:disabled { opacity: 0.45; cursor: not-allowed; }
	.status { margin: 0; font-size: 8px; color: #8fd4a8; }
	.status.bad { color: #ff8a7a; }
	.hint { margin: 0; font-size: 8px; opacity: 0.65; }
	footer {
		padding: 6px 10px; border-top: 2px solid #5a4a2f; font-size: 7px; opacity: 0.7; background: #1a140a;
	}
	.confirm-backdrop { position: fixed; inset: 0; z-index: 200010; background: rgba(0, 0, 0, 0.72); }
	.confirm {
		position: fixed; z-index: 200011; left: 50%; top: 50%; transform: translate(-50%, -50%);
		width: min(360px, calc(100vw - 32px)); padding: 14px; background: #2a100e;
		border: 3px solid #c66b59; color: #ffe0d9; font-family: var(--mono, monospace);
		box-shadow: 8px 8px 0 rgba(0, 0, 0, 0.55);
	}
	.confirm strong { display: block; font-size: 11px; letter-spacing: 0.1em; margin-bottom: 8px; color: #ff766a; }
	.confirm p { font-size: 9px; line-height: 1.5; margin: 0 0 12px; }
	.confirm-levels {
		display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 0 0 12px;
		padding: 8px; background: #160b09; border: 2px solid #8f392f;
	}
	.confirm-levels div { display: flex; justify-content: space-between; gap: 8px; font-size: 10px; }
	.confirm-levels span { color: #ffb0a4; }
	.confirm-levels b { color: #fff0d8; }
	.confirm-levels small { grid-column: 1 / -1; font-size: 7px; opacity: 0.75; }
	.confirm-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
	.danger { background: #8f392f; border: 2px solid #ff766a; color: #ffe0d9; }
</style>
