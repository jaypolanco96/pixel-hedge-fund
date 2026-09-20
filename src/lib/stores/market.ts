import { writable } from 'svelte/store';
import type { QuoteResponse, SignalResponse, TraderLeg } from '$lib/data/types';

export const quote = writable<QuoteResponse | null>(null);
export const signal = writable<SignalResponse | null>(null);
export const legs = writable<TraderLeg[]>([]);
export const entrySeed = writable<number | null>(null);
