const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** True for a state-changing /api/ request that did not come from this site's own origin.
 * SvelteKit's built-in CSRF check ignores body-less and text/plain cross-site POSTs, and
 * these routes fall back to server-side exchange keys, so a hostile page could otherwise
 * drive them from the user's browser. */
export function isCrossOriginApiWrite(method: string, pathname: string, origin: string | null, siteOrigin: string): boolean {
	if (!pathname.startsWith('/api/') || SAFE_METHODS.has(method.toUpperCase())) return false;
	return origin !== siteOrigin;
}
