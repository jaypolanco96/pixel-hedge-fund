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
	provider: 'sample';
	error?: string;
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
	return {
		ok: true,
		symbol: def.canonical,
		display: def.display,
		sample: true,
		headlines: sampleHeadlines(def.label),
		provider: 'sample'
	};
}
