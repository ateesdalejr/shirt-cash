import { error, fail, redirect, isRedirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getDrop, incrementViewCount } from '$lib/db';
import { stripeClient, createCheckoutSession, getStripePrice } from '$lib/stripe';
import { ogTitle, ogDescription } from '$lib/og';

export const load: PageServerLoad = async ({ params, platform, url }) => {
	if (!platform?.env) throw error(500, 'platform env unavailable');
	const env = platform.env;

	const drop = await getDrop(env.DB, params.id);
	if (!drop) throw error(404, 'this drop didn’t make it.');

	// Pull the actual price from Stripe (cached in KV for 5 min). Lets you change
	// the price in the Stripe dashboard and have it reflect on the buyer page.
	// If the lookup fails (e.g. drop was created in test mode but we're now on
	// live keys, or Stripe is down), fall back to the current STRIPE_PRICE_ID
	// from env so the page still renders.
	const stripe = stripeClient(env.STRIPE_SECRET_KEY);
	let price;
	try {
		price = await getStripePrice(stripe, env.STRIPE_EVENTS, drop.stripe_price_id);
	} catch {
		try {
			price = await getStripePrice(stripe, env.STRIPE_EVENTS, env.STRIPE_PRICE_ID);
		} catch {
			price = { amountCents: 2500, currency: 'usd', whole: 25, cents: 0 };
		}
	}
	const priceUsd = price.amountCents / 100;

	// Increment VIEWED on every load EXCEPT post-purchase return (?ok=1).
	// Post-purchase shouldn't double-count.
	const justBought = url.searchParams.get('ok') === '1';
	const viewCount = justBought ? drop.view_count : await incrementViewCount(env.DB, drop.id);

	const daysSince = Math.floor((Date.now() - drop.created_at) / (24 * 60 * 60 * 1000));
	const shipsIn = Math.max(0, 5 - daysSince);

	return {
		drop: { ...drop, view_count: viewCount },
		justBought,
		priceUsd,
		priceWhole: price.whole,
		priceCents: price.cents,
		shipsIn,
		og: {
			title: ogTitle(drop.prompt),
			description: ogDescription({
				priceUsd,
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
			// If the drop's stored price_id doesn't exist under the current Stripe
			// account/mode (e.g. test-mode drop being purchased after live cutover),
			// fall back to the env-configured live price. The drop is still tied to
			// the original prompt + mockup; only the price reference moves.
			let priceId = drop.stripe_price_id;
			try {
				await stripe.prices.retrieve(priceId);
			} catch {
				priceId = env.STRIPE_PRICE_ID;
			}
			const session = await createCheckoutSession({
				stripe,
				priceId,
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
