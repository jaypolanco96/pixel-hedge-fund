import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
	executablePath: process.env.TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
	headless: true
});
try {
	const page = await browser.newPage();
	await page.clock.install();
	let mode = 'fail';
	let fixtureSample = false;
	let quoteCalls = 0;
	let tapeCalls = 0;
	let tapeFails = false;
	let releaseQuote;
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.route('**/api/**', async (route) => {
		const url = new URL(route.request().url());
		let data = { ok: false, sample: true, positions: [], details: [], coins: [], headlines: [] };
		if (url.pathname === '/api/market/quote') {
			quoteCalls++;
			if (mode === 'fail') return route.fulfill({ status: 503, body: 'Unavailable' });
			if (mode === 'slow') await new Promise((resolve) => { releaseQuote = resolve; });
			data = { symbol: 'TEST', display: url.searchParams.get('symbol'), price: 100, mark: 100, bid: 99, ask: 101, t: Date.now(), provider: fixtureSample ? 'sample' : 'bybit', sample: fixtureSample };
		} else if (url.pathname === '/api/market/signal') {
			data = { symbol: url.searchParams.get('symbol'), tf: '15m', asof: new Date().toISOString(), last: 100, bias: 'FLAT', mtf: { regime: 'FLAT', setup: 'FLAT', aligned: false }, supertrend: { value: 100, direction: 1 }, ema: { 21: 100, 55: 100 }, rsi: 50, macd: { line: 0, signal: 0, hist: 0 }, atr: { 14: 1, pct: 1, state: 'normal' }, structure: 'none', confluence: 0, confluenceBand: 'weak', risk: { stop: 99, risk_pct: 1, tp1: 101, tp2: 102, rr_tp1: 1 }, sample: fixtureSample, provider: fixtureSample ? 'sample' : 'bybit' };
		} else if (url.pathname === '/api/market/candles') data = { bars: [], sample: fixtureSample };
		else if (url.pathname === '/api/market/tape') {
			tapeCalls++;
			if (tapeFails) return route.fulfill({ status: 429, body: 'Too Many Requests' });
			data = { quotes: ['SOLUSDT', 'ETHUSDT'].map((display) => ({ symbol: display, display, price: 100, mark: 100, bid: 99, ask: 101, t: Date.now(), change24h: 0, sample: fixtureSample, provider: fixtureSample ? 'sample' : 'bybit' })) };
		}
		await route.fulfill({ json: data }).catch(() => {});
	});
	await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173/floor');
	await page.waitForFunction(() => document.querySelector('.error-note')?.textContent.includes('retrying in 20s'));
	assert.match(await page.locator('.error-note').innerText(), /\/api\/market\/quote: HTTP 503/);
	assert.equal(quoteCalls, 1);
	await page.clock.fastForward(19_000);
	assert.equal(quoteCalls, 1, 'No retry before backoff');
	await page.clock.fastForward(1_000);
	await page.waitForFunction(() => document.querySelector('.error-note')?.textContent.includes('retrying in 40s'));
	assert.equal(quoteCalls, 2);
	mode = 'ok';
	await page.clock.fastForward(40_000);
	await page.waitForFunction(() => !document.querySelector('.error-note'));
	assert.equal(quoteCalls, 3, 'Retry recovers');
	await page.clock.fastForward(10_000);
	await page.waitForFunction(() => document.querySelector('.wire-status strong') !== null);
	await new Promise((resolve) => setTimeout(resolve, 100));
	assert.equal(quoteCalls, 4, 'Recovery restores normal cadence');
	assert.match(await page.locator('.crt-topline').innerText(), /BYBIT LIVE/);
	fixtureSample = true;
	mode = 'slow';
	await page.clock.fastForward(10_000);
	await new Promise((resolve) => setTimeout(resolve, 100));
	assert.equal(quoteCalls, 5);
	await page.clock.fastForward(15_000);
	assert.equal(quoteCalls, 5, 'Slow request does not overlap another poll');
	mode = 'ok';
	releaseQuote();
	await new Promise((resolve) => setTimeout(resolve, 100));
	await page.clock.fastForward(10_000);
	await new Promise((resolve) => setTimeout(resolve, 100));
	assert.equal(quoteCalls, 6, 'Polling continues after slow request finishes');
	mode = 'slow';
	await page.clock.fastForward(10_000);
	await new Promise((resolve) => setTimeout(resolve, 100));
	assert.equal(quoteCalls, 7);
	const releaseStale = releaseQuote;
	mode = 'ok';
	await page.getByLabel('Active trading symbol').selectOption('ETHUSDT');
	await new Promise((resolve) => setTimeout(resolve, 100));
	assert.equal(quoteCalls, 8, 'Pair change cancels stale poll and requests new pair immediately');
	releaseStale();
	await new Promise((resolve) => setTimeout(resolve, 100));
	assert.equal(await page.locator('.error-note').count(), 0, 'Canceled request does not show an error');
	mode = 'slow';
	await page.clock.fastForward(10_000);
	await new Promise((resolve) => setTimeout(resolve, 100));
	assert.equal(quoteCalls, 9);
	await page.clock.fastForward(20_000);
	await page.waitForFunction(() => document.querySelector('.error-note')?.textContent.includes('Request timed out'));
	assert.match(await page.locator('.error-note').innerText(), /retrying in 20s/);
	releaseQuote();
	mode = 'ok';
	await page.getByLabel('Active trading symbol').selectOption('SOLUSDT');
	await page.waitForFunction(() => !document.querySelector('.error-note'));
	assert.match(await page.locator('.crt-topline').innerText(), /SAMPLE/);
	tapeFails = true;
	await page.clock.fastForward(10_000);
	await page.waitForFunction(() => document.querySelector('.error-note')?.textContent.includes('/api/market/tape: HTTP 429'));
	const failedTapeCalls = tapeCalls;
	await page.clock.fastForward(10_000);
	await new Promise((resolve) => setTimeout(resolve, 100));
	assert.equal(tapeCalls, failedTapeCalls, 'Tape rate limit has its own backoff');
	assert.match(await page.locator('.error-note').innerText(), /\/api\/market\/tape: HTTP 429/, 'Successful market polls preserve tape errors');
	tapeFails = false;
	await page.clock.fastForward(10_000);
	await page.waitForFunction(() => !document.querySelector('.error-note'));
	assert.equal(tapeCalls, failedTapeCalls + 1, 'Tape recovers after backoff');
	mode = 'fail';
	await page.getByLabel('Active trading symbol').selectOption('ETHUSDT');
	await page.waitForFunction(() => document.querySelector('.error-note')?.textContent.includes('retrying in 20s'));
	for (const [delay, nextDelay] of [[20, 40], [40, 80], [80, 120], [120, 120]]) {
		const before = quoteCalls;
		await page.clock.fastForward(delay * 1000 - 1000);
		assert.equal(quoteCalls, before, `No early retry during ${delay}s backoff`);
		await page.clock.fastForward(1000);
		await new Promise((resolve) => setTimeout(resolve, 100));
		assert.equal(quoteCalls, before + 1);
		assert.match(await page.locator('.error-note').innerText(), new RegExp(`retrying in ${nextDelay}s`));
	}
	const finalQuoteCalls = quoteCalls;
	await page.goto('about:blank');
	await page.clock.fastForward(120_000);
	assert.equal(quoteCalls, finalQuoteCalls, 'No requests after navigation');
	assert.deepEqual(errors, []);
	console.log('PASS: endpoint errors, backoff, recovery, slow-request exclusion, pair cancellation, timeout, tape rate limits, live/sample labels, navigation cleanup');
} finally {
	await browser.close();
}
