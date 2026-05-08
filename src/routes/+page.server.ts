// Creator form action.
//
// Flow:
//   prompt
//      │
//      ▼
//   Replicate (FLUX Schnell, 20s timeout)
//      │
//      ▼
//   Photon composite onto blank tee
//      │
//      ▼
//   R2 PUT mockup with immutable cache headers
//      │
//      ▼
//   D1 INSERT drop row
//      │
//      ▼
//   redirect to /s/[id]

import { fail, redirect } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import type { Actions } from './$types';
import { generateImage, ReplicateError, ReplicateTimeoutError } from '$lib/replicate';
import { compositeMockup } from '$lib/photon';
import { insertDrop, logAttempt } from '$lib/db';

export const actions: Actions = {
	default: async ({ request, platform, url }) => {
		if (!platform?.env) return fail(500, { error: 'platform env unavailable' });
		const env = platform.env;

		const data = await request.formData();
		const prompt = (data.get('prompt') ?? '').toString().trim();

		if (!prompt) return fail(400, { error: 'prompt is required' });
		if (prompt.length > 500) return fail(400, { error: 'prompt too long (max 500 chars)' });

		const dropId = nanoid(10);

		try {
			// 1. Replicate FLUX Schnell -> PNG bytes
			const designBytes = await generateImage({ apiToken: env.REPLICATE_API_TOKEN, prompt });

			// 2. Photon composite onto blank tee
			const mockupBytes = await compositeMockup({ designBytes, origin: url.origin });

			// 3. R2 PUT (content-addressed key, immutable cache)
			const r2Key = `mockups/${dropId}.png`;
			await env.MOCKUPS.put(r2Key, mockupBytes, {
				httpMetadata: {
					contentType: 'image/png',
					cacheControl: 'public, max-age=31536000, immutable'
				}
			});
			const mockupUrl = `${env.PUBLIC_SITE_URL}/r2/${r2Key}`;

			// 4. D1 INSERT
			await insertDrop(env.DB, {
				id: dropId,
				prompt,
				mockup_url: mockupUrl,
				stripe_price_id: env.STRIPE_PRICE_ID,
				created_at: Date.now(),
				sold_count: 0,
				view_count: 0
			});

			await logAttempt(env.DB, { prompt, status: 'ok', dropId });
		} catch (err) {
			if (err instanceof ReplicateTimeoutError) {
				await logAttempt(env.DB, { prompt, status: 'replicate_timeout', error: err.message });
				return fail(504, { error: 'image gen timed out (>20s)' });
			}
			if (err instanceof ReplicateError) {
				await logAttempt(env.DB, { prompt, status: 'replicate_error', error: err.message });
				return fail(502, { error: `image gen failed: ${err.message}` });
			}
			await logAttempt(env.DB, { prompt, status: 'photon_error', error: err instanceof Error ? err.message : String(err) });
			return fail(500, { error: 'something broke. try again.' });
		}

		// SvelteKit form actions throw redirects rather than returning them.
		throw redirect(303, `/s/${dropId}`);
	}
};
