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
import {
	generateImage,
	composeShirtMockup,
	ReplicateError,
	ReplicateTimeoutError,
	designPrompt
} from '$lib/replicate';
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
			// 1. Generate the design (clean artwork, isolated on white). This is the
			// canonical PNG for fulfillment — the file we'd upload to Printful.
			const designBytes = await generateImage({
				apiToken: env.REPLICATE_API_TOKEN,
				prompt: designPrompt(prompt)
			});

			// 2. Save the design to R2 first. We need a public URL because the
			// compose step (nano-banana) fetches the image from a URL.
			const designKey = `designs/${dropId}.png`;
			await env.MOCKUPS.put(designKey, designBytes, {
				httpMetadata: {
					contentType: 'image/png',
					cacheControl: 'public, max-age=31536000, immutable'
				}
			});
			const designUrl = `${url.origin}/r2/${designKey}`;

			// 3. Compose mockup: pass the design image to nano-banana, ask it to
			// place that exact image on a flat-lay t-shirt. The mockup contains
			// the exact design that will be printed.
			const mockupBytes = await composeShirtMockup({
				apiToken: env.REPLICATE_API_TOKEN,
				designImageUrl: designUrl
			});

			// 4. Save the mockup to R2.
			const mockupKey = `mockups/${dropId}.png`;
			await env.MOCKUPS.put(mockupKey, mockupBytes, {
				httpMetadata: {
					contentType: 'image/png',
					cacheControl: 'public, max-age=31536000, immutable'
				}
			});
			const mockupUrl = `${url.origin}/r2/${mockupKey}`;

			// 5. D1 INSERT.
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
			await logAttempt(env.DB, { prompt, status: 'storage_error', error: err instanceof Error ? err.message : String(err) });
			return fail(500, { error: 'something broke. try again.' });
		}

		// SvelteKit form actions throw redirects rather than returning them.
		throw redirect(303, `/s/${dropId}`);
	}
};
