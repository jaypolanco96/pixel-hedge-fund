import { chromium } from 'playwright-core';

const URL = process.env.TEST_URL || 'http://127.0.0.1:5173/';

async function main() {
	const browser = await chromium.launch({
		executablePath: '/usr/bin/google-chrome',
		headless: true,
		args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
	});
	const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

	await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });

	await page.waitForSelector('#phf-hud-root', { timeout: 30000 });
	await page.waitForFunction(() => {
		const hud = document.getElementById('phf-hud-root');
		if (!hud || hud.children.length === 0) return false;
		const price = [...hud.querySelectorAll('[aria-label]')].find((el) =>
			(el.getAttribute('aria-label') || '').toLowerCase().includes('price')
		);
		return !!(price || hud.firstElementChild);
	}, { timeout: 30000 });

	await page.waitForTimeout(500);

	const before = await page.evaluate(() => {
		const hud = document.getElementById('phf-hud-root');
		const price =
			[...hud.querySelectorAll('[aria-label]')].find((el) =>
				(el.getAttribute('aria-label') || '').toLowerCase().includes('price')
			) || hud.firstElementChild;
		const rect = price.getBoundingClientRect();
		return {
			top: rect.top,
			left: rect.left,
			parentId: price.parentElement?.id || null,
			aria: price.getAttribute('aria-label'),
			position: getComputedStyle(price).position,
			hudChildCount: hud.children.length
		};
	});

	await page.evaluate(() => window.scrollBy(0, 400));
	await page.waitForTimeout(200);

	const afterScroll = await page.evaluate(() => {
		const hud = document.getElementById('phf-hud-root');
		const price =
			[...hud.querySelectorAll('[aria-label]')].find((el) =>
				(el.getAttribute('aria-label') || '').toLowerCase().includes('price')
			) ||
			document.querySelector('[aria-label*="price" i]') ||
			hud?.firstElementChild;
		if (!price) return { error: 'price not found after scroll' };
		const rect = price.getBoundingClientRect();
		return {
			top: rect.top,
			left: rect.left,
			parentId: price.parentElement?.id || null,
			scrollY: window.scrollY,
			position: getComputedStyle(price).position
		};
	});

	await page.waitForTimeout(2000);

	const afterWait = await page.evaluate(() => {
		const hud = document.getElementById('phf-hud-root');
		const price =
			[...hud.querySelectorAll('[aria-label]')].find((el) =>
				(el.getAttribute('aria-label') || '').toLowerCase().includes('price')
			) ||
			document.querySelector('[aria-label*="price" i]') ||
			hud?.firstElementChild;
		if (!price) return { error: 'price not found after wait', hudExists: !!hud };
		const rect = price.getBoundingClientRect();
		return {
			top: rect.top,
			left: rect.left,
			parentId: price.parentElement?.id || null,
			scrollY: window.scrollY,
			position: getComputedStyle(price).position,
			inHud: price.parentElement?.id === 'phf-hud-root'
		};
	});

	await browser.close();

	const delta = Math.abs((afterScroll.top ?? NaN) - before.top);
	const parentOk =
		afterScroll.parentId === 'phf-hud-root' && afterWait.parentId === 'phf-hud-root';
	const topOk = delta <= 1;
	const waitTopOk = Math.abs((afterWait.top ?? NaN) - before.top) <= 1;

	const result = {
		pass: topOk && parentOk && waitTopOk && !afterScroll.error && !afterWait.error,
		before,
		afterScroll,
		afterWait,
		deltaPx: delta,
		checks: { topOk, parentOk, waitTopOk }
	};

	console.log(JSON.stringify(result, null, 2));
	if (!result.pass) process.exit(1);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
