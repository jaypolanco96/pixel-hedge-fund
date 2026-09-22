import { json, type Handle } from '@sveltejs/kit';
import { isCrossOriginApiWrite } from '$lib/server/originGuard';

export const handle: Handle = async ({ event, resolve }) => {
	const { request, url } = event;
	if (isCrossOriginApiWrite(request.method, url.pathname, request.headers.get('origin'), url.origin)) {
		return json({ ok: false, error: 'Cross-origin request blocked' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
	}
	return resolve(event);
};
