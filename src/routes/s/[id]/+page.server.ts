import { error, fail, redirect, isRedirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getDrop, incrementViewCount } from '$lib/db';
import { stripeClient, createCheckoutSession } from '$lib/stripe';
import { ogTitle, ogDescription } from '$lib/og';

const PRICE_USD = 25;

export const load: PageServerLoad = async ({ params, platform, url }) => {
	if (!platform?.env) throw error(500, 'platform env unavailable');
	const env = platform.env;

	const drop = await getDrop(env.DB, params.id);
	if (!drop) throw error(404, 'this drop didn’t make it.');

	// Increment VIEWED on every load EXCEPT post-purchase return (?ok=1).
	// Post-purchase shouldn't double-count.
	const justBought = url.searchParams.get('ok') === '1';
	const viewCount = justBought ? drop.view_count : await incrementViewCount(env.DB, drop.id);

	const daysSince = Math.floor((Date.now() - drop.created_at) / (24 * 60 * 60 * 1000));
	const shipsIn = Math.max(0, 5 - daysSince);

	return {
		drop: { ...drop, view_count: viewCount },
		justBought,
		priceUsd: PRICE_USD,
		shipsIn,
		og: {
			title: ogTitle(drop.prompt),
			description: ogDescription({
				priceUsd: PRICE_USD,
				dropId: drop.id,
				createdAt: drop.created_at
			}),
			image: drop.mockup_url
		}
	};
};

export const actions: Actions = {
	checkout: async ({ params, platform, url }) => {
		if (!platform?.env) return fail(500, { error: 'platform env unavailable' });
		const env = platform.env;

		const drop = await getDrop(env.DB, params.id);
		if (!drop) return fail(404, { error: 'drop not found' });
		if (!env.STRIPE_SECRET_KEY) return fail(500, { error: 'STRIPE_SECRET_KEY missing' });

		try {
			const stripe = stripeClient(env.STRIPE_SECRET_KEY);
			const session = await createCheckoutSession({
				stripe,
				priceId: drop.stripe_price_id,
				dropId: drop.id,
				successUrl: `${url.origin}/s/${drop.id}?ok=1`,
				cancelUrl: `${url.origin}/s/${drop.id}`
			});
			if (!session.url) return fail(500, { error: 'stripe returned no checkout URL' });
			throw redirect(303, session.url);
		} catch (err) {
			if (isRedirect(err)) throw err;
			const message = err instanceof Error ? err.message : String(err);
			return fail(500, { error: `stripe checkout failed: ${message}` });
		}
	}
};
