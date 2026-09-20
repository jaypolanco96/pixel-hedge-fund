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

function decodeXml(s: string): string {
	return s
		.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'");
}

function stripTags(s: string): string {
	return decodeXml(s).replace(/<[^>]+>/g, '').trim();
}

function sampleHeadlines(label: string): NewsHeadline[] {
	return [
		{
			title: `${label} in focus as crypto desks watch flows`,
			link: '',
			source: 'SAMPLE',
			publishedAt: null
		},
		{
			title: `Markets: traders map levels for ${label}`,
			link: '',
			source: 'SAMPLE',
			publishedAt: null
		},
		{
			title: `${label} tape quiet — SAMPLE wire`,
			link: '',
			source: 'SAMPLE',
			publishedAt: null
		}
	];
}

export async function fetchNewsForSymbol(symbolInput?: string | null): Promise<NewsResponse> {
	const def = resolveSymbol(symbolInput);
	const q = encodeURIComponent(def.newsQuery);
	const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;

	try {
		const res = await fetch(url, {
			headers: {
				Accept: 'application/rss+xml, application/xml, text/xml, */*',
				'User-Agent': 'PixelHedgeFundDesk/1.0'
			},
			signal: AbortSignal.timeout(10_000)
		});
		if (!res.ok) throw new Error(`news HTTP ${res.status}`);
		const xml = await res.text();
		const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 5);
		const headlines: NewsHeadline[] = [];
		for (const m of items) {
			const block = m[1];
			const title = stripTags((block.match(/<title>([\s\S]*?)<\/title>/) ?? [])[1] ?? '');
			const link = stripTags((block.match(/<link>([\s\S]*?)<\/link>/) ?? [])[1] ?? '');
			const source = stripTags((block.match(/<source[^>]*>([\s\S]*?)<\/source>/) ?? [])[1] ?? 'Google News');
			const pub = stripTags((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) ?? [])[1] ?? '');
			if (!title) continue;
			headlines.push({
				title,
				link,
				source,
				publishedAt: pub || null
			});
		}
		if (!headlines.length) throw new Error('empty news feed');
		return {
			ok: true,
			symbol: def.canonical,
			display: def.display,
			sample: false,
			headlines,
			provider: 'google-news-rss'
		};
	} catch (err) {
		console.warn(`[News] ${def.display} fallback → SAMPLE`, err);
		return {
			ok: false,
			symbol: def.canonical,
			display: def.display,
			sample: true,
			headlines: sampleHeadlines(def.label),
			provider: 'sample',
			error: err instanceof Error ? err.message : String(err)
		};
	}
}
