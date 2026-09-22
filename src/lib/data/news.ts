import { resolveSymbol } from './symbols';

export interface NewsHeadline {
	title: string;
	link: string;
	source: string;
	publishedAt: string | null;
}

export interface NewsResponse {
	ok: boolean;
	symbol: string;
	display: string;
	sample: boolean;
	headlines: NewsHeadline[];
	provider: 'google-news-rss' | 'sample';
	error?: string;
}

type CachedNews = { expiresAt: number; response: NewsResponse };

const CACHE_TTL_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
const newsCache = new Map<string, CachedNews>();

function decodeXml(value: string): string {
	return value
		.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.trim();
}

function stripTags(value: string): string {
	return decodeXml(value).replace(/<[^>]+>/g, '').trim();
}

function rssField(item: string, tag: string): string {
	const match = item.match(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'i'));
	return match ? stripTags(match[1]) : '';
}

function sampleHeadlines(label: string): NewsHeadline[] {
	return [
		{
			title: label + ' in focus as crypto desks watch flows',
			link: '',
			source: 'SAMPLE',
			publishedAt: null
		},
		{
			title: 'Markets: traders map levels for ' + label,
			link: '',
			source: 'SAMPLE',
			publishedAt: null
		},
		{
			title: label + ' tape quiet - SAMPLE wire',
			link: '',
			source: 'SAMPLE',
			publishedAt: null
		}
	];
}

export async function fetchNewsForSymbol(symbolInput?: string | null): Promise<NewsResponse> {
	const def = resolveSymbol(symbolInput);
	const cached = newsCache.get(def.canonical);
	if (cached && cached.expiresAt > Date.now()) return cached.response;

	const url = new URL('https://news.google.com/rss/search');
	url.searchParams.set('q', def.newsQuery);
	url.searchParams.set('hl', 'en-US');
	url.searchParams.set('gl', 'US');
	url.searchParams.set('ceid', 'US:en');

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	try {
		const response = await fetch(url, {
			headers: {
				Accept: 'application/rss+xml, application/xml, text/xml, */*',
				'User-Agent': 'PixelHedgeFundDesk/1.0'
			},
			signal: controller.signal
		});
		if (!response.ok) throw new Error('news HTTP ' + response.status);

		const xml = await response.text();
		const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].slice(0, 5);
		const headlines = items
			.map((match): NewsHeadline | null => {
				const item = match[1];
				const title = rssField(item, 'title');
				const link = rssField(item, 'link');
				const source = rssField(item, 'source') || 'Google News';
				const publishedAt = rssField(item, 'pubDate') || rssField(item, 'published');
				if (!title) return null;
				return { title, link, source, publishedAt: publishedAt || null };
			})
			.filter((headline): headline is NewsHeadline => headline !== null);
		if (!headlines.length) throw new Error('empty news feed');

		const live: NewsResponse = {
			ok: true,
			symbol: def.canonical,
			display: def.display,
			sample: false,
			headlines,
			provider: 'google-news-rss'
		};
		newsCache.set(def.canonical, { expiresAt: Date.now() + CACHE_TTL_MS, response: live });
		return live;
	} catch {
		return {
			ok: false,
			symbol: def.canonical,
			display: def.display,
			sample: true,
			headlines: sampleHeadlines(def.label),
			provider: 'sample',
			error: 'Live Google News feed unavailable'
		};
	} finally {
		clearTimeout(timeout);
	}
}
