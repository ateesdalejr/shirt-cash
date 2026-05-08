// R2 proxy route — streams objects from the MOCKUPS bucket through the Worker.
// In production you can replace this with a public R2.dev custom domain or
// `mockups.shirt.cash` and skip the proxy. Keeping it here means iMessage's
// link unfurler can fetch the og:image without separate R2 config.

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, platform }) => {
	if (!platform?.env) throw error(500, 'platform env unavailable');
	const obj = await platform.env.MOCKUPS.get(params.path);
	if (!obj) throw error(404, 'not found');

	const headers = new Headers();
	obj.writeHttpMetadata(headers);
	headers.set('etag', obj.httpEtag);
	headers.set('Cache-Control', 'public, max-age=31536000, immutable');

	return new Response(obj.body, { headers });
};
