/** Convert base-coin exposure to exchange contracts, always rounding down. */
export function contractsFromBase(baseSize: number, contractValue: number, lotSize: number, minSize: number): number {
	if (![baseSize, contractValue, lotSize, minSize].every((n) => Number.isFinite(n) && n > 0)) {
		throw new Error('Invalid instrument sizing metadata or base quantity');
	}
	const lots = Math.floor(baseSize / contractValue / lotSize);
	const contracts = Number((lots * lotSize).toPrecision(14));
	if (!Number.isFinite(contracts) || contracts < minSize) throw new Error('Quantity is below the instrument minimum');
	return contracts;
}
