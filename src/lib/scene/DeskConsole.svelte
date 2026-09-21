<script lang="ts">
	import { untrack } from 'svelte';
	import { TRADERS } from '$lib/characters/cast';
	import type {
		BloFinBalanceResponse,
		BloFinHealth,
		BloFinOrdersResponse,
		BloFinPosition,
		BloFinPositionsResponse
	} from '$lib/data/blofinTypes';
	import {
		assignPosition,
		loadBloFinAssignments,
		saveBloFinAssignments,
		type BloFinAssignments
	} from '$lib/persist/blofinAssignments';
	import type { BloFinMarginMode, BloFinOrderType, BloFinTradeWriteResponse } from '$lib/data/blofinTypes';
	import {
		newIntentId,
		orderSideFromTradeSide,
		positionSideFromTradeSide,
		sizeFromFundsPct,
		type BloFinTradeIntent
	} from '$lib/data/blofinTrade';
	import { loadTradeIntents, removeTradeIntent, upsertTradeIntent } from '$lib/persist/blofinTradeIntents';
	import { formatExchangeError, toastErr, toastInfo, toastOk } from '$lib/ui/toast';
	import { exchangeFetch } from '$lib/client/exchangeHeaders';
	import {
		blofinStatusFromClient,
		bybitStatusFromClient,
		loadExchangeKeys,
		upsertBloFinClientKeys,
		upsertBybitClientKeys
	} from '$lib/client/exchangeKeys';

	type Tab = 'status' | 'account' | 'positions' | 'orders' | 'login';

	let {
		open = $bindable(false),
		onAssignmentsChange = (_a: BloFinAssignments) => {},
		onOverlayChange = (_o: Record<string, string>) => {}
	}: {
		open?: boolean;
		onAssignmentsChange?: (a: BloFinAssignments) => void;
		onOverlayChange?: (overlay: Record<string, string>) => void;
	} = $props();

	let tab = $state<Tab>('status');
	let loading = $state(false);
	let health = $state<BloFinHealth | null>(null);
	let balance = $state<BloFinBalanceResponse | null>(null);
	let positions = $state<BloFinPositionsResponse | null>(null);
	let orders = $state<BloFinOrdersResponse | null>(null);
	let assignments = $state<BloFinAssignments>({});
	let err = $state<string | null>(null);

	/** Per-position sync draft (assign stores intent; confirm POSTs). */
	let syncPct = $state<Record<string, number>>({});
	let syncMargin = $state<Record<string, BloFinMarginMode>>({});
	let syncLev = $state<Record<string, number>>({});
	let syncOrderType = $state<Record<string, BloFinOrderType>>({});
	let syncPrice = $state<Record<string, number | null>>({});
	let syncReduce = $state<Record<string, boolean>>({});
	let intents = $state<BloFinTradeIntent[]>([]);
	let confirmIntent = $state<BloFinTradeIntent | null>(null);
	let sending = $state(false);
	let tradeMsg = $state<string | null>(null);
	let tradeErr = $state(false);

	/* -- LOGIN (local secrets) -- */
	let blofinKey = $state('');
	let blofinSecret = $state('');
	let blofinPass = $state('');
	let blofinBrokerId = $state('');
	let blofinBase = $state('https://openapi.blofin.com');
	let bybitKey = $state('');
	let bybitSecret = $state('');
	let bybitPass = $state('');
	let bybitBrokerId = $state('');
	let bybitBase = $state('https://api.bybit.com');
	let keysStatus = $state<{
		ok?: boolean;
		blofin?: {
			configured: boolean;
			apiKeyMasked: string | null;
			secretMasked?: string | null;
			passphraseMasked?: string | null;
			brokerIdMasked?: string | null;
			baseUrl: string;
		};
		bybit?: {
			configured: boolean;
			apiKeyMasked: string | null;
			secretMasked?: string | null;
			passphraseMasked?: string | null;
			brokerIdMasked?: string | null;
			baseUrl: string;
		};
	} | null>(null);
	let keysBusy = $state(false);
	let keysMsg = $state<string | null>(null);
	let keysErr = $state(false);


	const availableEquity = $derived.by(() => {
		if (!balance?.ok) return 0;
		const usdt = balance.details.find((d) => d.currency.toUpperCase() === 'USDT');
		if (usdt) return usdt.available;
		if (balance.totalEquityUsd != null) return balance.totalEquityUsd;
		return balance.details.reduce((s, d) => s + d.available, 0);
	});
	/** Keys present - network block must NOT disable confirm. */
	const writesReady = $derived(!!health?.writesEnabled);
	const networkBlocked = $derived(
		!!health?.configured && (!!health?.networkBlocked || health?.reachable === false)
	);

	const longTraders = $derived(TRADERS.filter((t) => t.side === 'long'));
	const shortTraders = $derived(TRADERS.filter((t) => t.side === 'short'));

	function close() {
		open = false;
	}

	function onKey(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
		}
	}

	
	async function loadKeysStatus() {
		try {
			const res = await fetch('/api/keys/status');
			const data = await res.json();
			const local = loadExchangeKeys();
			const localBf = blofinStatusFromClient(local);
			const localBy = bybitStatusFromClient(local);
			// Merge: browser session wins for UI configured state (Vercel has no server vault)
			keysStatus = {
				ok: true,
				blofin: localBf.configured ? localBf : (data?.blofin ?? localBf),
				bybit: localBy.configured ? localBy : (data?.bybit ?? localBy)
			};
			const bf = keysStatus.blofin;
			const by = keysStatus.bybit;
			if (bf?.baseUrl) blofinBase = bf.baseUrl;
			if (by?.baseUrl) bybitBase = by.baseUrl;
			// Prefill masked placeholders so blank submit keeps prior secrets
			if (bf?.apiKeyMasked) blofinKey = bf.apiKeyMasked;
			if (bf?.secretMasked) blofinSecret = bf.secretMasked;
			if (bf?.passphraseMasked) blofinPass = bf.passphraseMasked;
			if (bf?.brokerIdMasked) blofinBrokerId = bf.brokerIdMasked;
			if (by?.apiKeyMasked) bybitKey = by.apiKeyMasked;
			if (by?.secretMasked) bybitSecret = by.secretMasked;
			if (by?.passphraseMasked) bybitPass = by.passphraseMasked;
			if (by?.brokerIdMasked) bybitBrokerId = by.brokerIdMasked;
		} catch (e) {
			keysErr = true;
			keysMsg = e instanceof Error ? e.message : String(e);
		}
	}

	async function saveBloFinKeys() {
		if (keysBusy) return;
		const confirmMsg = import.meta.env.DEV
			? 'Save BloFin keys to this browser session (and local .secrets for solo dev)?'
			: 'Save BloFin keys to this browser session? Keys stay in the browser (not a shared Vercel vault). Clearing site data logs you out.';
		if (!confirm(confirmMsg)) return;
		keysBusy = true;
		keysErr = false;
		keysMsg = 'Saving BloFin...';
		try {
			// Always persist in browser session first (works on Vercel)
			const localStatus = upsertBloFinClientKeys({
				apiKey: blofinKey,
				apiSecret: blofinSecret,
				passphrase: blofinPass,
				brokerId: blofinBrokerId,
				baseUrl: blofinBase || 'https://openapi.blofin.com'
			});
			if (!localStatus.configured) {
				throw new Error('BloFin requires apiKey, apiSecret, and passphrase');
			}
			const stored = loadExchangeKeys().blofin;
			const res = await fetch('/api/keys/blofin', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					apiKey: stored?.apiKey,
					apiSecret: stored?.apiSecret,
					passphrase: stored?.passphrase,
					brokerId: stored?.brokerId,
					baseUrl: stored?.baseUrl || 'https://openapi.blofin.com'
				})
			});
			const data = await res.json();
			if (!data.ok && data.persistence !== 'browser-session') {
				throw new Error(data.error || 'Save failed');
			}
			keysMsg =
				data.persistence === 'browser-session'
					? 'BloFin keys in browser session (not uploaded to a shared vault)'
					: 'BloFin keys saved (browser + local .secrets)';
			toastOk('BloFin keys saved', localStatus.apiKeyMasked ?? 'configured');
			await loadKeysStatus();
			await refresh();
		} catch (e) {
			keysErr = true;
			keysMsg = e instanceof Error ? e.message : String(e);
			toastErr('BloFin key save failed', keysMsg);
		} finally {
			keysBusy = false;
		}
	}

	async function saveBybitKeys() {
		if (keysBusy) return;
		const confirmMsg = import.meta.env.DEV
			? 'Save Bybit keys to this browser session (and local .secrets for solo dev)?'
			: 'Save Bybit keys to this browser session? Keys stay in the browser (not a shared Vercel vault). Clearing site data logs you out.';
		if (!confirm(confirmMsg)) return;
		keysBusy = true;
		keysErr = false;
		keysMsg = 'Saving Bybit...';
		try {
			const localStatus = upsertBybitClientKeys({
				apiKey: bybitKey,
				apiSecret: bybitSecret,
				passphrase: bybitPass || undefined,
				brokerId: bybitBrokerId || undefined,
				baseUrl: bybitBase || 'https://api.bybit.com'
			});
			if (!localStatus.configured) {
				throw new Error('Bybit requires apiKey and apiSecret');
			}
			const stored = loadExchangeKeys().bybit;
			const res = await fetch('/api/keys/bybit', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					apiKey: stored?.apiKey,
					apiSecret: stored?.apiSecret,
					passphrase: stored?.passphrase,
					brokerId: stored?.brokerId,
					baseUrl: stored?.baseUrl || 'https://api.bybit.com'
				})
			});
			const data = await res.json();
			if (!data.ok && data.persistence !== 'browser-session') {
				throw new Error(data.error || 'Save failed');
			}
			keysMsg =
				data.persistence === 'browser-session'
					? 'Bybit keys in browser session (not uploaded to a shared vault)'
					: 'Bybit keys saved (browser + local .secrets)';
			toastOk('Bybit keys saved', localStatus.apiKeyMasked ?? 'configured');
			await loadKeysStatus();
			const hRes = await exchangeFetch('/api/bybit/health');
			const health = await hRes.json();
			if (health?.ok) toastOk('Bybit health OK', health.baseUrl);
			else toastErr('Bybit health', health?.error || health?.msg || 'unreachable');
		} catch (e) {
			keysErr = true;
			keysMsg = e instanceof Error ? e.message : String(e);
			toastErr('Bybit key save failed', keysMsg);
		} finally {
			keysBusy = false;
		}
	}


	async function refresh() {
		loading = true;
		err = null;
		try {
			const [hRes, bRes, pRes, oRes] = await Promise.all([
				exchangeFetch('/api/blofin/health'),
				exchangeFetch('/api/blofin/balance'),
				exchangeFetch('/api/blofin/positions'),
				exchangeFetch('/api/blofin/orders')
			]);
			health = (await hRes.json()) as BloFinHealth;
			balance = (await bRes.json()) as BloFinBalanceResponse;
			positions = (await pRes.json()) as BloFinPositionsResponse;
			orders = (await oRes.json()) as BloFinOrdersResponse;
			if (health?.fromSnapshot || balance?.fromSnapshot) {
				err = null;
			} else if (!health?.configured) {
				err = 'No BloFin keys - use LOGIN tab (browser session)';
			} else if (!health.ok) {
				err = health.error ?? 'BloFin unreachable';
			}
			publishOverlay(assignments, positions?.positions);
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	function publishOverlay(asg: BloFinAssignments, posList: BloFinPosition[] | undefined) {
		const byPos = new Map((posList ?? []).map((p) => [p.positionId, p]));
		const overlay: Record<string, string> = {};
		for (const [positionId, traderId] of Object.entries(asg)) {
			const p = byPos.get(positionId);
			const label = p
				? `${p.instId} ${p.side === 'flat' ? '' : p.side.toUpperCase()}`.trim()
				: `POS ${positionId.slice(0, 6)}`;
			overlay[traderId] = overlay[traderId] ? `${overlay[traderId]} . ${label}` : label;
		}
		onOverlayChange(overlay);
	}

	function setAssign(positionId: string, traderId: string) {
		const next = assignPosition(assignments, positionId, traderId || null);
		assignments = next;
		saveBloFinAssignments(next);
		onAssignmentsChange(next);
		publishOverlay(next, positions?.positions);
		if (traderId) storeIntentForPosition(positionId, traderId);
	}

	function ensureSyncDefaults(p: BloFinPosition) {
		if (syncPct[p.positionId] == null) syncPct[p.positionId] = 5;
		if (!syncMargin[p.positionId]) {
			const mm = (p.marginMode || 'isolated').toLowerCase();
			syncMargin[p.positionId] = mm === 'cross' ? 'cross' : 'isolated';
		}
		if (syncLev[p.positionId] == null) syncLev[p.positionId] = p.leverage || 10;
		if (!syncOrderType[p.positionId]) syncOrderType[p.positionId] = 'market';
		if (syncReduce[p.positionId] == null) syncReduce[p.positionId] = false;
	}

	function storeIntentForPosition(positionId: string, traderId: string) {
		const p = positions?.positions.find((x) => x.positionId === positionId);
		if (!p || p.side === 'flat') return;
		ensureSyncDefaults(p);
		const tradeSide = p.side === 'short' ? 'short' : 'long';
		const pct = syncPct[positionId] ?? 5;
		const lev = syncLev[positionId] ?? p.leverage ?? 10;
		const mm = syncMargin[positionId] ?? 'isolated';
		const ot = syncOrderType[positionId] ?? 'market';
		const px = syncPrice[positionId] ?? null;
		const sz = sizeFromFundsPct({
			availableEquity,
			fundsPct: pct,
			leverage: lev,
			markPrice: p.markPrice
		});
		const intent: BloFinTradeIntent = {
			id: newIntentId(),
			createdAt: new Date().toISOString(),
			traderId,
			instId: p.instId,
			display: p.instId.replace('-', ''),
			fundsPct: pct,
			marginMode: mm,
			positionSide: positionSideFromTradeSide(tradeSide),
			side: orderSideFromTradeSide(tradeSide),
			leverage: lev,
			orderType: ot,
			price: ot === 'limit' ? px : null,
			reduceOnly: !!syncReduce[positionId],
			estSize: sz.size,
			estNotional: sz.notional,
			estMargin: sz.margin,
			availableEquity,
			markPrice: p.markPrice,
			positionId: p.positionId,
			source: 'desk'
		};
		intents = upsertTradeIntent(intent);
		tradeErr = false;
		tradeMsg = `Intent stored . ${intent.instId} -> ${traderId} . ${sz.size.toFixed(4)} cts (confirm to POST)`;
	}

	async function confirmDeskIntent() {
		const pending = confirmIntent;
		if (!pending || sending) return;
		if (pending.source !== 'desk' || pending.exchange === 'bybit' || pending.marketType === 'spot' || pending.signalSample) {
			tradeErr = true;
			tradeMsg = 'Review this intent in Quick Trade on its original exchange; it cannot be sent from BloFin Desk.';
			return;
		}
		if (!health?.configured) {
			tradeErr = true;
			tradeMsg = 'BloFin keys not configured - use LOGIN tab';
			toastErr('Keys missing', 'Configure BloFin on the LOGIN tab');
			return;
		}
		if (networkBlocked) {
			toastInfo('Network warning', 'BloFin may be unreachable (403) - still attempting POST');
		}
		sending = true;
		tradeErr = false;
		tradeMsg = 'Sending live order...';
		try {
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
				size: String(pending.estSize),
				sizeUnit: 'baseCoin',
				positionSide: pending.positionSide
			};
			if (pending.orderType === 'limit' && pending.price != null) orderBody.price = String(pending.price);
			if (pending.reduceOnly) orderBody.reduceOnly = true;

			const oRes = await exchangeFetch('/api/blofin/order', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(orderBody)
			});
			const ord = (await oRes.json()) as BloFinTradeWriteResponse;
			if (!ord.ok) throw new Error(formatExchangeError(ord));

			intents = removeTradeIntent(pending.id);
			tradeMsg = `LIVE OK . ${pending.instId} ${pending.side}`;
			toastOk('Order live', `${pending.instId} ${pending.side}`);
			confirmIntent = null;
			await refresh();
		} catch (e) {
			tradeErr = true;
			tradeMsg = e instanceof Error ? e.message : String(e);
			toastErr('Order failed', tradeMsg);
		} finally {
			sending = false;
		}
	}

	function tradersFor(pos: BloFinPosition) {
		if (pos.side === 'short') return shortTraders;
		if (pos.side === 'long') return longTraders;
		return TRADERS;
	}

	$effect(() => {
		if (!open) return;
		const asg = loadBloFinAssignments();
		assignments = asg;
		// Don't re-subscribe to parent callback identity (inline arrows re-create each poll).
		untrack(() => {
			onAssignmentsChange(asg);
			intents = loadTradeIntents().filter((i) => i.source === 'desk');
			void refresh();
			void loadKeysStatus();
		});
	});

	function fmt(n: number | null | undefined, d = 2) {
		if (n == null || !Number.isFinite(n)) return '-';
		return n.toFixed(d);
	}

	function pnlClass(n: number) {
		return n > 0 ? 'pos' : n < 0 ? 'neg' : '';
	}
</script>

<svelte:window onkeydown={onKey} />

{#if open}
	<div class="backdrop" role="presentation" onclick={close}></div>
	<div
		class="console"
		role="dialog"
		aria-modal="true"
		aria-label="Desk console - BloFin live"
	>
		<header class="titlebar">
			<div class="leds">
				<i class:on={!!health?.configured}></i>
				<i class:live={health?.mode === 'live'}></i>
				<i class:ok={health?.ok}></i>
			</div>
			<strong>DESK CONSOLE . BLOFIN LIVE</strong>
			<button type="button" class="x" onclick={close} aria-label="Close desk console">x</button>
		</header>

		<nav class="tabs" aria-label="Console sections">
			{#each [
				['status', 'STATUS'],
				['account', 'ACCOUNT'],
				['positions', 'POSITIONS'],
				['orders', 'ORDERS'],
				['login', 'LOGIN']
			] as [id, label]}
				<button
					type="button"
					class:active={tab === id}
					onclick={() => { tab = id as Tab; if (id === 'login') void loadKeysStatus(); }}>{label}</button
				>
			{/each}
			<button type="button" class="refresh" onclick={refresh} disabled={loading}>
				{loading ? '...' : 'R'}
			</button>
		</nav>

		{#if networkBlocked && health?.configured}
			<div class="banner net">
				BloFin unreachable from this network (403). Keys OK - use VPN or deploy server-side.
			</div>
		{:else if health?.fromSnapshot || balance?.fromSnapshot}
			<div class="banner snap">
				SNAPSHOT / CACHE . synced {health?.syncedAt ?? balance?.syncedAt ?? '-'} . offline desk copy (not demo)
			</div>
		{/if}
		{#if err && !networkBlocked}
			<div class="banner warn">{err}</div>
		{/if}

		{#if positions?.warnings?.length}
			<div class="banner risk">
				<span>RISK</span>
				<ul>
					{#each positions.warnings as w}<li>{w}</li>{/each}
				</ul>
			</div>
		{/if}

		<div class="body">
			{#if tab === 'status'}
				<section class="panel">
					<h3>LINK STATUS</h3>
					<dl>
						<div><dt>MODE</dt><dd data-mode={health?.mode ?? 'demo'}>{health?.mode?.toUpperCase() ?? '-'}</dd></div>
						<div><dt>BASE</dt><dd class="mono">{health?.baseUrl ?? '-'}</dd></div>
						<div><dt>API KEY</dt><dd>{health?.keyPresent ? 'YES' : 'NO'}</dd></div>
						<div><dt>SECRET</dt><dd>{health?.secretPresent ? 'YES' : 'NO'}</dd></div>
						<div><dt>PASSPHRASE</dt><dd>{health?.passphrasePresent ? 'YES' : 'NO'}</dd></div>
						<div><dt>REACHABLE</dt><dd>{health?.reachable == null ? '-' : health.reachable ? 'YES' : 'NO'}</dd></div>
						<div><dt>SOURCE</dt><dd>{health?.fromSnapshot ? 'SNAPSHOT' : 'LIVE'}</dd></div>
						<div><dt>SYNCED</dt><dd class="mono">{health?.syncedAt ?? '-'}</dd></div>
						<div><dt>WRITES (KEYS)</dt><dd class={health?.writesEnabled ? 'pos' : 'neg'}>{health?.writesEnabled ? 'READY' : 'NO KEYS'}</dd></div>
						<div><dt>NETWORK</dt><dd class={health?.reachable ? 'pos' : 'neg'}>{health?.networkBlocked ? 'BLOCKED 403' : health?.reachable ? 'OK' : 'DOWN'}</dd></div>
					</dl>
					<p class="hint">Esc / x closes. Keys never leave the server.</p>
				</section>
			{:else if tab === 'account'}
				<section class="panel">
					<h3>ACCOUNT</h3>
					{#if !balance?.ok}
						<p class="empty">{balance?.error ?? 'No balance data'}</p>
					{:else}
						<div class="equity">
							<small>TOTAL EQUITY</small>
							<strong>${fmt(balance.totalEquityUsd, 2)}</strong>
							<em>{balance.mode.toUpperCase()}{balance.fromSnapshot ? ' . SNAPSHOT' : balance.sample ? ' . SAMPLE' : ''}</em>
						</div>
						<table>
							<thead>
								<tr><th>CCY</th><th>EQ</th><th>AVAIL</th><th>FRZN</th></tr>
							</thead>
							<tbody>
								{#each balance.details as row}
									<tr>
										<td>{row.currency}</td>
										<td>{fmt(row.equity, 2)}</td>
										<td>{fmt(row.available, 2)}</td>
										<td>{fmt(row.frozen, 2)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				</section>
			{:else if tab === 'positions'}
				<section class="panel">
					<h3>POSITIONS -> FLOOR</h3>
					{#if !positions?.ok}
						<p class="empty">{positions?.error ?? 'No positions'}</p>
					{:else if positions.positions.length === 0}
						<p class="empty">Flat - no open BloFin positions.</p>
					{:else}
						{#each positions.positions as p (p.positionId)}
							<article class="pos-card" data-side={p.side}>
								<header>
									<strong>{p.instId}</strong>
									<span>{p.side.toUpperCase()} . {p.leverage}x . {p.marginMode}</span>
								</header>
								<div class="grid">
									<span>SIZE</span><b>{fmt(p.size, 4)}</b>
									<span>ENTRY</span><b>{fmt(p.averagePrice, 4)}</b>
									<span>MARK</span><b>{fmt(p.markPrice, 4)}</b>
									<span>uPNL</span><b class={pnlClass(p.unrealizedPnl)}>{fmt(p.unrealizedPnl, 2)}</b>
									<span>LIQ</span><b class="neg">{fmt(p.liquidationPrice, 4)}</b>
									<span>ID</span><b class="mono tiny">{p.positionId}</b>
								</div>
								<label class="assign">
									<span>ASSIGN TRADER</span>
									<select
										value={assignments[p.positionId] ?? ''}
										onchange={(e) =>
											setAssign(p.positionId, (e.currentTarget as HTMLSelectElement).value)}
									>
										<option value="">- unassigned -</option>
										{#each tradersFor(p) as t}
											<option value={t.id}>{t.id} {t.name} ({t.leverage}x)</option>
										{/each}
									</select>
								</label>
								<div class="sync">
									<span class="sync-title">TRADER SYNC / SIZE (stores intent only)</span>
									<label>
										<span>% FUNDS {syncPct[p.positionId] ?? 5}%</span>
										<input
											type="range"
											min="0"
											max="100"
											step="1"
											value={syncPct[p.positionId] ?? 5}
											oninput={(e) => {
												ensureSyncDefaults(p);
												syncPct[p.positionId] = Number((e.currentTarget as HTMLInputElement).value);
											}}
										/>
									</label>
									<label>
										<span>MARGIN</span>
										<select
											value={syncMargin[p.positionId] ?? 'isolated'}
											onchange={(e) => {
												ensureSyncDefaults(p);
												syncMargin[p.positionId] = (e.currentTarget as HTMLSelectElement)
													.value as BloFinMarginMode;
											}}
										>
											<option value="isolated">isolated</option>
											<option value="cross">cross</option>
										</select>
									</label>
									<label>
										<span>LEVERAGE</span>
										<input
											type="number"
											min="1"
											max="125"
											value={syncLev[p.positionId] ?? p.leverage}
											oninput={(e) => {
												ensureSyncDefaults(p);
												syncLev[p.positionId] = Number((e.currentTarget as HTMLInputElement).value);
											}}
										/>
									</label>
									<label>
										<span>ORDER</span>
										<select
											value={syncOrderType[p.positionId] ?? 'market'}
											onchange={(e) => {
												ensureSyncDefaults(p);
												syncOrderType[p.positionId] = (e.currentTarget as HTMLSelectElement)
													.value as BloFinOrderType;
											}}
										>
											<option value="market">market</option>
											<option value="limit">limit</option>
										</select>
									</label>
									{#if (syncOrderType[p.positionId] ?? 'market') === 'limit'}
										<label>
											<span>LIMIT PX</span>
											<input
												type="number"
												min="0"
												step="any"
												value={syncPrice[p.positionId] ?? ''}
												oninput={(e) => {
													ensureSyncDefaults(p);
													const v = (e.currentTarget as HTMLInputElement).value;
													syncPrice[p.positionId] = v === '' ? null : Number(v);
												}}
											/>
										</label>
									{/if}
									<label class="check">
										<input
											type="checkbox"
											checked={!!syncReduce[p.positionId]}
											onchange={(e) => {
												ensureSyncDefaults(p);
												syncReduce[p.positionId] = (e.currentTarget as HTMLInputElement).checked;
											}}
										/>
										reduce-only
									</label>
									{#if assignments[p.positionId]}
										<div class="est">
											est
											{sizeFromFundsPct({
												availableEquity,
												fundsPct: syncPct[p.positionId] ?? 5,
												leverage: syncLev[p.positionId] ?? p.leverage,
												markPrice: p.markPrice
											}).size.toFixed(4)} cts . notional $
											{sizeFromFundsPct({
												availableEquity,
												fundsPct: syncPct[p.positionId] ?? 5,
												leverage: syncLev[p.positionId] ?? p.leverage,
												markPrice: p.markPrice
											}).notional.toFixed(2)}
										</div>
										<button
											type="button"
											class="store"
											onclick={() => storeIntentForPosition(p.positionId, assignments[p.positionId])}
										>
											STORE INTENT
										</button>
									{/if}
								</div>
							</article>
						{/each}
						{#if intents.length}
							<div class="intent-box">
								<h4>PENDING LIVE INTENTS</h4>
								{#each intents.filter((it) => it.source === 'desk' && it.exchange !== 'bybit' && it.marketType !== 'spot') as it (it.id)}
									<div class="intent-row">
										<span>{it.instId} {it.side} {it.leverage}x . {it.estSize.toFixed(4)} cts -> {it.traderId}</span>
										<button
											type="button"
											class="confirm"
											disabled={!writesReady || sending}
											onclick={() => (confirmIntent = it)}
										>
											LIVE ORDER - confirm
										</button>
									</div>
								{/each}
							</div>
						{/if}
						{#if tradeMsg}
							<p class="trade-msg" class:bad={tradeErr}>{tradeMsg}</p>
						{/if}
					{/if}
				</section>
			{:else if tab === 'orders'}
				<section class="panel">
					<h3>OPEN ORDERS</h3>
					{#if !orders?.ok}
						<p class="empty">{orders?.error ?? 'No orders'}</p>
					{:else if orders.orders.length === 0}
						<p class="empty">No pending orders.</p>
					{:else}
						<table>
							<thead>
								<tr><th>INST</th><th>SIDE</th><th>TYPE</th><th>PX</th><th>SZ</th><th>STATE</th></tr>
							</thead>
							<tbody>
								{#each orders.orders as o}
									<tr>
										<td>{o.instId}</td>
										<td>{o.side}</td>
										<td>{o.orderType}</td>
										<td>{fmt(o.price, 4)}</td>
										<td>{fmt(o.size, 4)}</td>
										<td>{o.state}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				</section>

			{:else if tab === 'login'}
				<section class="panel login-panel">
					<h3>EXCHANGE LOGIN</h3>
					<p class="hint">
						Keys stay in this browser session (not uploaded to a shared Vercel vault). Clearing site data logs you out.
						{#if import.meta.env.DEV}
							Locally, SAVE also writes gitignored <code>.secrets/exchanges.json</code>.
						{/if}
						Never returned raw by GET - only masked ****. Confirm before save.
					</p>
					{#if keysStatus}
						<p class="keys-status">
							BloFin: {keysStatus.blofin?.configured ? 'CONFIGURED ' + (keysStatus.blofin.apiKeyMasked ?? '') : 'NOT SET'}
							. Bybit: {keysStatus.bybit?.configured ? 'CONFIGURED ' + (keysStatus.bybit.apiKeyMasked ?? '') : 'NOT SET'}
						</p>
					{/if}
					{#if keysMsg}
						<p class="trade-msg" class:bad={keysErr}>{keysMsg}</p>
					{/if}

					<fieldset class="login-box">
						<legend>BLOFIN (live default)</legend>
						<label class="field"><span>API KEY</span>
							<input type="password" autocomplete="off" bind:value={blofinKey} placeholder="****" />
						</label>
						<label class="field"><span>SECRET</span>
							<input type="password" autocomplete="off" bind:value={blofinSecret} placeholder="****" />
						</label>
						<label class="field"><span>PASSPHRASE</span>
							<input type="password" autocomplete="off" bind:value={blofinPass} placeholder="****" />
						</label>
						<label class="field"><span>BROKER ID (if required)</span>
							<input type="password" autocomplete="off" bind:value={blofinBrokerId} placeholder="broker id" />
						</label>
						<label class="field"><span>BASE URL</span>
							<input type="text" bind:value={blofinBase} placeholder="https://openapi.blofin.com" />
						</label>
						<button type="button" class="store" disabled={keysBusy} onclick={saveBloFinKeys}>
							{keysBusy ? 'SAVING...' : 'SAVE BLOFIN KEYS'}
						</button>
					</fieldset>

					<fieldset class="login-box">
						<legend>BYBIT</legend>
						<label class="field"><span>API KEY</span>
							<input type="password" autocomplete="off" bind:value={bybitKey} placeholder="****" />
						</label>
						<label class="field"><span>SECRET</span>
							<input type="password" autocomplete="off" bind:value={bybitSecret} placeholder="****" />
						</label>
						<label class="field"><span>PASSPHRASE (optional)</span>
							<input type="password" autocomplete="off" bind:value={bybitPass} placeholder="optional" />
						</label>
						<label class="field"><span>BROKER ID (if required)</span>
							<input type="password" autocomplete="off" bind:value={bybitBrokerId} placeholder="broker id" />
						</label>
						<label class="field"><span>BASE URL</span>
							<input type="text" bind:value={bybitBase} placeholder="https://api.bybit.com" />
						</label>
						<button type="button" class="store" disabled={keysBusy} onclick={saveBybitKeys}>
							{keysBusy ? 'SAVING...' : 'SAVE BYBIT KEYS'}
						</button>
					</fieldset>
				</section>

			{/if}
		</div>
		<footer>LIVE-CAPABLE . assign stores intent . confirm required before POST . key <code>phf-blofin-assignments</code></footer>
	</div>

	{#if confirmIntent}
		<div class="confirm-backdrop" role="presentation"></div>
		<div class="confirm-dialog" role="alertdialog" aria-modal="true" aria-label="Confirm live order">
			<strong>LIVE ORDER - confirm</strong>
			<p>
				{confirmIntent.instId} . {confirmIntent.side.toUpperCase()} . {confirmIntent.positionSide} .
				{confirmIntent.marginMode}<br />
				{confirmIntent.orderType} . {confirmIntent.leverage}x . size {confirmIntent.estSize.toFixed(4)} .
				notional ${confirmIntent.estNotional.toFixed(2)}
				{#if confirmIntent.reduceOnly}<br />reduce-only{/if}
			</p>
			<div class="confirm-actions">
				<button type="button" class="store" disabled={sending} onclick={() => (confirmIntent = null)}>CANCEL</button>
				<button type="button" class="confirm" disabled={sending} onclick={confirmDeskIntent}>
					{sending ? 'SENDING...' : 'LIVE ORDER - confirm'}
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
		pointer-events: auto;
	}
	.console {
		position: fixed;
		z-index: 200001;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(560px, calc(100vw - 24px));
		max-height: min(780px, calc(100vh - 24px));
		display: flex;
		flex-direction: column;
		background: #06120d;
		color: #72e3a3;
		border: 4px solid #2f5a42;
		box-shadow:
			0 0 0 2px #0a1a12,
			8px 8px 0 rgba(0, 0, 0, 0.55),
			inset 0 0 40px rgba(40, 255, 140, 0.08);
		font-family: var(--mono, 'Courier New', monospace);
		text-shadow: 0 0 4px rgba(80, 255, 150, 0.25);
		pointer-events: auto;
	}
	.titlebar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		background: #0c1f16;
		border-bottom: 2px solid #2f5a42;
		font-size: 10px;
		letter-spacing: 0.08em;
	}
	.leds {
		display: flex;
		gap: 4px;
	}
	.leds i {
		width: 8px;
		height: 8px;
		background: #31443a;
		border: 1px solid #1a2a22;
	}
	.leds i.on {
		background: #e8c976;
		box-shadow: 0 0 6px #e8c976;
	}
	.leds i.live {
		background: #ff766a;
		box-shadow: 0 0 6px #ff766a;
	}
	.leds i.ok {
		background: #59cf84;
		box-shadow: 0 0 6px #59cf84;
	}
	.titlebar strong {
		flex: 1;
	}
	.x {
		background: #1a2e24;
		color: #9fd9b5;
		border: 2px solid #3a6a50;
		width: 28px;
		height: 24px;
		cursor: pointer;
		font-size: 14px;
		line-height: 1;
	}
	.x:hover {
		background: #8f392f;
		color: #ffe0d9;
		border-color: #c66b59;
	}
	.tabs {
		display: flex;
		gap: 2px;
		padding: 6px;
		background: #08160f;
		border-bottom: 1px solid #234433;
	}
	.tabs button {
		flex: 1;
		padding: 6px 4px;
		background: #12251b;
		color: #6a9a7c;
		border: 1px solid #2a4a38;
		font: 8px var(--mono, monospace);
		letter-spacing: 0.06em;
		cursor: pointer;
	}
	.tabs button.active {
		background: #1d4a34;
		color: #b8ffd0;
		border-color: #4ecf88;
	}
	.tabs .refresh {
		flex: 0 0 32px;
		font-size: 12px;
	}
	.banner {
		margin: 6px 8px 0;
		padding: 6px 8px;
		font-size: 8px;
		border: 1px solid #5a4a28;
		background: #2a2410;
		color: #e8c976;
	}

	.banner.snap {
		background: #1a2a22;
		border: 2px solid #3d6b52;
		color: #8fd4a8;
	}
	.banner.risk {
		border-color: #8f392f;
		background: #2a1410;
		color: #ffb0a4;
	}
	.banner.risk span {
		font-weight: 900;
		margin-right: 6px;
	}
	.banner ul {
		margin: 4px 0 0;
		padding-left: 14px;
	}
	.body {
		flex: 1;
		overflow: auto;
		padding: 8px;
	}
	.panel h3 {
		margin: 0 0 8px;
		font-size: 9px;
		letter-spacing: 0.12em;
		color: #9fd9b5;
		border-bottom: 1px dotted #2f5a42;
		padding-bottom: 4px;
	}
	dl {
		display: grid;
		gap: 4px;
		margin: 0;
	}
	dl > div {
		display: grid;
		grid-template-columns: 110px 1fr;
		gap: 8px;
		font-size: 9px;
	}
	dt {
		opacity: 0.55;
	}
	dd {
		margin: 0;
	}
	dd[data-mode='live'] {
		color: #ff766a;
	}
	dd[data-mode='demo'] {
		color: #e8c976;
	}
	.mono {
		font-size: 8px;
		word-break: break-all;
	}
	.tiny {
		font-size: 7px;
	}
	.hint,
	.empty {
		font-size: 8px;
		opacity: 0.7;
		margin-top: 10px;
	}
	.equity {
		display: grid;
		gap: 2px;
		margin-bottom: 10px;
		padding: 8px;
		background: #0a1a12;
		border: 1px solid #2f5a42;
	}
	.equity small {
		font-size: 7px;
		opacity: 0.6;
	}
	.equity strong {
		font-size: 20px;
		color: #efc870;
	}
	.equity em {
		font-style: normal;
		font-size: 7px;
		opacity: 0.65;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 8px;
	}
	th,
	td {
		text-align: left;
		padding: 4px 3px;
		border-bottom: 1px solid #1a3326;
	}
	th {
		opacity: 0.5;
		font-weight: 500;
	}
	.pos-card {
		margin-bottom: 8px;
		padding: 8px;
		background: #0a1a12;
		border: 2px solid #2f5a42;
	}
	.pos-card[data-side='short'] {
		border-color: #6a3a34;
	}
	.pos-card[data-side='long'] {
		border-color: #2f5a42;
	}
	.pos-card header {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 6px;
		font-size: 9px;
	}
	.pos-card header span {
		opacity: 0.65;
		font-size: 7px;
	}
	.grid {
		display: grid;
		grid-template-columns: auto 1fr auto 1fr;
		gap: 3px 8px;
		font-size: 8px;
		margin-bottom: 8px;
	}
	.grid span {
		opacity: 0.5;
	}
	.grid b {
		font-weight: 500;
		text-align: right;
	}
	.pos {
		color: #59cf84;
	}
	.neg {
		color: #ff766a;
	}
	.assign {
		display: grid;
		gap: 3px;
		font-size: 7px;
	}
	.assign select {
		background: #12251b;
		color: #b8ffd0;
		border: 1px solid #3a6a50;
		padding: 4px;
		font: 8px var(--mono, monospace);
		cursor: pointer;
	}
	footer {
		padding: 6px 8px;
		border-top: 1px solid #234433;
		font-size: 7px;
		opacity: 0.55;
	}
	footer code {
		color: #e8c976;
	}
	.console::after {
		content: '';
		pointer-events: none;
		position: absolute;
		inset: 0;
		background: repeating-linear-gradient(
			0deg,
			transparent 0 2px,
			rgba(0, 0, 0, 0.12) 2px 3px
		);
	}

	.sync {
		margin-top: 8px;
		padding: 8px;
		border: 1px dashed #3a6a50;
		background: #0a1a12;
		display: grid;
		gap: 6px;
		font-size: 7px;
	}
	.sync-title { letter-spacing: 0.08em; color: #9fd9b5; }
	.sync label { display: grid; gap: 2px; }
	.sync input, .sync select {
		background: #12251b;
		color: #b8ffd0;
		border: 1px solid #3a6a50;
		padding: 4px;
		font: 8px var(--mono, monospace);
	}
	.sync .check { display: flex; align-items: center; gap: 6px; }
	.est { opacity: 0.75; }
	.store, .confirm {
		padding: 6px;
		font: 8px var(--mono, monospace);
		letter-spacing: 0.06em;
		cursor: pointer;
	}
	.store {
		background: #1a2e24;
		border: 1px solid #3a6a50;
		color: #9fd9b5;
	}
	.confirm {
		background: #3a1a18;
		border: 1px solid #8a4a42;
		color: #ff8a7a;
	}
	.confirm:disabled { opacity: 0.45; cursor: not-allowed; }
	.intent-box {
		margin-top: 10px;
		padding: 8px;
		border: 2px solid #8f392f;
		background: #2a1410;
	}
	.intent-box h4 {
		margin: 0 0 6px;
		font-size: 8px;
		letter-spacing: 0.1em;
		color: #ffb0a4;
	}
	.intent-row {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 8px;
		font-size: 8px;
		color: #ffd0c8;
	}
	.trade-msg { font-size: 8px; color: #8fd4a8; }
	.trade-msg.bad { color: #ff8a7a; }
	.pos { color: #59cf84; }
	.confirm-backdrop {
		position: fixed; inset: 0; z-index: 200010; background: rgba(0,0,0,0.7);
	}
	.confirm-dialog {
		position: fixed; z-index: 200011; left: 50%; top: 50%; transform: translate(-50%,-50%);
		width: min(360px, calc(100vw - 32px)); padding: 14px;
		background: #2a100e; border: 3px solid #c66b59; color: #ffe0d9;
		font-family: var(--mono, monospace);
		box-shadow: 8px 8px 0 rgba(0,0,0,0.55);
		display: block;
	}
	.confirm-dialog strong { display: block; margin-bottom: 8px; color: #ff766a; letter-spacing: 0.1em; }
	.confirm-dialog p { font-size: 9px; line-height: 1.5; margin: 0 0 12px; }
	.confirm-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

	.login-panel {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.keys-status {
		margin: 0;
		font-size: 8px;
		color: #9fd9b5;
		letter-spacing: 0.04em;
	}
	.login-box {
		margin: 0;
		padding: 10px;
		border: 2px solid #2f5a42;
		background: #0a1a12;
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	.login-box legend {
		padding: 0 6px;
		font-size: 8px;
		letter-spacing: 0.1em;
		color: #efc870;
	}
	.login-box .field {
		display: grid;
		grid-template-columns: 108px minmax(0, 1fr);
		align-items: center;
		gap: 8px;
		width: 100%;
		min-width: 0;
		margin: 0;
		font-size: 8px;
		color: #9fd9b5;
	}
	.login-box .field span {
		letter-spacing: 0.06em;
		opacity: 0.75;
		white-space: nowrap;
	}
	.login-box .field input {
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		background: #12251b;
		color: #b8ffd0;
		border: 1px solid #3a6a50;
		padding: 6px 8px;
		font: 9px/1.2 var(--mono, monospace);
	}
	.login-box .field input:focus {
		outline: 1px solid #efc870;
		outline-offset: 1px;
	}
	.login-box .store {
		margin-top: 4px;
		width: fit-content;
		align-self: flex-start;
	}
	@media (max-width: 520px) {
		.login-box .field {
			grid-template-columns: 1fr;
			gap: 3px;
		}
	}

</style>
