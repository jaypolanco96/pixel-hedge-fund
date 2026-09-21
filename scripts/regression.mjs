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
	console.log(`${passed} regression groups passed; all exchange requests mocked.`);
} finally {
	globalThis.fetch = originalFetch; Date.now = originalNow; console.warn = originalWarn;
	delete globalThis.localStorage; delete globalThis.sessionStorage; delete globalThis.location;
	await server.close();
}
