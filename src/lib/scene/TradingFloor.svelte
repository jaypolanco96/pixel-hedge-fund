<script lang="ts">
	import { dev } from '$app/environment';
	import { exchangeFetch } from '$lib/client/exchangeHeaders';
	import { completedBars } from '$lib/data/validation';
	import { onMount } from 'svelte';
	import Skyline from './Skyline.svelte';
	import RainLayer from './RainLayer.svelte';
	import SnowLayer from './SnowLayer.svelte';
	import TickerTape from './TickerTape.svelte';
	import TaHud from './TaHud.svelte';
	import CharacterSprite from './CharacterSprite.svelte';
	import MiniChart from './MiniChart.svelte';
	import FaxMachine from './FaxMachine.svelte';
	import StickyNotes from './StickyNotes.svelte';
	import FloorPet from './FloorPet.svelte';
	import TrashCan from './TrashCan.svelte';
	import CrtPnlCart from './CrtPnlCart.svelte';
	import DeskBookReader from './DeskBookReader.svelte';
	import { DESK_LIBRARY, type DeskBookId } from '$lib/books/deskLibrary';
	import MariachiBand from './MariachiBand.svelte';
	import DeskConsole from './DeskConsole.svelte';
	import ToastStack from '$lib/ui/ToastStack.svelte';
	import {
		DEFAULT_DESK_SETTINGS,
		loadDeskSettings,
		saveDeskSettings,
		type DeskSettings
	} from '$lib/persist/deskSettings';
	import MonitorPanel from './MonitorPanel.svelte';
	import QuickTradePanel from './QuickTradePanel.svelte';
	import ProfitCalcPanel from './ProfitCalcPanel.svelte';
	import { TRADERS, STAFF } from '$lib/characters/cast';
	import { DEFAULT_OFFICE_FLAG, OFFICE_FLAGS } from '$lib/data/officeFlags';
	import { loadTraderTimeOverrides, saveTraderTimeOverrides } from '$lib/persist/traderTime';
	import {
		loadBloFinAssignments,
		type BloFinAssignments
	} from '$lib/persist/blofinAssignments';
	import {
		loadScenePosition,
		saveScenePosition
	} from '$lib/persist/scenePositions';
	import { initialSimClock, tickSimClock, applyForcedChristmasSnow, SIM_MINUTES_PER_REAL_SECOND } from '$lib/weather/timeCycle';
	import { initialKong, tickKong } from '$lib/weather/kongEvent';
	import { initialMariachi, tickMariachi } from '$lib/weather/mariachiEvent';
	import { DEFAULT_DISPLAY, SYMBOLS, SYMBOL_CATEGORIES, resolveSymbol, spotWireSymbol, symbolsInCategory, type SymbolCategory } from '$lib/data/symbols';
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
	type TakeProfitFlash = { pnlUsd: number; target: 'TP1' | 'TP2'; expiresAt: number };
	let takeProfitFlashes = $state<Record<string, TakeProfitFlash>>({});
	let takeProfitCooldowns = $state<Record<string, number>>({});
	let lastDecisionCandle = 0;
	let marketRequest = 0;
	let tapeRequest = 0;
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
	let deskConsoleOpen = $state(false);
	let deskBookOpen = $state(false);
	let deskBookId = $state<DeskBookId | null>(null);
	let monitorPanelOpen = $state(false);
	let quickTradeOpen = $state(false);
	let quickTradePresetTraderId = $state<string | null>(null);
	let profitCalcOpen = $state(false);
	let coffeeTripActive = $state(false);
	let coffeeTripTimer: ReturnType<typeof setTimeout> | null = null;
	let deskSettings = $state(loadDeskSettings());
	let settingsOpen = $state(false);
	const selectedOfficeFlag = $derived(OFFICE_FLAGS.find((flag) => flag.id === deskSettings.officeFlag) ?? DEFAULT_OFFICE_FLAG);
	let traderOpenedAt = $state<Record<string, number>>({});
	let traderTimeOverrides = $state<Record<string, number>>({});
	let blofinAssignments = $state<BloFinAssignments>({});
	let blofinOverlay = $state<Record<string, string>>({});
	let sceneFrame = $state<HTMLDivElement>();
	let officeFloor = $state<HTMLElement>();
	let clipboardRoot = $state<HTMLElement>();
	let clipboardLeft = $state(16);
	let clipboardTop = $state(155);
	let clipboardReady = $state(false);
	let clipboardDragging = $state(false);
	let clipboardPointerId: number | null = null;
	let clipboardOffsetX = 0;
	let clipboardOffsetY = 0;

	const PRICE_PAD_KEY = 'phf-price-pad-pos';
	const CLIPBOARD_KEY = 'phf-clipboard-pos';
	const WIRE_MARKET_KEY = 'phf-wire-market';
	type WireDecorId = 'bull' | 'cabinet' | 'plant';
	const WIRE_DECOR_KEYS: Record<WireDecorId, string> = {
		bull: 'phf-market-wire-bull-pos',
		cabinet: 'phf-market-wire-cabinet-pos',
		plant: 'phf-market-wire-plant-pos'
	};
	const WIRE_DECOR_DEFAULTS: Record<WireDecorId, { left: number; top: number }> = {
		bull: { left: 369, top: 219 },
		cabinet: { left: 356, top: 245 },
		plant: { left: 728, top: 219 }
	};
	let wireDecorEls: Partial<Record<WireDecorId, HTMLElement>> = {};
	let wireDecorPositions = $state<Record<WireDecorId, { left: number; top: number; dragging: boolean }>>({
		bull: { ...WIRE_DECOR_DEFAULTS.bull, dragging: false },
		cabinet: { ...WIRE_DECOR_DEFAULTS.cabinet, dragging: false },
		plant: { ...WIRE_DECOR_DEFAULTS.plant, dragging: false }
	});
	const wireDecorDrag: Partial<Record<WireDecorId, { pointerId: number; offsetX: number; offsetY: number }>> = {};
	type LoungeDecorId = 'fortune' | 'loungePlant';
	const LOUNGE_DECOR_KEYS: Record<LoungeDecorId, string> = {
		fortune: 'phf-lounge-fortune-pos', loungePlant: 'phf-lounge-plant-pos'
	};
	const LOUNGE_DECOR_DEFAULTS: Record<LoungeDecorId, { left: number; top: number }> = {
		fortune: { left: 295, top: 778 },
		loungePlant: { left: 1264, top: 546 }
	};
	let loungeDecorEls: Partial<Record<LoungeDecorId, HTMLElement>> = {};
	let loungeDecorPositions = $state<Record<LoungeDecorId, { left: number; top: number; dragging: boolean }>>({
		fortune: { left: 0, top: 0, dragging: false }, loungePlant: { left: 0, top: 0, dragging: false }
	});
	const loungeDecorDrag: Partial<Record<LoungeDecorId, { pointerId: number; offsetX: number; offsetY: number }>> = {};
	const OFFICE_FLAG_KEY = 'phf-office-flag-pos';
	const OFFICE_FLAG_DEFAULT = { left: 934, top: 901 };
	const OFFICE_FLAG_INSET = 12;
	const CLIPBOARD_DEFAULT = { left: 30, top: 184 };
	const PRICE_PAD_DEFAULT = { left: 1150, top: 314 };
	let officeFlagEl = $state<HTMLElement>();
	let officeFlagPosition = $state({ ...OFFICE_FLAG_DEFAULT, dragging: false });
	const officeFlagDrag: { pointerId: number | null; offsetX: number; offsetY: number } = { pointerId: null, offsetX: 0, offsetY: 0 };
	let pricePadRoot = $state<HTMLElement>();
	let pricePadLeft = $state(18);
	let pricePadTop = $state(0);
	let pricePadReady = $state(false);
	let pricePadPlaced = $state(false);
	let pricePadDragging = $state(false);
	let pricePadPointerId: number | null = null;
	let pricePadOffsetX = 0;
	let pricePadOffsetY = 0;
	let pricePadSaved = $state<{ left: number; top: number } | null>(null);

	function onWireDecorPointerDown(id: WireDecorId, event: PointerEvent) {
		const el = wireDecorEls[id];
		if (!el || !sceneFrame || wireDecorDrag[id]) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		const rect = sceneFrame.getBoundingClientRect();
		wireDecorDrag[id] = {
			pointerId: event.pointerId,
			offsetX: (event.clientX - rect.left) * sceneFrame.clientWidth / rect.width - wireDecorPositions[id].left,
			offsetY: (event.clientY - rect.top) * sceneFrame.clientHeight / rect.height - wireDecorPositions[id].top
		};
		wireDecorPositions = { ...wireDecorPositions, [id]: { ...wireDecorPositions[id], dragging: true } };
		el.setPointerCapture(event.pointerId);
		event.preventDefault();
	}

	function onWireDecorPointerMove(id: WireDecorId, event: PointerEvent) {
		const meta = wireDecorDrag[id];
		const el = wireDecorEls[id];
		if (!meta || meta.pointerId !== event.pointerId || !sceneFrame || !el) return;
		const parentRect = sceneFrame.getBoundingClientRect();
		const scaleX = parentRect.width > 0 ? sceneFrame.clientWidth / parentRect.width : 1;
		const scaleY = parentRect.height > 0 ? sceneFrame.clientHeight / parentRect.height : 1;
		const width = el.offsetWidth;
		const height = el.offsetHeight;
		const left = Math.max(0, Math.min(sceneFrame.clientWidth - width, (event.clientX - parentRect.left) * scaleX - meta.offsetX));
		const top = Math.max(0, Math.min(sceneFrame.clientHeight - height, (event.clientY - parentRect.top) * scaleY - meta.offsetY));
		wireDecorPositions = { ...wireDecorPositions, [id]: { ...wireDecorPositions[id], left, top } };
		event.preventDefault();
	}

	function onWireDecorPointerUp(id: WireDecorId, event: PointerEvent) {
		const meta = wireDecorDrag[id];
		const el = wireDecorEls[id];
		if (!meta || meta.pointerId !== event.pointerId) return;
		const position = wireDecorPositions[id];
		saveScenePosition(WIRE_DECOR_KEYS[id], position);
		wireDecorPositions = { ...wireDecorPositions, [id]: { ...position, dragging: false } };
		delete wireDecorDrag[id];
		if (el?.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
	}

	function onWireDecorKeyDown(id: WireDecorId, event: KeyboardEvent) {
		const delta: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
		const move = delta[event.key];
		if (!move) return;
		event.preventDefault();
		const step = event.shiftKey ? 20 : 5;
		const position = wireDecorPositions[id];
		wireDecorPositions = { ...wireDecorPositions, [id]: { ...position, left: position.left + move[0] * step, top: position.top + move[1] * step } };
		clampWireDecorToScene();
		saveScenePosition(WIRE_DECOR_KEYS[id], wireDecorPositions[id]);
	}

	function bindWireDecor(node: HTMLElement, id: WireDecorId) {
		wireDecorEls[id] = node;
		return {
			destroy() {
				delete wireDecorEls[id];
			}
		};
	}

	function placeOfficeFlag() {
		if (!sceneFrame || !officeFlagEl) return;
		const saved = loadScenePosition(OFFICE_FLAG_KEY);
		const narrow = sceneFrame.clientWidth <= 768;
		const maxLeft = Math.max(0, sceneFrame.clientWidth - officeFlagEl.offsetWidth);
		const maxTop = Math.max(0, sceneFrame.clientHeight - officeFlagEl.offsetHeight);
		const insetX = Math.min(OFFICE_FLAG_INSET, maxLeft / 2);
		const insetY = Math.min(OFFICE_FLAG_INSET, maxTop / 2);
		const mobileDefault = { left: maxLeft - insetX, top: insetY };
		const source = narrow && (!saved || saved.left > maxLeft) ? mobileDefault : (saved ?? OFFICE_FLAG_DEFAULT);
		officeFlagPosition = {
			...officeFlagPosition,
			left: Math.min(Math.max(insetX, source.left), maxLeft - insetX),
			top: Math.min(Math.max(insetY, source.top), maxTop - insetY)
		};
	}
	function onOfficeFlagPointerDown(event: PointerEvent) {
		if (!officeFlagEl || !sceneFrame || officeFlagDrag.pointerId !== null) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		const rect = sceneFrame.getBoundingClientRect();
		officeFlagDrag.pointerId = event.pointerId;
		officeFlagDrag.offsetX = (event.clientX - rect.left) * sceneFrame.clientWidth / rect.width - officeFlagPosition.left;
		officeFlagDrag.offsetY = (event.clientY - rect.top) * sceneFrame.clientHeight / rect.height - officeFlagPosition.top;
		officeFlagPosition = { ...officeFlagPosition, dragging: true };
		officeFlagEl.setPointerCapture(event.pointerId);
		event.preventDefault();
	}
	function onOfficeFlagPointerMove(event: PointerEvent) {
		if (!sceneFrame || !officeFlagEl || officeFlagDrag.pointerId !== event.pointerId) return;
		const rect = sceneFrame.getBoundingClientRect();
		const scaleX = rect.width > 0 ? sceneFrame.clientWidth / rect.width : 1;
		const scaleY = rect.height > 0 ? sceneFrame.clientHeight / rect.height : 1;
		const maxLeft = Math.max(0, sceneFrame.clientWidth - officeFlagEl.offsetWidth);
		const maxTop = Math.max(0, sceneFrame.clientHeight - officeFlagEl.offsetHeight);
		const insetX = Math.min(OFFICE_FLAG_INSET, maxLeft / 2);
		const insetY = Math.min(OFFICE_FLAG_INSET, maxTop / 2);
		officeFlagPosition = {
			...officeFlagPosition,
			left: Math.min(Math.max(insetX, (event.clientX - rect.left) * scaleX - officeFlagDrag.offsetX), maxLeft - insetX),
			top: Math.min(Math.max(insetY, (event.clientY - rect.top) * scaleY - officeFlagDrag.offsetY), maxTop - insetY)
		};
		event.preventDefault();
	}
	function onOfficeFlagPointerUp(event: PointerEvent) {
		if (!officeFlagEl || officeFlagDrag.pointerId !== event.pointerId) return;
		saveScenePosition(OFFICE_FLAG_KEY, officeFlagPosition);
		officeFlagPosition = { ...officeFlagPosition, dragging: false };
		officeFlagDrag.pointerId = null;
		if (officeFlagEl.hasPointerCapture(event.pointerId)) officeFlagEl.releasePointerCapture(event.pointerId);
	}
	function bindOfficeFlag(node: HTMLElement) {
		officeFlagEl = node;
		return { destroy() { if (officeFlagEl === node) officeFlagEl = undefined; } };
	}

	function bindLoungeDecor(node: HTMLElement, id: LoungeDecorId) {
		loungeDecorEls[id] = node;
		return { destroy() { delete loungeDecorEls[id]; } };
	}

	function placeLoungeDecor() {
		if (!sceneFrame || !officeFloor) return;
		for (const id of Object.keys(LOUNGE_DECOR_KEYS) as LoungeDecorId[]) {
			const saved = loadScenePosition(LOUNGE_DECOR_KEYS[id]);
			const el = loungeDecorEls[id];
			if (!el) continue;
			const source = saved ?? LOUNGE_DECOR_DEFAULTS[id];
			loungeDecorPositions = { ...loungeDecorPositions, [id]: {
				...loungeDecorPositions[id], left: Math.max(0, Math.min(source.left, sceneFrame.clientWidth - el.offsetWidth)),
				top: Math.max(0, Math.min(source.top, sceneFrame.clientHeight - el.offsetHeight))
			} };
		}
	}

	function onLoungeDecorPointerDown(id: LoungeDecorId, event: PointerEvent) {
		const el = loungeDecorEls[id];
		if (!el || !sceneFrame || loungeDecorDrag[id] || (event.pointerType === 'mouse' && event.button !== 0)) return;
		const rect = sceneFrame.getBoundingClientRect();
		loungeDecorDrag[id] = { pointerId: event.pointerId, offsetX: (event.clientX - rect.left) * sceneFrame.clientWidth / rect.width - loungeDecorPositions[id].left, offsetY: (event.clientY - rect.top) * sceneFrame.clientHeight / rect.height - loungeDecorPositions[id].top };
		loungeDecorPositions = { ...loungeDecorPositions, [id]: { ...loungeDecorPositions[id], dragging: true } };
		el.setPointerCapture(event.pointerId);
		event.preventDefault();
	}

	function onLoungeDecorPointerMove(id: LoungeDecorId, event: PointerEvent) {
		const meta = loungeDecorDrag[id];
		const el = loungeDecorEls[id];
		if (!meta || meta.pointerId !== event.pointerId || !el || !sceneFrame) return;
		const rect = sceneFrame.getBoundingClientRect();
		const scaleX = sceneFrame.clientWidth / rect.width;
		const scaleY = sceneFrame.clientHeight / rect.height;
		const left = Math.max(0, Math.min(sceneFrame.clientWidth - el.offsetWidth, (event.clientX - rect.left) * scaleX - meta.offsetX));
		const top = Math.max(0, Math.min(sceneFrame.clientHeight - el.offsetHeight, (event.clientY - rect.top) * scaleY - meta.offsetY));
		loungeDecorPositions = { ...loungeDecorPositions, [id]: { ...loungeDecorPositions[id], left, top } };
		event.preventDefault();
	}

	function onLoungeDecorPointerUp(id: LoungeDecorId, event: PointerEvent) {
		const meta = loungeDecorDrag[id];
		const el = loungeDecorEls[id];
		if (!meta || meta.pointerId !== event.pointerId) return;
		const position = loungeDecorPositions[id];
		saveScenePosition(LOUNGE_DECOR_KEYS[id], position);
		loungeDecorPositions = { ...loungeDecorPositions, [id]: { ...position, dragging: false } };
		delete loungeDecorDrag[id];
		if (el?.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
	}

	function clampWireDecorToScene() {
		if (!sceneFrame) return;
		for (const id of Object.keys(WIRE_DECOR_KEYS) as WireDecorId[]) {
			const el = wireDecorEls[id];
			if (!el) continue;
			const position = wireDecorPositions[id];
			const left = Math.max(0, Math.min(position.left, sceneFrame.clientWidth - el.offsetWidth));
			const top = Math.max(0, Math.min(position.top, sceneFrame.clientHeight - el.offsetHeight));
			if (left !== position.left || top !== position.top) {
				wireDecorPositions = { ...wireDecorPositions, [id]: { ...position, left, top } };
			}
		}
	}


	/** Individual desk props - each drags alone; positions in localStorage. */
	type DeskPropId = 'pad' | 'calc' | 'coffee' | 'set' | 'keyboard' | 'wsj' | 'legal';
	type DeskPropState = {
		left: number;
		top: number;
		ready: boolean;
		placed: boolean;
		dragging: boolean;
		suppressClick: boolean;
	};

	const DESK_PROP_KEYS: Record<DeskPropId, string> = {
		pad: 'phf-tool-pad-pos',
		calc: 'phf-tool-calc-pos',
		coffee: 'phf-tool-coffee-pos',
		set: 'phf-tool-set-pos',
		keyboard: 'phf-tool-keyboard-pos',
		wsj: 'phf-wsj-pos',
		legal: 'phf-legal-pad-pos'
	};
	const DESK_PROP_DEFAULT_KEYS: Record<DeskPropId, string> = {
		pad: 'phf-default-tool-pad-pos', calc: 'phf-default-tool-calc-pos', coffee: 'phf-default-tool-coffee-pos',
		set: 'phf-default-tool-set-pos', keyboard: 'phf-default-tool-keyboard-pos', wsj: 'phf-default-wsj-pos', legal: 'phf-default-legal-pad-pos'
	};

	const DESK_PROP_DEFAULTS: Record<DeskPropId, { left: number; top: number }> = {
		pad: { left: 1065, top: 31 },
		calc: { left: 1175, top: 77 },
		coffee: { left: 1232, top: 17 },
		set: { left: 1323, top: 78 },
		keyboard: { left: 870, top: 69 },
		wsj: { left: 232, top: 20 },
		legal: { left: 384, top: 21 }
	};

	let foregroundDesk = $state<HTMLElement>();
	let foregroundDeskTop = $state(0);
	let deskPropEls: Partial<Record<DeskPropId, HTMLElement>> = {};
	let deskProps = $state<Record<DeskPropId, DeskPropState>>(
		(Object.keys(DESK_PROP_DEFAULTS) as DeskPropId[]).reduce(
			(acc, id) => {
				acc[id] = {
					...DESK_PROP_DEFAULTS[id],
					ready: false,
					placed: false,
					dragging: false,
					suppressClick: false
				};
				return acc;
			},
			{} as Record<DeskPropId, DeskPropState>
		)
	);

	/** MARKET WIRE category filter */
	let wireCategory = $state<SymbolCategory | 'all'>('all');
	let wireMarket = $state<'futures' | 'spot'>('futures');
	const filteredTapeQuotes = $derived(
		tapeQuotes.filter((q) => {
			if (wireCategory === 'all') return true;
			return (q.category ?? resolveSymbol(q.display).category) === wireCategory;
		})
	);
	const wireChannels = $derived.by(() => {
		const seen = new Set<string>();
		const rows = filteredTapeQuotes
			.slice(0, 20)
			.map((q) => ({ display: q.display, label: q.label ?? resolveSymbol(q.display).label }))
			.filter((row) => {
				if (seen.has(row.display)) return false;
				seen.add(row.display);
				return true;
			});
		return rows.length ? rows : symbolsInCategory(wireCategory).map((s) => ({ display: s.display, label: s.label }));
	});
	const wireTokenQuotes = $derived(
		filteredTapeQuotes.filter((q) => /(?:\d+(?:L|S)|\d+X(?:LONG|SHORT))$/i.test(q.display.replace(/USDT$/, '')))
	);

	/** WSJ headlines for active symbol */
	type DeskHeadline = { title: string; link: string; source: string };
	let newsHeadlines = $state<DeskHeadline[]>([]);
	let newsSample = $state(true);
	let wsjExpanded = $state(false);

	/** Live exchange positions for yellow legal pad */
	type DeskPosLine = { venue: 'BF' | 'BY'; text: string };
	let deskPosLines = $state<DeskPosLine[]>([]);
	let deskPosNote = $state<string | null>(null);

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
	function tradeDurationFor(id: string): number | null {
		if (!legFor(id)) return null;
		const openedAt = traderOpenedAt[id] ?? totalSimMinutes;
		const elapsed = Math.max(0, Math.floor(totalSimMinutes - openedAt));
		return (traderTimeOverrides[id] ?? 0) + elapsed;
	}
	function setTraderTradeDuration(traderId: string, minutes: number) {
		if (!Number.isInteger(minutes) || minutes < 0 || minutes > 100000) return;
		// Reset the elapsed-time anchor so a manual duration keeps counting up.
		traderOpenedAt = { ...traderOpenedAt, [traderId]: totalSimMinutes };
		traderTimeOverrides = { ...traderTimeOverrides, [traderId]: minutes };
		saveTraderTimeOverrides(traderTimeOverrides);
	}
	function reconcileTraderTimes(nextBook: OpenBook) {
		const nextOpened = { ...traderOpenedAt };
		const nextOverrides = { ...traderTimeOverrides };
		for (const id of Object.keys(nextBook)) {
			if (nextOpened[id] == null) nextOpened[id] = totalSimMinutes;
		}
		for (const id of Object.keys(nextOpened)) {
			if (nextBook[id] == null) {
				delete nextOpened[id];
				delete nextOverrides[id];
			}
		}
		traderOpenedAt = nextOpened;
		traderTimeOverrides = nextOverrides;
		saveTraderTimeOverrides(nextOverrides);
	}
	function blofinBadgeFor(traderId: string): string | null {
		if (!deskSettings.showBlofinBadges) return null;
		if (blofinOverlay[traderId]) return blofinOverlay[traderId];
		const assigned = Object.entries(blofinAssignments)
			.filter(([, tid]) => tid === traderId)
			.map(([pid]) => pid);
		return assigned.length ? `BFx${assigned.length}` : null;
	}
	function openDeskConsole() {
		deskConsoleOpen = true;
	}
	function openMonitorPanel() {
		monitorPanelOpen = true;
	}

	function openDeskBook(id: DeskBookId) {
		deskBookId = id;
		deskBookOpen = true;
	}

	function openQuickTrade() {
		quickTradePresetTraderId = null;
		quickTradeOpen = true;
	}

	/** Floor trader click -> fund panel preset to that desk (also pins). */
	function openQuickTradeFor(traderId: string) {
		quickTradePresetTraderId = traderId;
		inspectedId = traderId;
		pinnedId = traderId;
		quickTradeOpen = true;
	}
	function openProfitCalc() {
		profitCalcOpen = true;
	}
	function updateDeskSetting<K extends keyof DeskSettings>(key: K, value: DeskSettings[K]) {
		deskSettings = { ...deskSettings, [key]: value };
		saveDeskSettings(deskSettings);
	}

	function toggleHideAllDraggables() {
		const hide = !deskSettings.hideAllDraggables;
		deskSettings = {
			...deskSettings,
			hideAllDraggables: hide,
			showClipboard: !hide,
			showPricePad: !hide,
			showFax: !hide,
			showPet: !hide,
			showTrash: !hide,
			showCrtCart: !hide
		};
		saveDeskSettings(deskSettings);
	}

	function openDeskSettings() {
		settingsOpen = true;
	}

	function triggerCoffeeTrip() {
		if (deskSettings.disableCoffeeTrip || deskSettings.reduceMotion) return;
		if (coffeeTripActive) return;
		coffeeTripActive = true;
		if (coffeeTripTimer) clearTimeout(coffeeTripTimer);
		const ms = 2000 + Math.floor(Math.random() * 2000); // 2"4s
		coffeeTripTimer = setTimeout(() => {
			coffeeTripActive = false;
			coffeeTripTimer = null;
		}, ms);
	}
	function postureFor(t: TraderDef) {
		return postureForTrader(t, signal, legFor(t.id));
	}
	function showTakeProfit(traderId: string, pnlUsd: number, target: 'TP1' | 'TP2') {
		const expiresAt = Date.now() + 2800;
		takeProfitFlashes = { ...takeProfitFlashes, [traderId]: { pnlUsd, target, expiresAt } };
		window.setTimeout(() => {
			if (takeProfitFlashes[traderId]?.expiresAt !== expiresAt) return;
			const { [traderId]: _, ...rest } = takeProfitFlashes;
			takeProfitFlashes = rest;
		}, 2800);
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
		pollNews();
		pollDeskPositions();
	}

	function fmt(n: number | undefined, digits = priceDecimals) {
		return n == null || !Number.isFinite(n) ? '-' : n.toFixed(digits);
	}
	function pnl(n: number | undefined) {
		if (n == null) return '-';
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
		if (!sceneFrame || !clipboardRoot || !officeFloor || !foregroundDesk || clipboardReady) return;
		const saved = loadScenePosition(CLIPBOARD_KEY);
		const narrow = sceneFrame.clientWidth <= 480;
		const mobileDefault = { left: 8, top: deskSurfaceOffsetTop() + 556 };
		const mobileMinTop = deskSurfaceOffsetTop();
		const source = narrow && (!saved || saved.top < mobileMinTop)
			? mobileDefault
			: { left: saved?.left ?? CLIPBOARD_DEFAULT.left, top: saved?.top ?? CLIPBOARD_DEFAULT.top };
		setClipboardPosition(source.left, source.top);
		clipboardReady = true;
	}

	function reflowClipboard() {
		// Positions are intentional user layout, so a viewport change must not move them.
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
		if (clipboardDragging) {
			saveScenePosition(CLIPBOARD_KEY, { left: clipboardLeft, top: clipboardTop });
		}
		clipboardDragging = false;
		clipboardPointerId = null;
		if (clipboardRoot.hasPointerCapture(event.pointerId)) clipboardRoot.releasePointerCapture(event.pointerId);
	}

	function pricePadBounds() {
		if (!sceneFrame || !pricePadRoot) return null;
		const width = pricePadRoot.offsetWidth;
		const height = pricePadRoot.offsetHeight;
		return {
			maxLeft: Math.max(0, sceneFrame.clientWidth - width),
			maxTop: Math.max(0, sceneFrame.clientHeight - height)
		};
	}

	function clampPricePad(left: number, top: number) {
		const bounds = pricePadBounds();
		if (!bounds) return { left, top };
		return {
			left: Math.min(Math.max(0, left), bounds.maxLeft),
			top: Math.min(Math.max(0, top), bounds.maxTop)
		};
	}

	function setPricePadPosition(left: number, top: number) {
		const next = clampPricePad(left, top);
		pricePadLeft = next.left;
		pricePadTop = next.top;
	}

	function defaultPricePadPosition() {
		return PRICE_PAD_DEFAULT;
	}

	function mobilePricePadPosition() {
		if (!foregroundDesk) return defaultPricePadPosition();
		return { left: 12, top: deskSurfaceOffsetTop() + 448 };
	}

	function placePricePad() {
		if (!sceneFrame || !pricePadRoot || !foregroundDesk || pricePadPlaced) return;
		const fallback = defaultPricePadPosition();
		const narrow = sceneFrame.clientWidth <= 768;
		const source = narrow && (!pricePadSaved || pricePadSaved.top < deskSurfaceOffsetTop())
			? mobilePricePadPosition()
			: { left: pricePadSaved?.left ?? fallback.left, top: pricePadSaved?.top ?? fallback.top };
		setPricePadPosition(source.left, source.top);
		pricePadPlaced = true;
		pricePadReady = true;
	}

	function reflowPricePad() {
		// Positions are intentional user layout, so a viewport change must not move them.
	}

	function onPricePadPointerDown(event: PointerEvent) {
		if (!pricePadRoot || pricePadPointerId !== null) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		const target = event.target;
		if (target instanceof HTMLElement && target.closest('a, button, input, select, textarea, [data-no-drag]')) return;

		event.preventDefault();
		const frameRect = sceneFrame?.getBoundingClientRect();
		const panelRect = pricePadRoot.getBoundingClientRect();
		const scaleX = frameRect && frameRect.width > 0 ? sceneFrame!.clientWidth / frameRect.width : 1;
		const scaleY = frameRect && frameRect.height > 0 ? sceneFrame!.clientHeight / frameRect.height : 1;
		pricePadOffsetX = (event.clientX - panelRect.left) * scaleX;
		pricePadOffsetY = (event.clientY - panelRect.top) * scaleY;
		pricePadPointerId = event.pointerId;
		pricePadDragging = true;
		pricePadRoot.setPointerCapture(event.pointerId);
	}

	function onPricePadPointerMove(event: PointerEvent) {
		if (!pricePadDragging || pricePadPointerId !== event.pointerId || !sceneFrame) return;
		const frameRect = sceneFrame.getBoundingClientRect();
		const scaleX = frameRect.width > 0 ? sceneFrame.clientWidth / frameRect.width : 1;
		const scaleY = frameRect.height > 0 ? sceneFrame.clientHeight / frameRect.height : 1;
		setPricePadPosition(
			(event.clientX - frameRect.left) * scaleX - pricePadOffsetX,
			(event.clientY - frameRect.top) * scaleY - pricePadOffsetY
		);
	}

	function stopPricePadDragging(event: PointerEvent) {
		if (!pricePadRoot || pricePadPointerId !== event.pointerId) return;
		if (pricePadDragging) {
			saveScenePosition(PRICE_PAD_KEY, { left: pricePadLeft, top: pricePadTop });
		}
		pricePadDragging = false;
		pricePadPointerId = null;
		if (pricePadRoot.hasPointerCapture(event.pointerId)) pricePadRoot.releasePointerCapture(event.pointerId);
	}


	function deskSurfaceOffsetTop() {
		return foregroundDesk?.offsetTop ?? 0;
	}

	function clampDeskProp(id: DeskPropId, left: number, top: number) {
		const parent = sceneFrame;
		const el = deskPropEls[id];
		if (!parent || !el) return { left, top };
		return {
			left: Math.min(Math.max(0, left), Math.max(0, parent.clientWidth - el.offsetWidth)),
			top: Math.min(Math.max(0, top), Math.max(0, parent.clientHeight - el.offsetHeight))
		};
	}

	function setDeskPropPos(id: DeskPropId, left: number, top: number) {
		const next = clampDeskProp(id, left, top);
		deskProps = {
			...deskProps,
			[id]: { ...deskProps[id], left: next.left, top: next.top }
		};
	}

	function saveCurrentDeskLayoutAsDefault() {
		const deskTop = deskSurfaceOffsetTop();
		for (const id of Object.keys(DESK_PROP_DEFAULTS) as DeskPropId[]) {
			saveScenePosition(DESK_PROP_DEFAULT_KEYS[id], {
				left: deskProps[id].left,
				top: deskProps[id].top - deskTop
			});
		}
	}

	function mobileDeskPropLayout(): Record<DeskPropId, { left: number; top: number }> {
		const deskTop = deskSurfaceOffsetTop();
		const mobileTop = deskTop + 224;
		const phone = (sceneFrame?.clientWidth ?? 0) <= 480;
		if (!phone || !sceneFrame) {
			return {
				wsj: { left: 8, top: mobileTop },
				legal: { left: 150, top: mobileTop },
				keyboard: { left: 8, top: mobileTop + 116 },
				pad: { left: 154, top: mobileTop + 116 },
				calc: { left: 250, top: mobileTop + 116 },
				coffee: { left: 306, top: mobileTop + 116 },
				set: { left: 356, top: mobileTop + 116 }
			};
		}
		const width = sceneFrame.clientWidth;
		return {
			wsj: { left: 8, top: mobileTop },
			legal: { left: Math.max(8, width - 113), top: mobileTop },
			keyboard: { left: 8, top: mobileTop + 116 },
			pad: { left: 154, top: mobileTop + 116 },
			calc: { left: Math.max(8, width - 44), top: mobileTop + 116 },
			coffee: { left: 8, top: mobileTop + 172 },
			set: { left: 50, top: mobileTop + 172 }
		};
	}

	function placeDeskProp(id: DeskPropId) {
		if (deskProps[id].placed || !deskPropEls[id] || !sceneFrame || !foregroundDesk) return;
		const saved = loadScenePosition(DESK_PROP_KEYS[id]);
		const narrow = sceneFrame.clientWidth <= 768;
		const deskTop = deskSurfaceOffsetTop();
		const mobileLayout = mobileDeskPropLayout();
		const savedDefault = loadScenePosition(DESK_PROP_DEFAULT_KEYS[id]);
		// Earlier builds stored default positions in scene coordinates. Normalize
		// those once while keeping new defaults desk-relative.
		const defaultTop = savedDefault
			? (savedDefault.top >= deskTop ? savedDefault.top - deskTop : savedDefault.top)
			: DESK_PROP_DEFAULTS[id].top;
		const fallback = {
			left: savedDefault?.left ?? DESK_PROP_DEFAULTS[id].left,
			top: defaultTop + deskTop
		};
		// Migrate legacy desk-local saves (tops lived in the ~150px foreground strip).
		let left = saved?.left ?? fallback.left;
		let top = saved?.top ?? fallback.top;
		if (narrow && (!saved || saved.left >= sceneFrame.clientWidth || saved.top < deskTop || saved.top > deskTop + foregroundDesk.clientHeight)) {
			left = mobileLayout[id].left;
			top = mobileLayout[id].top;
		}
		if (saved && saved.top <= 160 && deskTop > 0) {
			top = saved.top + deskTop;
		}
		setDeskPropPos(id, left, top);
		deskProps = {
			...deskProps,
			[id]: { ...deskProps[id], placed: true, ready: true }
		};
	}

	function placeAllDeskProps() {
		(Object.keys(DESK_PROP_DEFAULTS) as DeskPropId[]).forEach(placeDeskProp);
	}

	function reflowDeskProps() {
		// Positions are intentional user layout, so a viewport change must not move them.
	}

	/** Click-vs-drag: arm on pointerdown; drag after >4px or 200ms hold. */
	const deskDragMeta: Partial<
		Record<
			DeskPropId,
			{
				pointerId: number | null;
				offsetX: number;
				offsetY: number;
				startX: number;
				startY: number;
				armed: boolean;
				holdTimer: ReturnType<typeof setTimeout> | null;
			}
		>
	> = {};

	function deskDragMetaFor(id: DeskPropId) {
		if (!deskDragMeta[id]) {
			deskDragMeta[id] = {
				pointerId: null,
				offsetX: 0,
				offsetY: 0,
				startX: 0,
				startY: 0,
				armed: false,
				holdTimer: null
			};
		}
		return deskDragMeta[id]!;
	}

	function beginDeskDrag(id: DeskPropId, event: PointerEvent) {
		const el = deskPropEls[id];
		const parent = sceneFrame;
		const meta = deskDragMetaFor(id);
		if (!el || !parent) return;
		const parentRect = parent.getBoundingClientRect();
		const panelRect = el.getBoundingClientRect();
		const scaleX = parentRect.width > 0 ? parent.clientWidth / parentRect.width : 1;
		const scaleY = parentRect.height > 0 ? parent.clientHeight / parentRect.height : 1;
		meta.offsetX = (event.clientX - panelRect.left) * scaleX;
		meta.offsetY = (event.clientY - panelRect.top) * scaleY;
		deskProps = {
			...deskProps,
			[id]: { ...deskProps[id], dragging: true, suppressClick: true }
		};
		el.setPointerCapture(event.pointerId);
	}

	function onDeskPropPointerDown(id: DeskPropId, event: PointerEvent) {
		const el = deskPropEls[id];
		const meta = deskDragMetaFor(id);
		if (!el || meta.pointerId !== null) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		meta.pointerId = event.pointerId;
		meta.armed = true;
		meta.startX = event.clientX;
		meta.startY = event.clientY;
		deskProps = {
			...deskProps,
			[id]: { ...deskProps[id], suppressClick: false }
		};
		/* Paper/legal: movement-only drag so a click can expand. Tools: also allow 200ms hold. */
		if (id !== 'wsj' && id !== 'legal') {
			meta.holdTimer = setTimeout(() => {
				if (meta.armed && meta.pointerId === event.pointerId && !deskProps[id].dragging) {
					beginDeskDrag(id, event);
				}
			}, 200);
		}
	}

	function onDeskPropPointerMove(id: DeskPropId, event: PointerEvent) {
		const meta = deskDragMetaFor(id);
		const parent = sceneFrame;
		if (meta.pointerId !== event.pointerId || !meta.armed || !parent) return;
		const dx = event.clientX - meta.startX;
		const dy = event.clientY - meta.startY;
		if (!deskProps[id].dragging && Math.hypot(dx, dy) > 4) {
			if (meta.holdTimer) {
				clearTimeout(meta.holdTimer);
				meta.holdTimer = null;
			}
			beginDeskDrag(id, event);
		}
		if (!deskProps[id].dragging) return;
		event.preventDefault();
		const parentRect = parent.getBoundingClientRect();
		const scaleX = parentRect.width > 0 ? parent.clientWidth / parentRect.width : 1;
		const scaleY = parentRect.height > 0 ? parent.clientHeight / parentRect.height : 1;
		setDeskPropPos(
			id,
			(event.clientX - parentRect.left) * scaleX - meta.offsetX,
			(event.clientY - parentRect.top) * scaleY - meta.offsetY
		);
	}

	function onDeskPropPointerUp(id: DeskPropId, event: PointerEvent) {
		const meta = deskDragMetaFor(id);
		const el = deskPropEls[id];
		if (meta.pointerId !== event.pointerId) return;
		if (meta.holdTimer) {
			clearTimeout(meta.holdTimer);
			meta.holdTimer = null;
		}
		if (deskProps[id].dragging) {
			saveScenePosition(DESK_PROP_KEYS[id], {
				left: deskProps[id].left,
				top: deskProps[id].top
			});
		}
		deskProps = {
			...deskProps,
			[id]: { ...deskProps[id], dragging: false }
		};
		meta.armed = false;
		meta.pointerId = null;
		if (el?.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
	}

	function deskPropAction(node: HTMLElement, id: DeskPropId) {
		bindDeskProp(id, node);
		return {
			destroy() {
				delete deskPropEls[id];
			}
		};
	}

	function bindDeskProp(id: DeskPropId, node: HTMLElement) {
		deskPropEls[id] = node;
		queueMicrotask(() => placeDeskProp(id));
	}

	function deskPropClick(id: DeskPropId, action: () => void) {
		if (deskProps[id].suppressClick) {
			deskProps = {
				...deskProps,
				[id]: { ...deskProps[id], suppressClick: false }
			};
			return;
		}
		action();
	}

	function setWireCategory(cat: SymbolCategory | 'all') {
		wireCategory = cat;
		queueMicrotask(() => {
			if (!wireChannels.some((s) => s.display === activeDisplay) && wireChannels[0]) {
				selectWireTicker(wireChannels[0].display);
			}
		});
	}

	function setWireMarket(market: 'futures' | 'spot') {
		wireMarket = market;
		try {
			localStorage.setItem(WIRE_MARKET_KEY, market);
		} catch {
			/* ignore */
		}
		void pollTape(market);
	}

	function wireLabel(display: string, q?: QuoteResponse): string {
		return q?.label ? `${q.label} . ${q.venue ?? 'WIRE'}` : wireMarket === 'spot' ? spotWireSymbol(display) : resolveSymbol(display).label;
	}

	function wireDecimals(display: string, price: number, q?: QuoteResponse): number {
		if (q?.decimals != null) return q.decimals;
		const known = SYMBOLS.find((s) => s.display === display);
		if (known) return known.decimals;
		return price < 1 ? 8 : 4;
	}

	function selectWireTicker(display: string) {
		setSymbol(display);
	}

	async function pollTape(market = wireMarket) {
		const request = ++tapeRequest;
		try {
			const res = await fetch(`/api/market/tape?market=${market}`);
			if (!res.ok) throw new Error('Market Wire unavailable');
			const tape = (await res.json()) as { market?: 'futures' | 'spot'; quotes?: QuoteResponse[] };
			if (request !== tapeRequest || market !== wireMarket) return;
			tapeQuotes = tape.quotes ?? [];
		} catch (e) {
			if (request !== tapeRequest || market !== wireMarket) return;
			tapeQuotes = [];
			err = e instanceof Error ? e.message : 'Market Wire unavailable';
		}
	}

	async function pollNews() {
		const sym = activeDisplay;
		try {
			const res = await fetch(`/api/news?symbol=${encodeURIComponent(sym)}`);
			if (!res.ok) throw new Error('news HTTP');
			const data = (await res.json()) as {
				sample?: boolean;
				headlines?: { title: string; link: string; source: string }[];
			};
			if (sym !== activeDisplay) return;
			newsHeadlines = (data.headlines ?? []).slice(0, 5).map((h) => ({
				title: h.title,
				link: h.link ?? '',
				source: h.source ?? ''
			}));
			newsSample = !!data.sample || newsHeadlines.length === 0;
		} catch {
			if (sym !== activeDisplay) return;
			newsSample = true;
			newsHeadlines = [
				{
					title: `${activeDef.label} - wire quiet (SAMPLE)`,
					link: '',
					source: 'SAMPLE'
				}
			];
		}
	}

	async function pollDeskPositions() {
		const lines: DeskPosLine[] = [];
		let note: string | null = null;
		try {
			const [bfRes, byRes] = await Promise.all([
				exchangeFetch('/api/blofin/positions'),
				exchangeFetch('/api/bybit/positions')
			]);
			if (bfRes.ok) {
				const bf = (await bfRes.json()) as {
					ok?: boolean;
					sample?: boolean;
					error?: string;
					positions?: Array<{
						instId: string;
						side: string;
						size: number;
						leverage: number;
					}>;
				};
				if (!bf.ok && bf.error) {
					if (/403|network|block|cloudfront|country/i.test(bf.error)) {
						note = 'BF network blocked';
					} else if (!bf.sample) {
						note = `BF: ${bf.error}`;
					}
				}
				for (const p of bf.positions ?? []) {
					if (!p.size || p.side === 'flat') continue;
					const sym = String(p.instId ?? '').replace(/-USDT|_USDT|USDT/gi, '') || p.instId;
					lines.push({
						venue: 'BF',
						text: `${sym} ${String(p.side).toUpperCase()} ${p.size}x ${p.leverage}x`
					});
				}
			} else if (bfRes.status === 403 || bfRes.status === 503) {
				note = 'BF network blocked';
			}
			if (byRes.ok || byRes.status === 503) {
				const by = (await byRes.json()) as {
					ok?: boolean;
					note?: string;
					error?: string;
					positions?: Array<{
						symbol: string;
						deskSide: string;
						size: number;
						leverage: number;
					}>;
				};
				if (by.note && !note) note = by.note;
				for (const p of by.positions ?? []) {
					if (!p.size || p.deskSide === 'flat') continue;
					const sym = String(p.symbol ?? '').replace(/USDT$/i, '');
					lines.push({
						venue: 'BY',
						text: `${sym} ${String(p.deskSide).toUpperCase()} ${p.size}x ${p.leverage}x`
					});
				}
			}
		} catch {
			if (!note) note = 'Positions unreachable';
		}
		deskPosLines = lines;
		deskPosNote = note;
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
		traderOpenedAt = {};
		traderTimeOverrides = {};
		lastDecisionCandle = 0;
		quote = null;
		signal = null;
		bars = [];
		persistSymbol(def.display);
		pollMarket();
		pollNews();
		pollDeskPositions();
	}

	function onChannelChange(e: Event) {
		const v = (e.currentTarget as HTMLSelectElement).value;
		selectWireTicker(v);
	}

	async function pollMarket() {
		const request = ++marketRequest;
		const sym = activeDisplay;
		void pollTape();
		try {
			const [qRes, sRes, cRes] = await Promise.all([
				fetch(`/api/market/quote?symbol=${encodeURIComponent(sym)}`),
				fetch(`/api/market/signal?symbol=${encodeURIComponent(sym)}`),
				fetch(`/api/market/candles?symbol=${encodeURIComponent(sym)}&tf=15m&limit=80`)
			]);
			if (!qRes.ok || !sRes.ok || !cRes.ok) throw new Error('Live Bybit or BloFin data unavailable');
			const [q, s, candles] = await Promise.all([
				qRes.json() as Promise<QuoteResponse>, sRes.json() as Promise<SignalResponse>, cRes.json() as Promise<CandlesResponse>
			]);
			// Ignore stale responses if user switched mid-flight
			if (request !== marketRequest || sym !== activeDisplay) return;
			quote = q;
			signal = s;
			bars = candles.bars;
			const mark = q.mark || q.price;
			const def = resolveSymbol(sym);
			const decisionCandle = completedBars(bars, 15 * 60_000).at(-1)?.t ?? 0;
			const decisionPoint = decisionCandle !== 0 && decisionCandle !== lastDecisionCandle;
			const now = Date.now();
			const eligibleTraders = traders.filter((trader) => book[trader.id] || (takeProfitCooldowns[trader.id] ?? 0) <= now);
			const result = reconcileBook(
				book,
				s,
				eligibleTraders,
				mark,
				q.sample || s.sample || candles.sample,
				def.display,
				def.bybit,
				decisionPoint
			);
			if (decisionPoint) lastDecisionCandle = decisionCandle;
			book = result.book;
			legs = result.legs;
			for (const profit of result.takeProfits) {
				showTakeProfit(profit.traderId, profit.pnlUsd, profit.target);
				takeProfitCooldowns = { ...takeProfitCooldowns, [profit.traderId]: now + 90_000 };
			}
			reconcileTraderTimes(result.book);
			err = null;
		} catch (e) {
			if (request !== marketRequest || sym !== activeDisplay) return;
			quote = null;
			signal = null;
			bars = [];
			// Keep the last known cast legs through a transient tape failure. A
			// missing poll is not a closed-candle invalidation and should not
			// turn open traders into thinking or watching traders.
			err = e instanceof Error ? e.message : 'Market poll failed';
		}
	}

	onMount(() => {
		deskSettings = loadDeskSettings();
		let initial = DEFAULT_DISPLAY;
		try {
			const params = new URLSearchParams(window.location.search);
			const fromUrl = params.get('symbol');
			const fromStore = localStorage.getItem(STORAGE_KEY);
			const candidate = (fromUrl || fromStore || DEFAULT_DISPLAY).toUpperCase();
			initial = SYMBOLS.some((s) => s.display === candidate)
				? resolveSymbol(candidate).display
				: /^[A-Z0-9]+USDT$/.test(candidate)
					? candidate
					: DEFAULT_DISPLAY;
		} catch {
			initial = DEFAULT_DISPLAY;
		}
		activeDisplay = initial;
		try {
			const storedMarket = localStorage.getItem(WIRE_MARKET_KEY);
			if (storedMarket === 'spot' || storedMarket === 'futures') wireMarket = storedMarket;
		} catch {
			/* ignore */
		}
		persistSymbol(initial);

		let raf = 0;
		let last = performance.now();
		let pollAcc = 0;
		leverageOverrides = loadLeverageOverrides();
		traderTimeOverrides = loadTraderTimeOverrides();
		blofinAssignments = loadBloFinAssignments();
		pricePadSaved = loadScenePosition(PRICE_PAD_KEY);
		for (const id of Object.keys(WIRE_DECOR_KEYS) as WireDecorId[]) {
			const saved = loadScenePosition(WIRE_DECOR_KEYS[id]);
			if (saved) wireDecorPositions = { ...wireDecorPositions, [id]: { ...wireDecorPositions[id], ...saved } };
		}
		const onSceneResize = () => {
			foregroundDeskTop = deskSurfaceOffsetTop();
		};
		window.addEventListener('resize', onSceneResize);
		requestAnimationFrame(clampWireDecorToScene);
		requestAnimationFrame(placeLoungeDecor);
		requestAnimationFrame(placeOfficeFlag);
		void (async () => {
			const asg = blofinAssignments;
			if (!Object.keys(asg).length) return;
			try {
				const res = await exchangeFetch('/api/blofin/positions');
				const data = await res.json();
				const positions = Array.isArray(data?.positions) ? data.positions : [];
				const byPos = new Map(positions.map((pos: { positionId: string; instId: string; side: string }) => [pos.positionId, pos]));
				const overlay: Record<string, string> = {};
				for (const [positionId, traderId] of Object.entries(asg)) {
					const pos = byPos.get(positionId) as { instId: string; side: string } | undefined;
					const label = pos
						? `${pos.instId} ${pos.side === 'flat' ? '' : String(pos.side).toUpperCase()}`.trim()
						: `BFx1`;
					overlay[traderId] = overlay[traderId] ? `${overlay[traderId]} . ${label}` : label;
				}
				blofinOverlay = overlay;
			} catch {
				/* ignore - console will refresh */
			}
		})();
		pollMarket();
		const loop = (now: number) => {
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			totalSimMinutes += dt * SIM_MINUTES_PER_REAL_SECOND;
			clock = applyForcedChristmasSnow(tickSimClock(clock, dt, totalSimMinutes), deskSettings.forceChristmasSnow);
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

		const newsPollTimer = setInterval(() => { void pollNews(); }, 60_000);
		void pollNews();
		void pollDeskPositions();
		const posPollTimer = setInterval(() => { void pollDeskPositions(); }, 18_000);
		return () => {
			cancelAnimationFrame(raf);
			marketRequest++;
			tapeRequest++;
			clearInterval(newsPollTimer);
			clearInterval(posPollTimer);
			window.removeEventListener('resize', onSceneResize);
		};
	});
	$effect(() => {
		if (!clipboardRoot || !sceneFrame) return;
		requestAnimationFrame(() => {
			if (!clipboardRoot || !sceneFrame) return;
			placeClipboard();
		});
	});
	$effect(() => {
		if (!pricePadRoot || !sceneFrame) return;
		requestAnimationFrame(() => {
			if (!pricePadRoot || !sceneFrame) return;
			placePricePad();
		});
	});
	$effect(() => {
		if (!sceneFrame || !foregroundDesk) return;
		const updateDeskTop = () => {
			foregroundDeskTop = deskSurfaceOffsetTop();
			placeAllDeskProps();
		};
		const observer = new ResizeObserver(updateDeskTop);
		observer.observe(foregroundDesk);
		requestAnimationFrame(updateDeskTop);
		return () => observer.disconnect();
	});
	$effect(() => {
		if (!sceneFrame || !officeFlagEl) return;
		requestAnimationFrame(placeOfficeFlag);
	});
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape') pinnedId = null;
	}}
/>

<main
	class="scene"
	class:reduce-motion={deskSettings.reduceMotion}
	class:night-tint={deskSettings.nightModeTint}
	class:crt-scan={deskSettings.crtScanlines} data-phase={clock.phase}>
	<div class="scene-frame" bind:this={sceneFrame}>
		<section class="upper-wall">
			<div class="wall-panel left-wall">
				<div class="fund-sign">
					<div class="monogram">PHF</div>
					<div>
						<strong>PIXEL HEDGE FUND</strong><small>DISCIPLINE . RESEARCH . RETURNS</small>
					</div>
				</div>
				<div class="whiteboard">
					<h3>TODAY:</h3>
					<p>[ ] Review {activeDef.label} regime</p>
					<p>[ ] Check ST risk stops</p>
					<p>[ ] Rebalance allocation</p>
					<p>[ ] Watch funding / tape</p>
					<b>-> SMALL EDGE COMPOUNDS</b>
				</div>
			</div>

			<div class="window-wall" aria-label="Panoramic New York skyline at sunset">
				<!-- Render the view once so the skyline, sun, and ESB span all panes. -->
				<div class="panoramic-skyline">
					<Skyline
						phase={clock.phase}
						outdoorLux={clock.outdoorLux}
						raining={clock.raining}
						snowing={clock.snowing}
						kongActive={kong.active}
						kongFrame={kong.frame}
						reduceMotion={deskSettings.reduceMotion}
					/>
					<RainLayer intensity={clock.rainIntensity} />
					<SnowLayer intensity={clock.snowIntensity} reduceMotion={deskSettings.reduceMotion} />
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
						<span>MARKET WIRE . {wireMarket.toUpperCase()}</span>
						<i class:wire-sample={dev} class:wire-live={!dev} aria-label={dev ? 'Sample market data' : 'Live market data'}>
							{dev ? 'SAMPLE' : 'LIVE'}
						</i>
					</header>

					<div class="wire-cats" role="tablist" aria-label="Wire categories">
						{#each SYMBOL_CATEGORIES as cat (cat.id)}
							<button
								type="button"
								role="tab"
								class="wire-cat"
								class:active={wireCategory === cat.id}
								aria-selected={wireCategory === cat.id}
								onclick={() => setWireCategory(cat.id)}
							>{cat.label}</button>
						{/each}
					</div>
					<div class="wire-market-toggle" role="group" aria-label="Market Wire venue">
						<span>VENUE</span>
						<button type="button" class:active={wireMarket === 'futures'} onclick={() => setWireMarket('futures')}>FUTURES</button>
						<button type="button" class:active={wireMarket === 'spot'} onclick={() => setWireMarket('spot')}>SPOT</button>
					</div>
					<label class="channel-switch">
						<span>CHANNEL</span>
						<select value={activeDisplay} onchange={onChannelChange} aria-label="Active trading symbol">
							{#if !wireChannels.some((s) => s.display === activeDisplay)}
								<option value={activeDisplay}>{activeDisplay} (selected)</option>
							{/if}
							{#each wireChannels as s (s.display)}
								<option value={s.display}>{s.label} . {s.display}</option>
							{/each}
						</select>
					</label>
					{#if (wireCategory === 'etf' || wireCategory === 'stock') && !filteredTapeQuotes.length}
						<p class="wire-note">No live ETF/stock perps on desk venues - tabs reserved.</p>
					{/if}
					{#if wireMarket === 'futures'}
						<p class="wire-note">TOP 20 VOLUME . BYBIT + BLOFIN</p>
					{/if}
					{#if wireMarket === 'spot' && wireTokenQuotes.length === 0}
						<p class="wire-note">No live leveraged spot tokens returned by Bybit right now . checked SHIB3L / SHIB3S / SHIB5L / SHIB5S.</p>
					{:else if wireMarket === 'spot'}
						<div class="wire-token-heading">LEVERAGED SPOT TOKENS</div>
						{#each wireTokenQuotes as tq (tq.display)}
							<div class="wire-token-row">
								<b>{wireLabel(tq.display, tq)}</b>
								<strong>{tq.price.toFixed(wireDecimals(tq.display, tq.price, tq))}</strong>
								<em class:down={(tq.change24h ?? 0) < 0}>{tq.change24h == null ? '-' : `${tq.change24h >= 0 ? '+' : ''}${tq.change24h.toFixed(1)}%`}</em>
							</div>
						{/each}
					{/if}
					<div class="wire-quote-list">
					{#each filteredTapeQuotes.slice(0, 20) as tq (tq.display)}
						<button
							type="button"
							class="wire-quote-row"
							class:active={tq.display === activeDisplay}
							aria-pressed={tq.display === activeDisplay}
							onclick={() => selectWireTicker(tq.display)}
						>
							<b>{wireLabel(tq.display, tq)}</b>
							<strong>{tq.price.toFixed(wireDecimals(tq.display, tq.price, tq))}</strong>
							<em class:down={(tq.change24h ?? 0) < 0}
								>{tq.change24h == null
									? '-'
									: `${tq.change24h >= 0 ? '+' : ''}${tq.change24h.toFixed(1)}%`}</em
							>
						</button>
					{/each}
					</div>
				</div>
			</div>
		</section>
		<div
			class="bull wire-decor-piece"
			class:is-dragging={wireDecorPositions.bull.dragging}
			hidden={deskSettings.hideAllDraggables}
			use:bindWireDecor={'bull'}
			style={`left: ${wireDecorPositions.bull.left}px; top: ${wireDecorPositions.bull.top}px;`}
			role="button" tabindex="0" aria-label="Drag market bull decoration" title="Drag market bull"
			onpointerdown={(e) => onWireDecorPointerDown('bull', e)}
			onpointermove={(e) => onWireDecorPointerMove('bull', e)}
			onpointerup={(e) => onWireDecorPointerUp('bull', e)}
			onpointercancel={(e) => onWireDecorPointerUp('bull', e)}
			onlostpointercapture={(e) => onWireDecorPointerUp('bull', e)}
			onkeydown={(e) => onWireDecorKeyDown('bull', e)}
		>&#x265E;</div>
		<div
			class="cabinet wire-decor-piece"
			class:is-dragging={wireDecorPositions.cabinet.dragging}
			hidden={deskSettings.hideAllDraggables}
			use:bindWireDecor={'cabinet'}
			style={`left: ${wireDecorPositions.cabinet.left}px; top: ${wireDecorPositions.cabinet.top}px;`}
			role="button" tabindex="0" aria-label="Drag market cabinet decoration" title="Drag market cabinet"
			onpointerdown={(e) => onWireDecorPointerDown('cabinet', e)}
			onpointermove={(e) => onWireDecorPointerMove('cabinet', e)}
			onpointerup={(e) => onWireDecorPointerUp('cabinet', e)}
			onpointercancel={(e) => onWireDecorPointerUp('cabinet', e)}
			onlostpointercapture={(e) => onWireDecorPointerUp('cabinet', e)}
			onkeydown={(e) => onWireDecorKeyDown('cabinet', e)}
		><i></i><i></i><i></i></div>
		<div
			class="plant tall wire-decor-piece"
			class:is-dragging={wireDecorPositions.plant.dragging}
			hidden={deskSettings.hideAllDraggables}
			use:bindWireDecor={'plant'}
			style={`left: ${wireDecorPositions.plant.left}px; top: ${wireDecorPositions.plant.top}px;`}
			role="button" tabindex="0" aria-label="Drag market plant decoration" title="Drag market plant"
			onpointerdown={(e) => onWireDecorPointerDown('plant', e)}
			onpointermove={(e) => onWireDecorPointerMove('plant', e)}
			onpointerup={(e) => onWireDecorPointerUp('plant', e)}
			onpointercancel={(e) => onWireDecorPointerUp('plant', e)}
			onlostpointercapture={(e) => onWireDecorPointerUp('plant', e)}
			onkeydown={(e) => onWireDecorKeyDown('plant', e)}
		><i></i><i></i><i></i></div>

		<div class="ticker-anchor">
			<TickerTape quotes={tapeQuotes} {activeDisplay} market={wireMarket} bias={signal?.bias ?? 'FLAT'} />
		</div>

		<div class="office-flag" class:is-dragging={officeFlagPosition.dragging} use:bindOfficeFlag style={`left: ${officeFlagPosition.left}px; top: ${officeFlagPosition.top}px;`} title={`${selectedOfficeFlag.name} - drag to move`} aria-label={`Draggable office flag: ${selectedOfficeFlag.name}`} role="button" tabindex="0" onpointerdown={onOfficeFlagPointerDown} onpointermove={onOfficeFlagPointerMove} onpointerup={onOfficeFlagPointerUp} onpointercancel={onOfficeFlagPointerUp} onlostpointercapture={onOfficeFlagPointerUp}>
			<div class="flag-pole"></div>
			<div class="flag-cloth">
				<img src={`https://flagcdn.com/w320/${selectedOfficeFlag.id.toLowerCase()}.png`} alt={selectedOfficeFlag.name} draggable="false" />
			</div>
		</div>

		<section class="office-floor" bind:this={officeFloor}>
			<div class="floor-light"></div>
			<div class="back-staff" aria-label="Management and research desks">
				<div class="staff-zone-sign"><span>FLOOR MANAGEMENT</span><b>STAFF</b></div>
				<div class="staff-row">
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
				<!-- Serenades Nora Blake (center staff desk) -->
				<MariachiBand active={mariachi.active} frame={mariachi.frame} anchor="nora" />
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
								tradeDurationMinutes={tradeDurationFor(t.id)}
								takeProfit={takeProfitFlashes[t.id] ? { pnlUsd: takeProfitFlashes[t.id].pnlUsd, target: takeProfitFlashes[t.id].target } : null}
								{bars}
								lampBoost={signal?.bias === 'LONG' ? 0.22 : 0}
								tick={animTick}
								pinned={pinnedId === t.id}
								blofinBadge={blofinBadgeFor(t.id)}
								onInspect={() => (inspectedId = t.id)}
								onPin={() => openQuickTradeFor(t.id)}
								onLeverageCommit={(value) => setTraderLeverage(t.id, value)}
								onTradeDurationCommit={(value) => setTraderTradeDuration(t.id, value)}
							/>
						{/each}
					</div>
				</div>
				<div class="aisle">
					<span>RISK <br />AISLE</span><i></i><i></i><i></i>
				</div>
				<div class="desk-zone short-zone" class:active={signal?.bias === 'SHORT'}>
					<div class="zone-sign"><span>SHORT BOOK</span><b>{shortOpen} OPEN</b></div>
					<div class="trader-row">
						{#each shortTraders as t (t.id)}
							<CharacterSprite
								trader={t}
								leg={legFor(t.id)}
								posture={postureFor(t)}
								tradeDurationMinutes={tradeDurationFor(t.id)}
								takeProfit={takeProfitFlashes[t.id] ? { pnlUsd: takeProfitFlashes[t.id].pnlUsd, target: takeProfitFlashes[t.id].target } : null}
								{bars}
								lampBoost={signal?.bias === 'SHORT' ? 0.22 : 0}
								tick={animTick}
								pinned={pinnedId === t.id}
								blofinBadge={blofinBadgeFor(t.id)}
								onInspect={() => (inspectedId = t.id)}
								onPin={() => openQuickTradeFor(t.id)}
								onLeverageCommit={(value) => setTraderLeverage(t.id, value)}
								onTradeDurationCommit={(value) => setTraderTradeDuration(t.id, value)}
							/>
						{/each}
					</div>
				</div>
			</div>

			<div class="lounge" aria-hidden="true">
				<div class="sofa"><i></i><i></i></div>
			</div>


		</section>
		<div
			class="coffee-table lounge-decor-piece"
			class:is-dragging={loungeDecorPositions.fortune.dragging}
			use:bindLoungeDecor={'fortune'}
			style={`left: ${loungeDecorPositions.fortune.left}px; top: ${loungeDecorPositions.fortune.top}px;`}
			role="button" tabindex="0" aria-label="Drag Fortune table decoration" title="Drag Fortune table"
			onpointerdown={(e) => onLoungeDecorPointerDown('fortune', e)}
			onpointermove={(e) => onLoungeDecorPointerMove('fortune', e)}
			onpointerup={(e) => onLoungeDecorPointerUp('fortune', e)}
			onpointercancel={(e) => onLoungeDecorPointerUp('fortune', e)}
			onlostpointercapture={(e) => onLoungeDecorPointerUp('fortune', e)}
		><span>FORTUNE</span></div>
		<div
			class="plant lounge-decor-piece lounge-plant"
			class:is-dragging={loungeDecorPositions.loungePlant.dragging}
			use:bindLoungeDecor={'loungePlant'}
			style={`left: ${loungeDecorPositions.loungePlant.left}px; top: ${loungeDecorPositions.loungePlant.top}px;`}
			role="button" tabindex="0" aria-label="Drag lounge plant decoration" title="Drag lounge plant"
			onpointerdown={(e) => onLoungeDecorPointerDown('loungePlant', e)}
			onpointermove={(e) => onLoungeDecorPointerMove('loungePlant', e)}
			onpointerup={(e) => onLoungeDecorPointerUp('loungePlant', e)}
			onpointercancel={(e) => onLoungeDecorPointerUp('loungePlant', e)}
			onlostpointercapture={(e) => onLoungeDecorPointerUp('loungePlant', e)}
		><i></i><i></i><i></i></div>

		{#if deskSettings.showFax && !deskSettings.hideAllDraggables}
			<FaxMachine
				{signal}
				{quote}
				{bars}
				displaySymbol={activeDisplay}
				decimals={priceDecimals}
				sceneFrame={sceneFrame}
				mobileDeskTop={foregroundDeskTop}
			/>
		{/if}
		{#if deskSettings.showPet && !deskSettings.hideAllDraggables}
			<FloorPet
				bias={signal?.bias ?? 'FLAT'}
				confluenceBand={signal?.confluenceBand ?? 'weak'}
				tick={animTick}
				sceneFrame={sceneFrame}
			/>
		{/if}
		{#if deskSettings.showTrash && !deskSettings.hideAllDraggables}
			<TrashCan
				{signal}
				{quote}
				displaySymbol={activeDisplay}
				decimals={priceDecimals}
				sceneFrame={sceneFrame}
				mobileDeskTop={foregroundDeskTop}
			/>
		{/if}
		{#if deskSettings.showCrtCart && !deskSettings.hideAllDraggables}
			<CrtPnlCart
				{legs}
				sceneFrame={sceneFrame}
				compact={deskSettings.compactDeskTools}
				crtScanlines={deskSettings.crtScanlines}
				reduceMotion={deskSettings.reduceMotion}
			/>
		{/if}

		<section class="foreground-desk" bind:this={foregroundDesk}>
			<div class="desk-edge"></div>
			<div class="book-stack" role="group" aria-label="Desk reference books">
				{#each DESK_LIBRARY as book, i (book.id)}
					<button
						type="button"
						class="book-spine"
						class:spine-0={i === 0}
						class:spine-1={i === 1}
						class:spine-2={i === 2}
						class:spine-3={i === 3}
						aria-label={`Open desk primer: ${book.spineTitle}`}
						title={book.spineTitle}
						onclick={() => openDeskBook(book.id)}
					>
						{#each book.spineTitle.split(' ') as word, wi}
							{#if wi > 0}<br />{/if}{word}
						{/each}
					</button>
				{/each}
			</div>
			<button
				type="button"
				class="foreground-monitor"
				aria-label="Open desk CRT terminal"
				title="Desk CRT - chart / quote / signal"
				onclick={openMonitorPanel}
			>
				<div class="monitor-bezel">
					{#if pinnedTrader && pinnedPosture}
						<div class="pinned-head">
							<span>PINNED: {pinnedTrader.name} . {pinnedTrader.leverage}x</span>
							<b>{pinnedPosture.status.toUpperCase()}</b>
						</div>
						<div class="pinned-chart">
							<MiniChart
								{bars}
								bias={pinnedPosture.bias}
										label={`${activeDef.bybit} . PINNED DESK`}
								showLevels={true}
								stop={pinnedPosture.stop}
								tp1={pinnedPosture.tp1}
								tp2={pinnedPosture.tp2}
							/>
						</div>
						<div class="pinned-risk">
							SL {fmt(pinnedPosture.stop)} . TP1 {fmt(pinnedPosture.tp1)} . TP2 {fmt(
								pinnedPosture.tp2
							)}
						</div>
					{:else}
						<TaHud {signal} displaySymbol={activeDisplay} />
					{/if}
				</div>
				<div class="monitor-foot"></div>
			</button>
			<div class="phone-main"><span></span><i></i></div>
		</section>

		<div
			class="wsj desk-prop"
			class:expanded={wsjExpanded}
			class:is-dragging={deskProps.wsj.dragging}
			class:is-ready={deskProps.wsj.ready}
			class:compact={deskSettings.compactDeskTools}
			style:left={`${deskProps.wsj.left}px`}
			style:top={`${deskProps.wsj.top}px`}
			use:deskPropAction={'wsj'}
			onpointerdown={(e) => onDeskPropPointerDown('wsj', e)}
			onpointermove={(e) => onDeskPropPointerMove('wsj', e)}
			onpointerup={(e) => onDeskPropPointerUp('wsj', e)}
			onpointercancel={(e) => onDeskPropPointerUp('wsj', e)}
			role="button"
			tabindex="0"
			aria-label="Wall Street Journal - news for active coin"
			title="Drag to move . click for more headlines"
			onclick={() => deskPropClick('wsj', () => (wsjExpanded = !wsjExpanded))}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					deskPropClick('wsj', () => (wsjExpanded = !wsjExpanded));
				}
			}}
		>
			<header>THE WALL STREET JOURNAL</header>
			{#if newsHeadlines[0] && !wsjExpanded}
				<b class="wsj-hed"
					>{activeDef.label}: {newsHeadlines[0].title.slice(0, 48)}{newsHeadlines[0].title
						.length > 48
						? '...'
						: ''}</b
				>
			{:else if !wsjExpanded}
				<b class="wsj-hed">Markets Watch<br />{activeDef.label}</b>
			{/if}
			{#if newsSample}<em class="wsj-sample">SAMPLE</em>{/if}
			{#if wsjExpanded}
				<div class="wsj-edition">
					<p class="wsj-kicker">MARKET EDITION . {activeDef.label}</p>
					{#if newsHeadlines[0]}
						<h2>{newsHeadlines[0].title}</h2>
						<p class="wsj-byline">{newsHeadlines[0].source} . full wire headline</p>
					{/if}
					<p class="wsj-dek">Latest complete headlines for the active market. Click the paper again to fold it up.</p>
					<ul class="wsj-more">
						{#each newsHeadlines.slice(1) as h, i (i)}
							<li><strong>{h.source}</strong> - {h.title}</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
		<div
			class="legal-pad desk-prop"
			class:is-dragging={deskProps.legal.dragging}
			class:is-ready={deskProps.legal.ready}
			class:compact={deskSettings.compactDeskTools}
			style:left={`${deskProps.legal.left}px`}
			style:top={`${deskProps.legal.top}px`}
			use:deskPropAction={'legal'}
			onpointerdown={(e) => onDeskPropPointerDown('legal', e)}
			onpointermove={(e) => onDeskPropPointerMove('legal', e)}
			onpointerup={(e) => onDeskPropPointerUp('legal', e)}
			onpointercancel={(e) => onDeskPropPointerUp('legal', e)}
			role="group"
			aria-label="Positions pad"
			title="Drag to move"
		>
			<header>POSITIONS:</header>
			{#if deskPosNote}
				<p class="pos-note">{deskPosNote}</p>
			{/if}
			{#if deskPosLines.length}
				{#each deskPosLines.slice(0, 4) as line, i (i)}
					<p>{line.venue} {line.text}</p>
				{/each}
			{:else}
				<p>FLAT - no open positions</p>
			{/if}
			<p class="pos-ta">
				TA {signal?.bias === 'LONG' ? 'LONG' : signal?.bias === 'SHORT' ? 'SHORT' : 'FLAT'}
				{activeDef.label} . {signal?.confluence ?? '-'}/6
			</p>
			<span></span>
		</div>
		<button
			type="button"
			class="keyboard-main desk-prop"
			class:is-dragging={deskProps.keyboard.dragging}
			class:is-ready={deskProps.keyboard.ready}
			class:compact={deskSettings.compactDeskTools}
			style:left={`${deskProps.keyboard.left}px`}
			style:top={`${deskProps.keyboard.top}px`}
			use:deskPropAction={'keyboard'}
			onpointerdown={(e) => onDeskPropPointerDown('keyboard', e)}
			onpointermove={(e) => onDeskPropPointerMove('keyboard', e)}
			onpointerup={(e) => onDeskPropPointerUp('keyboard', e)}
			onpointercancel={(e) => onDeskPropPointerUp('keyboard', e)}
			aria-label="Open desk console"
			title="Desk console (BloFin live) - drag to move"
			onclick={() => deskPropClick('keyboard', openDeskConsole)}
		><i></i></button>
		<button
			type="button"
			class="mouse-pad desk-prop"
			class:is-dragging={deskProps.pad.dragging}
			class:is-ready={deskProps.pad.ready}
			class:compact={deskSettings.compactDeskTools}
			style:left={`${deskProps.pad.left}px`}
			style:top={`${deskProps.pad.top}px`}
			use:deskPropAction={'pad'}
			onpointerdown={(e) => onDeskPropPointerDown('pad', e)}
			onpointermove={(e) => onDeskPropPointerMove('pad', e)}
			onpointerup={(e) => onDeskPropPointerUp('pad', e)}
			onpointercancel={(e) => onDeskPropPointerUp('pad', e)}
			aria-label="Create position - fund trader with percent equity"
			title="CREATE POSITION - fund trader with % equity - drag to move"
			onclick={() => deskPropClick('pad', openQuickTrade)}
		>
			<span class="pad-target" aria-hidden="true"></span>
		</button>
		<button
			type="button"
			class="calculator desk-prop"
			class:is-dragging={deskProps.calc.dragging}
			class:is-ready={deskProps.calc.ready}
			class:compact={deskSettings.compactDeskTools}
			style:left={`${deskProps.calc.left}px`}
			style:top={`${deskProps.calc.top}px`}
			use:deskPropAction={'calc'}
			onpointerdown={(e) => onDeskPropPointerDown('calc', e)}
			onpointermove={(e) => onDeskPropPointerMove('calc', e)}
			onpointerup={(e) => onDeskPropPointerUp('calc', e)}
			onpointercancel={(e) => onDeskPropPointerUp('calc', e)}
			aria-label="Open profit calculator"
			title="P&L calculator - drag to move"
			onclick={() => deskPropClick('calc', openProfitCalc)}
		>789<br />456<br />123</button>
		<button
			type="button"
			class="coffee desk-prop"
			class:is-dragging={deskProps.coffee.dragging}
			class:is-ready={deskProps.coffee.ready}
			class:compact={deskSettings.compactDeskTools}
			class:is-tripping={coffeeTripActive}
			style:left={`${deskProps.coffee.left}px`}
			style:top={`${deskProps.coffee.top}px`}
			use:deskPropAction={'coffee'}
			onpointerdown={(e) => onDeskPropPointerDown('coffee', e)}
			onpointermove={(e) => onDeskPropPointerMove('coffee', e)}
			onpointerup={(e) => onDeskPropPointerUp('coffee', e)}
			onpointercancel={(e) => onDeskPropPointerUp('coffee', e)}
			aria-label="Sip coffee - brief trip"
			title="Coffee - drag to move"
			onclick={() => deskPropClick('coffee', triggerCoffeeTrip)}
		><i></i><b></b></button>
		<button
			type="button"
			class="desk-settings-btn desk-prop"
			class:is-dragging={deskProps.set.dragging}
			class:is-ready={deskProps.set.ready}
			class:compact={deskSettings.compactDeskTools}
			style:left={`${deskProps.set.left}px`}
			style:top={`${deskProps.set.top}px`}
			use:deskPropAction={'set'}
			onpointerdown={(e) => onDeskPropPointerDown('set', e)}
			onpointermove={(e) => onDeskPropPointerMove('set', e)}
			onpointerup={(e) => onDeskPropPointerUp('set', e)}
			onpointercancel={(e) => onDeskPropPointerUp('set', e)}
			aria-label="Open desk settings"
			title="Desk settings - drag to move"
			onclick={() => deskPropClick('set', openDeskSettings)}
		><span class="settings-glyph" aria-hidden="true">+</span><b>SET</b></button>
{#if deskSettings.showClipboard && !deskSettings.hideAllDraggables && ((inspectedTrader && inspectedPosture) || inspectedStaff)}
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
						<small>DESK CLIPBOARD . DRAG</small><strong>{inspectedTrader.name}</strong>
					</div>
					<b>{inspectedTrader.side.toUpperCase()} . {inspectedTrader.leverage}x</b>
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
							>{inspectedPosture.confluence}/6 {inspectedPosture.aligned
								? '. ALIGNED'
								: '. COUNTER'}</dd
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
					<dt>STOP . RISK</dt>
						<dd class="negative">{fmt(inspectedPosture.stop)}</dd>
					</div>
					<div>
					<dt>TP1 . {inspectedPosture.rrTp1?.toFixed(2) ?? '1.50'}R</dt>
						<dd class="positive">{fmt(inspectedPosture.tp1)}</dd>
					</div>
					<div>
					<dt>TP2 . TRAIL</dt>
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
					{inspectedPosture.sample ? '. WAITING FOR LIVE TAPE' : ''}
				</footer>
			{:else if inspectedStaff}
				<header>
					<div>
						<small>STAFF NOTE . DRAG</small><strong>{inspectedStaff.name}</strong>
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
		{#if deskSettings.showPricePad && !deskSettings.hideAllDraggables}
		<aside
			bind:this={pricePadRoot}
			class="wire-status price-pad"
			class:is-dragging={pricePadDragging}
			class:is-ready={pricePadReady}
			role="group"
			aria-label="Draggable price widget"
			title="Drag price pad"
			style:left={`${pricePadLeft}px`}
			style:top={`${pricePadTop}px`}
			onpointerdown={onPricePadPointerDown}
			onpointermove={onPricePadPointerMove}
			onpointerup={stopPricePadDragging}
			onpointercancel={stopPricePadDragging}
			onlostpointercapture={stopPricePadDragging}
		>
			<div class="clip"></div>
			<div>
				<span class:dot-live={!!quote && !quote.sample}></span>{!quote ? 'LIVE DATA UNAVAILABLE' : quote.sample
					? 'SAMPLE TAPE'
					: `${quote.provider.toUpperCase()} . ${activeDisplay}`}
			</div>
			<strong>{quote?.price?.toFixed(priceDecimals) ?? '-'}</strong>
			<small
				>{clock.label} . {clock.phase.toUpperCase()}{clock.raining
					? ' . RAIN'
					: ''}{clock.snowing
					? ' . XMAS . SNOW'
					: clock.holidayWindow
						? ' . XMAS'
						: ''}{kong.active
					? ' . KONG!'
					: ''}{mariachi.active ? ' . MARIACHI!' : ''}</small
			>
		</aside>
		{/if}
	</div>


</main>

{#if coffeeTripActive}
	<div class="coffee-trip" aria-hidden="true"></div>
{/if}

<DeskConsole
	bind:open={deskConsoleOpen}
	onAssignmentsChange={(a) => (blofinAssignments = a)}
	onOverlayChange={(o) => (blofinOverlay = o)}
/>
<MonitorPanel
	bind:open={monitorPanelOpen}
	{bars}
	{quote}
	{signal}
	{tapeQuotes}
	{activeDisplay}
	{priceDecimals}
	onSelectSymbol={setSymbol}
/>
<QuickTradePanel
	bind:open={quickTradeOpen}
	{activeDisplay}
	{quote}
	{signal}
	{priceDecimals}
	presetTraderId={quickTradePresetTraderId}
	onSelectSymbol={setSymbol}
	onAssignmentsChange={(a) => (blofinAssignments = a)}
/>
<DeskBookReader bind:open={deskBookOpen} bind:bookId={deskBookId} />
<ProfitCalcPanel
	bind:open={profitCalcOpen}
	{quote}
	{priceDecimals}
	{activeDisplay}
/>

	
{#if settingsOpen}
	<div class="settings-backdrop" role="presentation" onclick={() => (settingsOpen = false)}></div>
	<div class="desk-settings-panel" role="dialog" aria-modal="true" aria-label="Desk settings">
		<header>
			<strong>DESK SETTINGS</strong>
			<button type="button" class="x" onclick={() => (settingsOpen = false)} aria-label="Close settings">X</button>
		</header>
		<div class="settings-body">
			<section>
				<h4>DRAGGABLES</h4>
				<label><input type="checkbox" checked={deskSettings.showClipboard} onchange={(e) => updateDeskSetting('showClipboard', e.currentTarget.checked)} /> Clipboard</label>
				<label><input type="checkbox" checked={deskSettings.showPricePad} onchange={(e) => updateDeskSetting('showPricePad', e.currentTarget.checked)} /> Price pad</label>
				<label><input type="checkbox" checked={deskSettings.showFax} onchange={(e) => updateDeskSetting('showFax', e.currentTarget.checked)} /> Fax</label>
				<label><input type="checkbox" checked={deskSettings.showPet} onchange={(e) => updateDeskSetting('showPet', e.currentTarget.checked)} /> Pet</label>
				<label><input type="checkbox" checked={deskSettings.showTrash} onchange={(e) => updateDeskSetting('showTrash', e.currentTarget.checked)} /> Trash</label>
				<label><input type="checkbox" checked={deskSettings.showCrtCart} onchange={(e) => updateDeskSetting('showCrtCart', e.currentTarget.checked)} /> CRT P&amp;L cart</label>
				<button type="button" class="ghost" onclick={toggleHideAllDraggables}>
					{deskSettings.hideAllDraggables ? 'SHOW ALL DRAGGABLES' : 'HIDE ALL DRAGGABLES'}
				</button>
				<button type="button" class="ghost" onclick={saveCurrentDeskLayoutAsDefault}>USE CURRENT TOOL LAYOUT AS DEFAULT</button>
			</section>
			<section>
				<h4>OFFICE DECOR</h4>
				<label class="flag-picker">
					<span>Flag</span>
					<select value={deskSettings.officeFlag} onchange={(e) => updateDeskSetting('officeFlag', e.currentTarget.value)} aria-label="Office flag">
						{#each OFFICE_FLAGS as flag (flag.id)}
							<option value={flag.id}>{flag.name}</option>
						{/each}
					</select>
				</label>
			</section>
			<section>
				<h4>MOTION / DESK</h4>
				<label><input type="checkbox" checked={deskSettings.reduceMotion} onchange={(e) => updateDeskSetting('reduceMotion', e.currentTarget.checked)} /> Reduce motion</label>
				<label><input type="checkbox" checked={deskSettings.disableCoffeeTrip} onchange={(e) => updateDeskSetting('disableCoffeeTrip', e.currentTarget.checked)} /> Disable coffee trip</label>
				<label><input type="checkbox" checked={deskSettings.compactDeskTools} onchange={(e) => updateDeskSetting('compactDeskTools', e.currentTarget.checked)} /> Compact desk tools</label>
				<label><input type="checkbox" checked={deskSettings.showBlofinBadges} onchange={(e) => updateDeskSetting('showBlofinBadges', e.currentTarget.checked)} /> Show BloFin BF badges</label>
				<label><input type="checkbox" checked={deskSettings.soundOff} onchange={(e) => updateDeskSetting('soundOff', e.currentTarget.checked)} /> Sound off (stub)</label>
				<label><input type="checkbox" checked={deskSettings.nightModeTint} onchange={(e) => updateDeskSetting('nightModeTint', e.currentTarget.checked)} /> Night mode tint</label>
				<label><input type="checkbox" checked={deskSettings.crtScanlines} onchange={(e) => updateDeskSetting('crtScanlines', e.currentTarget.checked)} /> CRT scanlines</label>
				<label><input type="checkbox" checked={deskSettings.forceChristmasSnow} onchange={(e) => updateDeskSetting('forceChristmasSnow', e.currentTarget.checked)} /> Force Christmas snow</label>
			</section>
			<p class="hint">Saved in localStorage <code>phf-desk-settings</code>.</p>
		</div>
	</div>
{/if}

<ToastStack />

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
		min-height: 1040px;
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
		gap: 0;
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
		max-height: 268px;
		overflow: hidden;
		background: #11130f;
		border: 5px solid #79603f;
		box-shadow:
			inset 0 0 16px #000,
			4px 5px 0 rgba(15, 5, 2, 0.5);
	}
	.market-board header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-bottom: 5px;
		color: #d8b76c;
		border-bottom: 1px solid #5a5134;
		font-size: 7px;
	}
	.market-board header i {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: #d8bb71;
		font-style: normal;
	}
	.market-board header i::before {
		content: '';
		width: 5px;
		height: 5px;
		background: #d8bb71;
		box-shadow: 0 0 0 1px #5a5134;
	}
	.market-board header i.wire-live {
		color: #f47764;
	}
	.market-board header i.wire-live::before {
		background: #f04b4b;
		border-radius: 50%;
		box-shadow: 0 0 4px 2px rgba(240, 75, 75, 0.75);
		animation: wire-live-pulse 1.8s ease-in-out infinite;
	}
	@keyframes wire-live-pulse {
		0%,
		100% {
			opacity: 0.7;
		}
		50% {
			opacity: 1;
			box-shadow: 0 0 6px 3px rgba(240, 75, 75, 0.95);
		}
	}
	.wire-market-toggle {
		display: flex !important;
		grid-template-columns: none !important;
		align-items: center;
		gap: 3px !important;
		margin-top: 5px !important;
		font-size: 6px;
		color: #9d886f;
	}
	.wire-market-toggle button {
		padding: 3px 5px;
		background: #1a1c16;
		border: 1px solid #5a5134;
		color: #9d886f;
		font: 6px var(--mono);
		cursor: pointer;
	}
	.wire-market-toggle button.active {
		background: #efc870;
		border-color: #efc870;
		color: #0c0e0a;
	}
	.wire-token-heading {
		display: block !important;
		margin-top: 6px !important;
		font-size: 6px;
		color: #efc870;
		letter-spacing: 0.06em;
	}
	.wire-token-row {
		border-top: 1px solid #5a5134;
		padding-top: 4px;
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
	.market-board .wire-quote-list {
		display: block;
		max-height: 104px;
		overflow-y: auto;
		margin-top: 5px;
		padding-right: 3px;
	}
	.market-board .wire-quote-row {
		display: grid;
		grid-template-columns: 1fr auto 37px;
		gap: 6px;
		margin-top: 5px;
		font-size: 6px;
		width: 100%;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		font-family: inherit;
		text-align: left;
		cursor: pointer;
	}
	.market-board .wire-quote-row:hover,
	.market-board .wire-quote-row.active {
		background: #25291d;
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
	.wire-decor-piece {
		position: absolute;
		left: auto;
		top: auto;
		right: auto;
		bottom: auto;
		z-index: 70;
		cursor: grab;
		touch-action: none;
		user-select: none;
	}
	.wire-decor-piece.is-dragging {
		z-index: 95;
		cursor: grabbing;
	}
	.wire-decor-piece.bull {
		font-size: 25px;
	}
	.wire-decor-piece.cabinet {
		left: auto;
		bottom: auto;
	}
	.wire-decor-piece.plant.tall {
		right: auto;
		bottom: auto;
	}

	.office-floor {
		position: relative;
		height: auto;
		min-height: 580px;
		padding: 12px 14px 64px;
		box-sizing: border-box;
		background: linear-gradient(170deg, #4a3226 0 3%, #34231c 12% 100%);
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

	.office-flag {
		position: absolute;
		z-index: 72;
		width: 92px;
		height: 64px;
		color: #d7bd80;
		font-size: 7px;
		text-align: center;
		cursor: grab;
		touch-action: none;
		user-select: none;
	}
	.office-flag.is-dragging {
		z-index: 95;
		cursor: grabbing;
	}
	.flag-pole {
		position: absolute;
		top: -2px;
		left: 5px;
		z-index: 3;
		width: 7px;
		height: 58px;
		box-sizing: border-box;
		background: #c08a48;
		border: 1px solid #43291b;
		box-shadow: 2px 0 #e0ad5d, 4px 0 #4b2c1b;
		pointer-events: none;
	}
	.flag-pole::before {
		content: '';
		position: absolute;
		top: -5px;
		left: -3px;
		width: 11px;
		height: 5px;
		box-sizing: border-box;
		background: #d7a45a;
		border: 1px solid #43291b;
	}
	.flag-pole::after {
		content: '';
		position: absolute;
		bottom: -4px;
		left: -4px;
		width: 15px;
		height: 4px;
		background: #744625;
		border: 1px solid #3a2116;
	}
	.flag-cloth {
		position: absolute;
		top: 3px;
		left: 10px;
		z-index: 1;
		width: 70px;
		height: 38px;
		box-sizing: border-box;
		display: grid;
		place-items: center;
		overflow: hidden;
		background: #24150f;
		border: 2px solid #8f6539;
		box-shadow: 3px 3px 0 rgba(0,0,0,.35);
	}
	.flag-cloth img { display:block; min-width:0; min-height:0; max-width:100%; max-height:100%; width:100%; height:100%; object-fit:cover; image-rendering:auto; }
	.floor-light {
		position: absolute;
		inset: 0;
		background: radial-gradient(ellipse at 50% 0, rgba(235, 133, 63, 0.22), transparent 60%);
		pointer-events: none;
	}
	.back-staff {
		/* Hosts mariachi over Nora (center staff) */
		position: relative;
		z-index: 4;
		box-sizing: border-box;
		min-height: 220px;
		margin: 4px 12px 12px;
		padding: 24px 16px 12px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		border: 2px solid rgba(114, 74, 47, 0.75);
		background: rgba(31, 20, 16, 0.36);
		/* Sit on the carpet - no divider ...perch" line under feet */
		overflow: visible;
	}
	.back-staff :global(.mariachi) {
		z-index: 20;
	}
	.staff-zone-sign {
		position: absolute;
		left: 9px;
		top: 4px;
		right: 9px;
		display: flex;
		justify-content: space-between;
		font-size: 7px;
		letter-spacing: 0.12em;
		color: #d1b16a;
		pointer-events: none;
	}
	.staff-zone-sign b {
		font-size: 6px;
		color: #9d886f;
	}
	.staff-row {
		display: flex;
		justify-content: center;
		align-items: flex-end;
		gap: 14px;
		min-width: 0;
		width: 100%;
		max-width: 100%;
		padding: 10px 8px 6px;
		margin: 0 auto;
		overflow: visible;
		box-sizing: border-box;
	}
	.staff-row :global(.character) {
		flex: 0 0 auto;
		width: 128px;
		min-width: 118px;
		max-width: 132px;
	}
	.staff-row :global(.character:nth-child(even)) {
		transform: translateY(6px);
	}
	.desk-zones {
		position: relative;
		z-index: 7;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 58px minmax(0, 1fr);
		height: auto;
		min-height: 280px;
		margin: 0 0 8px;
		padding: 8px 18px 28px 12px;
		gap: 4px;
		box-sizing: border-box;
		overflow: visible;
	}
	.desk-zone {
		position: relative;
		min-width: 0;
		padding: 18px 6px 18px;
		border: 2px solid rgba(114, 74, 47, 0.75);
		background: rgba(31, 20, 16, 0.36);
		transition: box-shadow 0.4s;
		overflow: visible;
		box-sizing: border-box;
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
		padding: 18px 0 8px;
		box-sizing: border-box;
		overflow: visible;
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
		transform: none;
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
	.lounge-decor-piece {
		position: absolute;
		z-index: 65;
		cursor: grab;
		touch-action: none;
		user-select: none;
	}
	.lounge-decor-piece.is-dragging {
		z-index: 95;
		cursor: grabbing;
	}
	.lounge-decor-piece.coffee-table {
		bottom: auto;
	}
	.lounge-plant {
		right: auto;
		bottom: auto;
		transform: scale(0.78);
		transform-origin: bottom left;
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
		overflow: visible;
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
	.book-stack .book-spine {
		display: block;
		width: 100%;
		height: 25px;
		padding: 4px 8px;
		border: 2px solid #2f1b11;
		box-shadow: inset 0 2px rgba(255, 255, 255, 0.12);
		color: #ead7a1;
		font-size: 6px;
		font-weight: 900;
		letter-spacing: 0.08em;
		font-family: inherit;
		text-align: left;
		cursor: pointer;
		line-height: 1.15;
		transition: filter 0.12s ease, transform 0.12s ease;
	}
	.book-stack .book-spine:hover,
	.book-stack .book-spine:focus-visible {
		filter: brightness(1.18);
		transform: translateX(3px);
		outline: none;
		z-index: 1;
		position: relative;
	}
	.book-stack .book-spine:focus-visible {
		box-shadow:
			inset 0 2px rgba(255, 255, 255, 0.12),
			0 0 0 2px #f0d9a8;
	}
	.book-stack .spine-0 {
		background: #49392d;
	}
	.book-stack .spine-1 {
		width: 145px;
		background: #7a3430;
	}
	.book-stack .spine-2 {
		width: 135px;
		background: #284e47;
	}
	.book-stack .spine-3 {
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
		box-sizing: border-box;
		background: #d8d1bb;
		color: #2d2a25;
		border: 2px solid #554d41;
		transform: rotate(-2deg);
		overflow: hidden;
	}
	.wsj header {
		font: 7px Georgia, serif;
		border-bottom: 2px solid #333;
		white-space: nowrap;
		overflow: hidden;
	}
	.wsj b,
	.wsj .wsj-hed {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 4;
		line-clamp: 4;
		overflow: hidden;
		margin: 4px 0 0;
		font: 9px/1.15 Georgia, serif;
		word-break: break-word;
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
		left: 50%;
		bottom: 4px;
		width: 325px;
		height: 176px;
		padding: 0;
		background: #a99e82;
		border: 5px solid #403a31;
		border-radius: 8px 8px 3px 3px;
		box-shadow:
			inset 4px 4px #d4c9a6,
			6px 6px 0 rgba(32, 14, 6, 0.45);
		transform: translateX(-50%);
		cursor: pointer;
		z-index: 5;
	}
	.foreground-monitor:hover,
	.foreground-monitor:focus-visible {
		outline: 2px solid #efc870;
		outline-offset: 3px;
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
		padding: 0;
		background: #b3a88d;
		border: 4px solid #474139;
		transform: skewX(-12deg);
		box-shadow: 5px 5px 0 rgba(40, 17, 7, 0.38);
		cursor: pointer;
		z-index: 6;
	}
	.keyboard-main:hover,
	.keyboard-main:focus-visible {
		background: #cfc3a4;
		outline: 2px solid #efc870;
		outline-offset: 2px;
	}
	.keyboard-main:active {
		transform: skewX(-12deg) translateY(1px);
	}
	.keyboard-main i {
		position: absolute;
		inset: 8px;
		background:
			repeating-linear-gradient(90deg, #776f5e 0 3px, transparent 3px 10px),
			repeating-linear-gradient(0deg, #776f5e 0 3px, transparent 3px 10px);
	}
	/* Phone tucked small - reduces desk clutter */
	.phone-main {
		position: absolute;
		left: 720px;
		top: 18px;
		width: 56px;
		height: 38px;
		background: #a59c83;
		border: 3px solid #3b3731;
		border-radius: 6px;
		opacity: 0.9;
		z-index: 4;
	}
	.phone-main span {
		position: absolute;
		left: 4px;
		top: -7px;
		width: 48px;
		height: 11px;
		background: #797365;
		border: 3px solid #3a3630;
		border-radius: 8px;
	}
	.phone-main i {
		position: absolute;
		left: 14px;
		top: 12px;
		width: 26px;
		height: 16px;
		background: repeating-radial-gradient(#4c4940 0 2px, #aaa085 2px 5px);
	}
	/* Individually draggable desk props - scene-frame absolute coords */
	.desk-prop {
		position: absolute;
		z-index: 60;
		pointer-events: auto;
		touch-action: none;
		user-select: none;
		/* Stay visible - never gate on is-ready (expand/reflow races were blanking props) */
		visibility: visible;
		opacity: 1;
	}
	/* Force absolute over later .calculator/.coffee/.mouse-pad/.desk-settings-btn relative rules */
	.calculator.desk-prop,
	.coffee.desk-prop,
	.mouse-pad.desk-prop,
	.desk-settings-btn.desk-prop,
	.keyboard-main.desk-prop,
	.wsj.desk-prop,
	.legal-pad.desk-prop {
		position: absolute;
	}
	.desk-prop.is-dragging {
		visibility: visible;
	}
	.desk-prop.is-dragging {
		cursor: grabbing;
		z-index: 80;
	}
	.desk-prop.compact {
		transform: scale(0.86);
		transform-origin: center bottom;
	}
	.wsj.desk-prop.compact {
		transform: rotate(-2deg) scale(0.86);
		transform-origin: center bottom;
	}
	.legal-pad.desk-prop.compact {
		transform: rotate(1deg) scale(0.86);
		transform-origin: center bottom;
	}
	.keyboard-main.desk-prop.compact {
		transform: skewX(-12deg) scale(0.86);
		transform-origin: center bottom;
	}
	.wsj.desk-prop,
	.legal-pad.desk-prop {
		cursor: grab;
	}
	.wsj.desk-prop.is-dragging,
	.legal-pad.desk-prop.is-dragging {
		cursor: grabbing;
	}
	.wsj-sample {
		display: inline-block;
		margin-top: 2px;
		padding: 0 3px;
		font: 6px var(--mono);
		color: #7a3a2a;
		border: 1px solid #7a3a2a;
	}
	.wsj.expanded,
	.wsj:has(.wsj-more) {
		height: auto;
		width: min(390px, calc(100vw - 28px));
		max-height: min(480px, calc(100vh - 28px));
		min-height: 300px;
		/* Must stay above .foreground-desk (z 55) - old z-index:18 hid the paper under the wood */
		z-index: 300005;
		overflow: auto;
		box-shadow: 7px 9px 0 rgba(20, 10, 4, 0.5);
		transform: rotate(-1deg);
		padding: 12px;
	}
	.wsj.expanded header {
		font-size: 12px;
		border-bottom-width: 3px;
	}
	.wsj-edition {
		color: #2d2a25;
	}
	.wsj-kicker,
	.wsj-byline,
	.wsj-dek {
		margin: 7px 0;
		font: 10px/1.25 Georgia, serif;
	}
	.wsj-kicker {
		font-family: var(--mono, monospace);
		font-size: 8px;
		font-weight: 700;
		letter-spacing: 0.08em;
	}
	.wsj-edition h2 {
		margin: 5px 0;
		font: bold 20px/1.05 Georgia, serif;
		letter-spacing: -0.025em;
	}
	.wsj-byline {
		font-weight: 700;
	}
	.wsj-dek {
		padding: 7px 0;
		border-top: 1px solid #554d41;
		border-bottom: 1px solid #554d41;
	}
	.wsj-more {
		margin: 8px 0 0;
		padding: 0 0 0 18px;
		font: 12px/1.3 Georgia, serif;
		box-sizing: border-box;
	}
	.wsj-more li {
		margin: 0 0 8px;
		overflow: visible;
		text-overflow: clip;
	}
	.pos-note {
		color: #7a3a2a !important;
		font-weight: 700;
	}
	.pos-ta {
		opacity: 0.75;
		font-size: 6px !important;
	}
	.wire-cats {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
		margin: 5px 0 4px;
	}
	.wire-cat {
		padding: 2px 5px;
		font: 6px var(--mono);
		letter-spacing: 0.06em;
		color: #9d886f;
		background: #1a1c16;
		border: 1px solid #5a5134;
		cursor: pointer;
	}
	.wire-cat.active {
		color: #0c0e0a;
		background: #efc870;
		border-color: #efc870;
	}
	.wire-note {
		margin: 0 0 4px;
		font: 6px var(--mono);
		color: #9d886f;
	}

	.mouse-pad {
		flex: 0 0 auto;
		width: 88px;
		height: 54px;
		padding: 0;
		background: #777973;
		border: 3px solid #3f413f;
		border-radius: 8px 8px 10px 10px;
		transform: rotate(-2deg);
		cursor: pointer;
		box-shadow: 4px 4px 0 rgba(40, 17, 7, 0.35), inset 2px 2px 0 rgba(224, 224, 211, 0.14);
	}
	.mouse-pad:hover,
	.mouse-pad:focus-visible {
		outline: 2px solid #efc870;
		outline-offset: 2px;
		background: #858780;
	}
	.mouse-pad:active {
		transform: rotate(-2deg) translateY(1px);
	}
	.pad-target {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 34px;
		height: 34px;
		transform: translate(-50%, -50%);
		border: 2px solid #4b4d4b;
		border-radius: 50%;
		background:
			radial-gradient(circle, #b7b8ae 0 4px, #545753 5px 7px, #9c9e96 8px 11px, #595c58 12px 14px, #8d9089 15px 18px, transparent 19px),
			#73766f;
		box-shadow: inset 0 0 0 1px rgba(218, 220, 207, 0.22);
	}
	.pad-target::after {
		content: '';
		position: absolute;
		left: 50%;
		top: 50%;
		width: 5px;
		height: 5px;
		transform: translate(-50%, -50%);
		border: 1px solid #3f423f;
		border-radius: 50%;
	}
	.calculator {
		flex: 0 0 auto;
		width: 40px;
		height: 50px;
		padding: 4px 2px;
		background: #343733;
		color: #b8e0be;
		border: 3px solid #171a17;
		font-size: 6px;
		line-height: 1.55;
		letter-spacing: 4px;
		cursor: pointer;
		box-shadow: 3px 3px 0 rgba(40, 17, 7, 0.35);
	}
	.calculator:hover,
	.calculator:focus-visible {
		outline: 2px solid #efc870;
		outline-offset: 2px;
		background: #3e433d;
	}
	.coffee {
		flex: 0 0 auto;
		width: 72px;
		height: 88px;
		padding: 0;
		background: #2b2623;
		border: 3px solid #15110f;
		border-radius: 3px 3px 10px 10px;
		box-sizing: border-box;
		overflow: visible;
		cursor: pointer;
	}
	.coffee:hover,
	.coffee:focus-visible {
		outline: 2px solid #efc870;
		outline-offset: 2px;
	}
	.coffee.is-tripping {
		cursor: wait;
		opacity: 0.9;
	}
	.coffee i {
		position: absolute;
		left: -10px;
		top: 8px;
		width: 11px;
		height: 18px;
		border: 3px solid #211b18;
		border-right: 0;
		border-radius: 10px 0 0 10px;
		box-sizing: border-box;
	}
	.coffee b {
		position: absolute;
		left: 8px;
		top: -28px;
		width: 4px;
		height: 20px;
		background: rgba(235, 225, 205, 0.45);
		box-shadow: 6px -2px rgba(235, 225, 205, 0.35);
		animation: steam 2s ease-in-out infinite;
	}
	@keyframes steam {
		50% {
			transform: translateY(-4px);
			opacity: 0.3;
		}
	}
	/* Coffee sip - short full-scene trip, always clears */
	.coffee-trip {
		position: fixed;
		inset: 0;
		z-index: 300000;
		pointer-events: none;
		background:
			repeating-linear-gradient(
				0deg,
				transparent 0 2px,
				rgba(0, 0, 0, 0.18) 2px 3px
			),
			radial-gradient(ellipse at 50% 40%, rgba(255, 100, 180, 0.12), transparent 60%);
		mix-blend-mode: color-dodge;
		animation: coffee-trip-fx 3s ease-in-out forwards;
		filter: hue-rotate(0deg) saturate(1.4);
	}
	.coffee-trip::before,
	.coffee-trip::after {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.coffee-trip::before {
		background: linear-gradient(90deg, rgba(255, 0, 80, 0.12), transparent 40%, rgba(0, 255, 200, 0.1));
		mix-blend-mode: screen;
		animation: coffee-chroma 0.4s steps(2) infinite;
	}
	.coffee-trip::after {
		box-shadow: inset 0 0 80px rgba(20, 0, 40, 0.45);
		animation: coffee-wobble 0.35s ease-in-out infinite alternate;
	}
	@keyframes coffee-trip-fx {
		0% {
			opacity: 0;
			filter: hue-rotate(0deg) saturate(1);
		}
		12% {
			opacity: 1;
		}
		50% {
			filter: hue-rotate(160deg) saturate(2.2) contrast(1.15);
		}
		88% {
			opacity: 1;
		}
		100% {
			opacity: 0;
			filter: hue-rotate(320deg) saturate(1);
		}
	}
	@keyframes coffee-chroma {
		0% {
			transform: translate(0, 0);
		}
		50% {
			transform: translate(2px, -1px);
		}
		100% {
			transform: translate(-2px, 1px);
		}
	}
	@keyframes coffee-wobble {
		from {
			transform: rotate(-0.6deg) scale(1.01);
		}
		to {
			transform: rotate(0.6deg) scale(1.02);
		}
	}
	.wire-status.price-pad {
		/* Same in-scene absolute drag pattern as clipboard / fax / pet / trash */
		position: absolute;
		z-index: 72;
		box-sizing: border-box;
		width: 170px;
		margin: 0;
		padding: 17px 8px 8px;
		background: #241914;
		border: 3px solid #5a3b27;
		box-shadow:
			inset 0 0 9px #000,
			6px 6px 0 rgba(25, 10, 4, 0.42);
		touch-action: none;
		user-select: none;
		cursor: grab;
		visibility: hidden;
	}
	.wire-status.price-pad.is-ready {
		visibility: visible;
	}
	.wire-status.price-pad.is-dragging,
	.wire-status.price-pad.is-dragging .clip {
		cursor: grabbing;
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
	/* -- Responsive: tablet (~768"1100) + phone (~375"480) -- */
	@media (max-width: 1100px) {
		.scene-frame {
			min-height: 0;
		}
		.upper-wall {
			grid-template-columns: minmax(160px, 200px) minmax(0, 1fr) minmax(180px, 230px);
			height: 260px;
		}
		.desk-zones {
			padding: 5px 10px 20px;
		}
		.clipboard-panel {
			max-width: calc(100vw - 16px);
		}
		.foreground-monitor {
			left: 50%;
			width: 300px;
		}
		.keyboard-main {
			left: 640px;
			width: 150px;
		}
		.phone-main {
			left: 580px;
		}
		.mouse-pad {
			width: 78px;
			height: 48px;
		}
		.calculator {
			width: 36px;
			height: 46px;
		}
		.coffee {
			width: 32px;
			height: 40px;
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
		.wire-decor-piece {
			display: none;
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
			max-height: none;
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
		.market-board .wire-quote-list {
			max-height: 180px;
		}
		.market-board .wire-quote-row {
			font-size: 9px;
			grid-template-columns: 1fr auto minmax(44px, auto);
		}

		.office-floor {
			height: auto;
			min-height: 420px;
			padding: 8px 8px 56px;
			overflow: visible;
		}
		.back-staff {
			min-height: 0;
			height: auto;
			margin: 4px 4px 8px;
			padding: 22px 6px 10px;
		}
		.staff-row {
			flex-wrap: wrap;
			justify-content: center;
			align-items: flex-end;
			gap: 8px 10px;
		}
		.staff-row :global(.character) {
			flex: 0 0 auto;
			width: 128px;
			max-width: 140px;
			min-width: 118px;
		}
		.staff-row :global(.character:nth-child(even)) {
			transform: none;
		}
		.desk-zones {
			display: flex;
			flex-direction: column;
			height: auto;
			min-height: 0;
			padding: 4px 4px 24px;
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
			width: 88px;
			max-width: 96px;
			min-width: 80px;
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
		.legal-pad,
		.legal-pad.desk-prop {
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
			transform: none;
		}
		.monitor-foot {
			left: 50%;
			transform: translateX(-50%);
		}
		.mouse-pad,
		.mouse-pad.desk-prop {
			position: relative;
			left: auto;
			top: auto;
			width: 100%;
			max-width: 200px;
			height: 48px;
			margin: 0 auto;
			transform: none;
		}
		.mouse-pad .pad-target {
			width: 32px;
			height: 32px;
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
			gap: 0;
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
		.staff-row :global(.character) {
			flex: 0 0 auto;
			width: 112px;
			max-width: 120px;
			min-width: 100px;
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

	/* Keep the foreground desk's small tools available on touch layouts. The
	 * desktop tools remain independently positioned; mobile gets a compact,
	 * readable second row below the CRT. */
	@media (max-width: 768px) {
		.foreground-desk {
			height: 360px;
			min-height: 360px;
			padding: 0;
			display: block;
		}
		.foreground-monitor {
			position: absolute !important;
			left: 10px;
			top: 12px;
			bottom: auto;
			width: calc(100% - 20px);
			max-width: none;
			height: 190px;
			margin: 0;
			transform: none;
		}
		.book-stack,
		.phone-main {
			display: none !important;
		}
		.wsj.desk-prop,
		.legal-pad.desk-prop,
		.keyboard-main.desk-prop,
		.mouse-pad.desk-prop,
		.calculator.desk-prop,
		.coffee.desk-prop,
		.desk-settings-btn.desk-prop {
			display: block !important;
			position: absolute !important;
			bottom: auto !important;
			margin: 0;
		}
		.wsj.desk-prop {
			width: 132px;
			height: 94px;
		}
		.wsj.desk-prop.expanded {
			width: min(390px, calc(100vw - 28px));
			height: auto;
			max-height: min(480px, calc(100vh - 28px));
		}
		.legal-pad.desk-prop {
			width: 105px;
			height: 105px;
			min-height: 0;
			font-size: 7px;
		}
		.keyboard-main.desk-prop {
			width: 140px;
			height: 48px;
		}
		.mouse-pad.desk-prop {
			width: 86px;
			height: 48px;
		}
		.calculator.desk-prop {
			width: 36px;
			height: 46px;
		}
		.coffee.desk-prop {
			width: 32px;
			height: 40px;
		}
		.desk-settings-btn.desk-prop {
			width: 52px;
			height: 42px;
		}
	}

	@media (max-width: 480px) {
		.foreground-desk {
			height: 860px;
			min-height: 860px;
		}
		.foreground-monitor {
			height: 180px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.coffee-trip,
		.coffee-trip::before,
		.coffee-trip::after {
			animation: none !important;
			opacity: 0 !important;
		}
		.coffee b {
			animation: none;
		}
	}

	.desk-settings-btn {
		flex: 0 0 auto;
		width: 54px;
		height: 48px;
		padding: 4px 2px 2px;
		background: #3a3428;
		border: 3px solid #1e1810;
		border-radius: 4px;
		color: #efc870;
		font: 700 9px/1 var(--mono, monospace);
		cursor: pointer;
		box-shadow: 3px 3px 0 rgba(0,0,0,0.4);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		transform: rotate(2deg);
	}
	.desk-settings-btn b {
		font-size: 7px;
		letter-spacing: 0.08em;
	}
	.settings-glyph {
		font-size: 17px;
		font-weight: 900;
		line-height: 1;
	}
	.desk-settings-btn:hover,
	.desk-settings-btn:focus-visible {
		outline: 2px solid #efc870;
		outline-offset: 2px;
		background: #4a4030;
	}
	.settings-backdrop {
		position: fixed;
		inset: 0;
		z-index: 300000;
		background: rgba(8, 4, 2, 0.55);
	}
	.desk-settings-panel {
		position: fixed;
		z-index: 300001;
		left: 50%;
		top: 50%;
		right: auto;
		bottom: auto;
		transform: translate(-50%, -50%);
		width: min(360px, calc(100vw - 32px));
		max-height: min(70vh, calc(100vh - 48px));
		overflow-x: hidden;
		overflow-y: auto;
		padding-bottom: 4px;
		background: #120e06;
		color: #e3d072;
		border: 4px solid #5a4a2f;
		box-shadow: 6px 6px 0 rgba(0,0,0,0.55);
		font-family: var(--mono, monospace);
	}
	.desk-settings-panel header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 10px;
		background: #1f180c;
		border-bottom: 2px solid #5a4a2f;
		font-size: 10px;
		letter-spacing: 0.08em;
	}
	.desk-settings-panel .x {
		background: transparent;
		border: 1px solid #5a4a2f;
		color: #e3d072;
		width: 24px;
		height: 24px;
		padding: 0;
		font: 900 13px/1 var(--mono, monospace);
		cursor: pointer;
	}
	.settings-body {
		padding: 10px 10px 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.settings-body h4 {
		margin: 0 0 6px;
		font-size: 9px;
		letter-spacing: 0.1em;
		color: #efc870;
	}
	.settings-body label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 9px;
		margin: 0 0 5px;
		cursor: pointer;
	}
	.settings-body .flag-picker {
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.settings-body .flag-picker span {
		font-size: 9px;
	}
	.settings-body select {
		min-width: 185px;
		padding: 5px 6px;
		background: #241a0e;
		border: 1px solid #6a5a30;
		color: #f0dfaa;
		font: 8px var(--mono, monospace);
	}
	.settings-body .ghost {
		margin-top: 6px;
		width: 100%;
		padding: 8px;
		background: #2a2010;
		border: 2px dashed #6a5a30;
		color: #c8b870;
		font: 8px var(--mono, monospace);
		letter-spacing: 0.06em;
		cursor: pointer;
	}
	.settings-body .hint {
		margin: 0;
		font-size: 8px;
		opacity: 0.7;
	}
	.scene.night-tint .scene-frame {
		filter: saturate(0.85) brightness(0.92) hue-rotate(-8deg);
	}
	.scene.crt-scan .scene-frame::after {
		content: '';
		pointer-events: none;
		position: absolute;
		inset: 0;
		z-index: 50;
		background: repeating-linear-gradient(
			to bottom,
			rgba(0, 0, 0, 0.06) 0 1px,
			transparent 1px 3px
		);
		mix-blend-mode: multiply;
	}
	.scene.reduce-motion :global(*),
	.scene.reduce-motion :global(*::before),
	.scene.reduce-motion :global(*::after) {
		animation-duration: 0.01ms !important;
		animation-iteration-count: 1 !important;
		transition-duration: 0.01ms !important;
	}

</style>
