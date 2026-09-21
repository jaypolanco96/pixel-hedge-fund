import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Pure/module tests: no real network, private environment, or user credentials.
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
const originalWarn = console.warn;
globalThis.fetch = async () => { throw new Error('Unmocked network request'); };
const server = await createServer({
	configFile: false, envFile: false, logLevel: 'error',
	server: { middlewareMode: true, watch: null, hmr: false },
	resolve: { alias: { $lib: fileURLToPath(new URL('../src/lib', import.meta.url)) } },
	plugins: [{ name: 'test-private-env', resolveId(id) { if (id === '$env/dynamic/private') return '\0test-env'; }, load(id) { if (id === '\0test-env') return 'export const env = {}'; } }]
});
const load = (path) => server.ssrLoadModule(`/src/${path}`);
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
const memory = new Map();
globalThis.localStorage = globalThis.sessionStorage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
globalThis.location = new URL('http://localhost:5174/');
const reply = (body) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
try {
	const { resolveSymbol } = await load('lib/data/symbols.ts');
	const { sampleBars } = await load('lib/data/sample.ts');
	const { computeSignal } = await load('lib/ta/signal.ts');
	const { validBar, completedBars } = await load('lib/data/validation.ts');
	const { contractsFromBase } = await load('lib/data/orderSizing.ts');
	const def = { ...resolveSymbol('NEARUSDT'), sampleMid: 0.0000002, decimals: 12 };
	const bars = sampleBars(def, 900_000, 100);
	await test('dynamic channels retain their own symbol and small-price risk levels', () => {
		assert.equal(resolveSymbol('NEARUSDT').bybit, 'NEARUSDT');
		const signal = computeSignal(bars, bars, { sample: false, provider: 'bybit', symbol: 'NEARUSDT' });
		assert.equal(signal.symbol, 'NEARUSDT');
		assert.ok(signal.risk.stop > 0 && signal.risk.stop < 0.000001);
		assert.ok(signal.atr['14'] > 0);
		assert.ok(signal.ema['55'] > 0);
		assert.throws(() => computeSignal([], bars, { sample: true, provider: 'sample' }), /55/);
	});
	await test('candle validation and completed-bar boundaries', () => {
		assert.equal(validBar({ ...bars[0], o: NaN }), false);
		assert.equal(validBar({ ...bars[0], h: 0 }), false);
		const now = Date.now();
		assert.equal(completedBars([{ ...bars[0], t: now - 900_000 }, { ...bars[0], t: now }], 900_000, now).length, 1);
	});
	await test('base-coin sizing converts to contracts without exceeding requested exposure', () => {
		assert.equal(contractsFromBase(0.01009, 0.001, 0.1, 0.1), 10);
		assert.throws(() => contractsFromBase(0.000001, 0.001, 0.1, 0.1), /minimum/);
		assert.throws(() => contractsFromBase(Infinity, 1, 1, 1), /Invalid/);
	});
	const settings = await load('lib/persist/deskSettings.ts');
	const stickies = await load('lib/persist/stickyNotes.ts');
	await test('malformed persistence cannot override boolean settings or duplicate keyed notes', () => {
		memory.set(settings.DESK_SETTINGS_KEY, JSON.stringify({ showPet: 'no', soundOff: false }));
		assert.equal(settings.loadDeskSettings().showPet, true);
		assert.equal(settings.loadDeskSettings().soundOff, false);
		memory.set(stickies.STICKY_STORAGE_KEY, JSON.stringify([{ id: 'a', text: 'ok', x: 4, y: 5 }, { id: 'a', text: 'duplicate', x: 4, y: 5 }, { id: 'b', text: 'invalid', x: null, y: 5 }]));
		assert.equal(stickies.loadStickyNotes().length, 1);
	});
	const { exchangeFetch } = await load('lib/client/exchangeHeaders.ts');
	await test('exchange credentials are restricted to the correct same-origin API', async () => {
		memory.set('phf-exchange-keys', JSON.stringify({ bybit: { apiKey: 'test-by', apiSecret: 'dummy', baseUrl: 'https://api.bybit.com' }, blofin: { apiKey: 'test-bf', apiSecret: 'dummy', passphrase: 'dummy', baseUrl: 'https://openapi.blofin.com' } }));
		let sent;
		globalThis.fetch = async (_url, init) => { sent = new Headers(init.headers); return reply({}); };
		await exchangeFetch('/api/bybit/health');
		assert.equal(sent.get('x-phf-bybit-key'), 'test-by');
		assert.equal(sent.has('x-phf-blofin-key'), false);
		await exchangeFetch('/api/market/tape');
		assert.equal(sent.has('x-phf-bybit-key'), false);
		await exchangeFetch(new Request('https://example.invalid/api/bybit/health', { headers: { 'x-phf-bybit-key': 'test', 'x-test': 'kept' } }));
		assert.equal(sent.has('x-phf-bybit-key'), false);
		assert.equal(sent.get('x-test'), 'kept');
	});
	const { exchangeAuthAls } = await load('lib/server/requestExchangeAuth.ts');
	const { normalizeExchangeBase } = await load('lib/server/exchangeSecrets.ts');
	await test('exchange base URLs cannot redirect signed requests to arbitrary hosts', () => {
		assert.equal(normalizeExchangeBase('https://attacker.example', 'bybit'), 'https://api.bybit.com');
		assert.equal(normalizeExchangeBase('http://api.bybit.com', 'bybit'), 'https://api.bybit.com');
		assert.equal(normalizeExchangeBase('https://api-testnet.bybit.com', 'bybit'), 'https://api-testnet.bybit.com');
		assert.equal(normalizeExchangeBase('https://demo-trading-openapi.blofin.com', 'blofin'), 'https://demo-trading-openapi.blofin.com');
	});
	const bybit = await load('lib/data/bybit.ts');
	const auth = { bybit: { apiKey: 'test', apiSecret: 'dummy', baseUrl: 'https://api.bybit.com' }, blofin: { apiKey: 'test', apiSecret: 'dummy', passphrase: 'dummy', baseUrl: 'https://openapi.blofin.com' } };
	await test('Bybit rejects unsafe orders and preserves spot baseCoin units', async () => {
		const order = { category: 'spot', symbol: 'BTCUSDT', side: 'Buy', orderType: 'Market', qty: '0.01', marketUnit: 'baseCoin' };
		globalThis.fetch = async () => { throw new Error('Validation must precede requests'); };
		assert.equal((await bybit.placeBybitOrder({ ...order, qty: 'Infinity' })).ok, false);
		assert.equal((await bybit.placeBybitOrder({ ...order, side: 'bad' })).ok, false);
		assert.equal((await bybit.placeBybitOrder({ ...order, reduceOnly: true, takeProfit: '100', stopLoss: '50' })).ok, false);
		let payload;
		globalThis.fetch = async (_url, init) => { payload = JSON.parse(init.body); return reply({ retCode: 0, result: { orderId: 'test-only' } }); };
		assert.equal((await exchangeAuthAls.run(auth, () => bybit.placeBybitOrder(order))).ok, true);
		assert.equal(payload.marketUnit, 'baseCoin');
		globalThis.fetch = async () => reply({});
		assert.equal((await exchangeAuthAls.run(auth, () => bybit.placeBybitOrder(order))).ok, false);
	});
	const blofin = await load('lib/data/blofin.ts');
	await test('BloFin converts base quantities using live instrument metadata before submitting', async () => {
		let payload;
		globalThis.fetch = async (url, init) => {
			if (String(url).includes('/instruments?')) return reply({ code: '0', data: [{ instId: 'BTC-USDT', state: 'live', contractType: 'linear', settleCurrency: 'USDT', contractValue: '0.001', lotSize: '0.1', minSize: '0.1', maxMarketSize: '1000' }] });
			payload = JSON.parse(init.body); return reply({ code: '0', data: [{ orderId: 'test-only' }] });
		};
		const order = { instId: 'BTC-USDT', size: '0.01009', sizeUnit: 'baseCoin', marginMode: 'isolated', side: 'buy', orderType: 'market' };
		assert.equal((await exchangeAuthAls.run(auth, () => blofin.placeOrder(order))).ok, true);
		assert.equal(payload.size, '10');
		assert.equal(payload.sizeUnit, undefined);
	});
	await test('failed candle/ticker refreshes preserve SAMPLE on cached exchange data', async () => {
		globalThis.fetch = async (url) => String(url).includes('/kline?')
			? reply({ retCode: 0, result: { list: bars.map((b) => [b.t, b.o, b.h, b.l, b.c, b.v]) } })
			: reply({ retCode: 0, result: { list: [{ symbol: 'NEARUSDT', lastPrice: '4', turnover24h: '10000' }] } });
		assert.equal((await bybit.fetchBybitCandles('NEARUSDT', '15m', 100)).sample, false);
		assert.equal((await bybit.fetchBybitQuote('NEARUSDT')).sample, false);
		const future = Date.now() + 60_000;
		Date.now = () => future;
		console.warn = () => {};
		globalThis.fetch = async () => { throw new Error('simulated feed outage'); };
		assert.equal((await bybit.fetchBybitCandles('NEARUSDT', '15m', 100)).sample, true);
		assert.equal((await bybit.fetchBybitQuote('NEARUSDT')).sample, true);
		assert.equal((await bybit.fetchBybitTopVolumeQuotes())[0].sample, true);
	});
	const candlesRoute = await load('routes/api/market/candles/+server.ts');
	await test('invalid candle limits return 400 before any exchange request', async () => {
		for (const limit of ['NaN', '-1', '0', '1.5', 'Infinity']) {
			await assert.rejects(() => candlesRoute.GET({ url: new URL(`http://localhost/api/market/candles?limit=${limit}`) }), (error) => error.status === 400);
		}
	});
	const cast = await load('lib/characters/cast.ts');
	await test('cast trader PNL scales with leverage', () => {
		const fiveX = cast.TRADERS.find((trader) => trader.id === 'L05');
		const tenX = cast.TRADERS.find((trader) => trader.id === 'L10');
		const hundredX = cast.TRADERS.find((trader) => trader.id === 'L100');
		assert.ok(fiveX && tenX && hundredX);

		const fiveLeg = cast.markLeg(fiveX, 100, 101, false);
		const tenLeg = cast.markLeg(tenX, 100, 101, false);
		const hundredLeg = cast.markLeg(hundredX, 100, 101, false);
		assert.deepEqual(
			[fiveLeg.notionalUsd, tenLeg.notionalUsd, hundredLeg.notionalUsd],
			[500_000, 1_000_000, 10_000_000]
		);
		assert.ok(Math.abs(fiveLeg.unrealizedPnlUsd - 5_000) < 1e-6);
		assert.ok(Math.abs(tenLeg.unrealizedPnlUsd - 10_000) < 1e-6);
		assert.ok(Math.abs(hundredLeg.unrealizedPnlUsd - 100_000) < 1e-6);
		assert.equal(hundredLeg.unrealizedPnlUsd / fiveLeg.unrealizedPnlUsd, 20);
		assert.equal(fiveLeg.unrealizedPnlPctMargin, 0.05);
		assert.equal(tenLeg.unrealizedPnlPctMargin, 0.1);
		assert.equal(hundredLeg.unrealizedPnlPctMargin, 1);
	});
	const posture = await load('lib/ta/posture.ts');
	const tape = (over = {}) => ({
		symbol: 'SOLUSDT', tf: '15m', asof: '', last: 100, bias: 'LONG',
		mtf: { regime: 'LONG', setup: 'LONG', aligned: true },
		supertrend: { value: 98, direction: 1 }, ema: { '21': 99, '55': 97 }, rsi: 60,
		macd: { line: 1, signal: 0.5, hist: 0.5 }, atr: { '14': 0.5, pct: 0.5, state: 'normal' },
		structure: 'pullback', confluence: 5, confluenceBand: 'high',
		risk: { stop: 98, risk_pct: 2, tp1: 103, tp2: 105, rr_tp1: 1.5 }, sample: false, provider: 'bybit', ...over
	});
	const run = (signal, book = {}, mark = 100, decision = true, options = {}) =>
		posture.reconcileBook(book, signal, cast.TRADERS, mark, false, 'SOLUSDT', 'SOLUSDT', decision, options);
	const sideOf = (id) => cast.TRADERS.find((t) => t.id === id).side;
	await test('longs and shorts both trade a strong trend: trend desk full size, exhausted fade desk half size', () => {
		const first = run(tape({ last: 102, rsi: 78 }), {}, 102);
		assert.deepEqual(first.riskDenied, []);
		const res = run(tape({ last: 102, rsi: 78 }), first.book, 102);
		const shorts = res.legs.filter((l) => l.side === 'short');
		const longs = res.legs.filter((l) => l.side === 'long');
		assert.equal(longs.length, 5);
		assert.equal(shorts.length, 5);
		assert.ok(longs.every((l) => l.strategy === 'trend'));
		assert.ok(shorts.every((l) => l.strategy === 'hedge'));
		const s10 = shorts.find((l) => l.traderId === 'S10');
		assert.equal(s10.notionalUsd, cast.traderNotional(10) * posture.HEDGE_SIZE_SCALE);
		assert.ok(s10.stop > s10.entryMark && s10.tp1 < s10.entryMark);
	});
	await test('the counter-trend desk stays flat without real exhaustion but keeps looking', () => {
		const signal = tape({ last: 100.2, rsi: 58 });
		const res = run(signal, {}, 100.2);
		assert.equal(res.legs.filter((l) => l.side === 'short').length, 0);
		const card = posture.postureForTrader(cast.TRADERS.find((t) => t.id === 'S10'), signal, null);
		assert.equal(card.posture, 'counter');
		assert.equal(card.status, 'watching');
		const forming = posture.postureForTrader(cast.TRADERS.find((t) => t.id === 'S05'), tape({ last: 100.8, rsi: 62 }), null);
		assert.equal(forming.posture, 'considering');
		assert.ok(forming.cloud);
	});
	await test('a FLAT tape sends each desk fading its own side of the range', () => {
		const flat = { bias: 'FLAT', confluence: 0, mtf: { regime: 'FLAT', setup: 'FLAT', aligned: false }, structure: 'none' };
		const oversold = run(tape({ ...flat, last: 98, rsi: 28 }), {}, 98);
		assert.ok(oversold.legs.length > 0 && oversold.legs.every((l) => l.side === 'long'));
		const overbought = run(tape({ ...flat, last: 101.5, rsi: 72 }), {}, 101.5);
		assert.ok(overbought.legs.length > 0 && overbought.legs.every((l) => l.side === 'short'));
	});
	await test('fade legs survive a bias flip until RSI normalises, trend legs die on a Supertrend flip', () => {
		const opened = run(tape({ last: 102, rsi: 78 }), {}, 102);
		assert.ok(opened.book.S10 && opened.book.L10);
		const held = run(tape({ last: 101.9, rsi: 64 }), opened.book, 101.9);
		assert.ok(held.book.S10, 'fade stays open while RSI is still elevated');
		const normalised = run(tape({ last: 100, rsi: 44 }), opened.book, 100);
		assert.equal(normalised.book.S10, undefined);
		const flipped = run(tape({ bias: 'SHORT', supertrend: { value: 103, direction: -1 }, last: 101.9, rsi: 64 }), opened.book, 101.9);
		assert.equal(flipped.book.L10, undefined);
		assert.ok(flipped.book.S10);
	});
	await test('stop-outs are reported so the desk can sit out instead of re-firing', () => {
		const opened = run(tape({ last: 102, rsi: 78 }), {}, 102);
		const hit = run(tape({ last: 106, rsi: 78 }), opened.book, 106, false);
		assert.ok(hit.stopOuts.includes('S10'));
		assert.equal(hit.stopOuts.every((id) => sideOf(id) === 'short'), true);
	});
	await test('the risk desk caps one-way net exposure and the held desk shows why', () => {
		const signal = tape({ last: 100.2, rsi: 60 });
		assert.deepEqual(run(signal, {}, 100.2).riskDenied, [], 'a fully one-sided default book fits under the cap');
		const hot = cast.TRADERS.map((t) => (t.id === 'L100' ? { ...t, leverage: 200 } : t));
		const res = posture.reconcileBook({}, signal, hot, 100.2, false, 'SOLUSDT', 'SOLUSDT', true);
		assert.deepEqual(res.riskDenied, ['L100']);
		assert.equal(res.legs.length, 4);
		const exposure = posture.bookExposure(res.legs);
		assert.equal(exposure.netUsd, 9_000_000);
		assert.ok(exposure.netUsd <= 48_000_000 * posture.MAX_NET_FRACTION);
		const held = posture.postureForTrader(cast.TRADERS.find((t) => t.id === 'L100'), signal, null, true);
		assert.equal(held.posture, 'considering');
		assert.match(held.cloud, /net cap/);
		const again = posture.reconcileBook(res.book, signal, hot, 100.2, false, 'SOLUSDT', 'SOLUSDT', true);
		assert.equal(again.riskDenied.length, 1, 'a held desk stays held while net stays one-way');
	});
	await test('fade legs time out by leverage and the timed-out desk is not re-fired while on cooldown', () => {
		const T = 1_000_000_000_000;
		const bar = 15 * 60_000;
		const signal = tape({ last: 102, rsi: 78 });
		const opened = run(signal, {}, 102, true, { now: T });
		assert.ok(opened.book.S100 && opened.book.S10);
		const early = run(signal, opened.book, 102, true, { now: T + 3 * bar });
		assert.ok(early.book.S100 && early.book.S10);
		assert.deepEqual(early.timeStops, []);
		const late = run(signal, opened.book, 102, true, { now: T + 4 * bar, cooldown: new Set(['S100']) });
		assert.deepEqual(late.timeStops, ['S100']);
		assert.equal(late.book.S100, undefined);
		assert.ok(late.book.S10, 'a 10x desk is more patient than a 100x desk');
		assert.equal(run(signal, opened.book, 102, false, { now: T + 9 * bar }).timeStops.length, 0, 'time stops only fire at closed-candle decisions');
	});
	await test('PM and CIO notes report net exposure and risk-desk holds', () => {
		const hot = cast.TRADERS.map((t) => (t.id === 'L100' ? { ...t, leverage: 200 } : t));
		const res = posture.reconcileBook({}, tape({ last: 100.2, rsi: 60 }), hot, 100.2, false, 'SOLUSDT', 'SOLUSDT', true);
		const risk = { ...posture.bookExposure(res.legs), denied: res.riskDenied.length };
		const pm = cast.STAFF.find((s) => s.role === 'pm');
		const cio = cast.STAFF.find((s) => s.role === 'cio');
		assert.equal(posture.staffNote(pm, tape(), risk), 'net long $9.0M / gross $9.0M');
		assert.equal(posture.staffNote(cio, tape(), risk), 'net cap hit . 1 desk held');
		assert.equal(posture.staffNote(pm, tape({ bias: 'FLAT' }), { longUsd: 0, shortUsd: 0, netUsd: 0, grossUsd: 0, denied: 0 }), 'alloc: stay balanced');
	});
	await test('TIME backdates a position: entry is the tape price N minutes ago', () => {
		const bar = 15 * 60_000;
		const T0 = 1_000_000_000_000 - (1_000_000_000_000 % bar);
		const hist = [
			{ t: T0 - 2 * bar, o: 100, h: 101, l: 99, c: 101, v: 1 },
			{ t: T0 - bar, o: 101, h: 103, l: 100, c: 103, v: 1 },
			{ t: T0, o: 103, h: 106, l: 103, c: 105, v: 1 }
		];
		const now = T0 + 5 * 60_000;
		assert.equal(posture.priceAt(hist, now, 105, now), 105, 'zero minutes is the current mark');
		assert.equal(posture.priceAt(hist, T0 - bar, 105, now), 101, 'candle open');
		assert.equal(posture.priceAt(hist, T0 - bar / 2, 105, now), 102, 'halfway through a closed candle');
		assert.equal(posture.priceAt(hist, T0, 105, now), 103, 'open of the forming candle');
		assert.ok(Math.abs(posture.priceAt(hist, T0 + 2.5 * 60_000, 105, now) - 104) < 1e-9, 'forming candle interpolates to the live mark');
		assert.equal(posture.priceAt(hist, T0 - 10 * bar, 105, now), 100, 'before history clamps to the first open');
	});
	await test('a forced position survives creation, even when the tape already ran through its stop', () => {
		const trader = cast.TRADERS.find((t) => t.id === 'L100');
		const signal = tape();
		const now = 1_000_000_000_000;
		const stopped = posture.forceBookEntry(trader, signal, undefined, 110, 100, now - 900_000);
		assert.ok(stopped.stop < 100, 'stop re-laid below the current mark so a long is not stopped instantly');
		assert.ok(stopped.tp1 > 110 && stopped.manual && stopped.openedAt === now - 900_000);
		const winner = posture.forceBookEntry(trader, signal, undefined, 90, 100, now - 900_000);
		assert.ok(winner.tp1 > 100, 'targets re-laid above the mark once passed');
		const res = posture.reconcileBook({ L100: stopped }, signal, [trader], 100, false, 'SOLUSDT', 'SOLUSDT', true, { now });
		assert.ok(res.book.L100 && res.stopOuts.length === 0 && res.takeProfits.length === 0);
		assert.equal(res.legs[0].entryMark, 110);
		assert.ok(res.legs[0].unrealizedPnlUsd < 0);
	});
	await test('manual positions skip thesis and time exits; trend or fade strategy follows the tape', () => {
		const now = 1_000_000_000_000;
		const shortTrader = cast.TRADERS.find((t) => t.id === 'S10');
		const longTrader = cast.TRADERS.find((t) => t.id === 'L10');
		const up = tape();
		assert.equal(posture.forceBookEntry(longTrader, up, undefined, 100, 100, now).strategy, 'trend');
		const fade = posture.forceBookEntry(shortTrader, up, undefined, 100, 100, now - 10 * 60 * 60_000);
		assert.equal(fade.strategy, 'hedge');
		const held = posture.reconcileBook({ S10: fade }, up, [shortTrader], 100, false, 'SOLUSDT', 'SOLUSDT', true, { now });
		assert.ok(held.book.S10 && held.timeStops.length === 0, 'a 10-hour-old manual fade is not time-stopped');
		assert.equal(held.legs[0].notionalUsd, cast.traderNotional(10) * posture.HEDGE_SIZE_SCALE);
		const flipped = tape({ bias: 'SHORT', supertrend: { value: 103, direction: -1 } });
		const trendLong = posture.forceBookEntry(longTrader, up, undefined, 100, 100, now);
		assert.ok(posture.reconcileBook({ L10: trendLong }, flipped, [longTrader], 100, false, 'SOLUSDT', 'SOLUSDT', true, { now }).book.L10, 'a manual trend leg is not closed by a Supertrend flip');
		const overwritten = posture.forceBookEntry(longTrader, up, trendLong, 99, 100, now - 60_000);
		assert.equal(overwritten.strategy, 'trend', 're-timing an open trader keeps its strategy and size');
	});
	console.log(`${passed} regression groups passed; all exchange requests mocked.`);
} finally {
	globalThis.fetch = originalFetch; Date.now = originalNow; console.warn = originalWarn;
	delete globalThis.localStorage; delete globalThis.sessionStorage; delete globalThis.location;
	await server.close();
}
