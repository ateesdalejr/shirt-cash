// Stripe Checkout session creation + webhook signature verification.
// Signature verification uses the Web Crypto API (works in Workers; the official
// `stripe` Node SDK's constructEvent depends on Node crypto and is awkward on edge).

import Stripe from 'stripe';

export function stripeClient(secretKey: string): Stripe {
	return new Stripe(secretKey, {
		apiVersion: '2025-02-24.acacia',
		// Use fetch so it works on Workers
		httpClient: Stripe.createFetchHttpClient()
	});
}

export type CreateCheckoutInput = {
	stripe: Stripe;
	priceId: string;
	dropId: string;
	successUrl: string;
	cancelUrl: string;
};

export async function createCheckoutSession({
	stripe,
	priceId,
	dropId,
	successUrl,
	cancelUrl
}: CreateCheckoutInput): Promise<Stripe.Checkout.Session> {
	return await stripe.checkout.sessions.create({
		mode: 'payment',
		line_items: [{ price: priceId, quantity: 1 }],
		success_url: successUrl,
		cancel_url: cancelUrl,
		shipping_address_collection: { allowed_countries: ['US', 'CA', 'GB'] },
		automatic_tax: { enabled: false },
		metadata: { drop_id: dropId }
	});
}

/**
 * Verify a Stripe webhook signature using Web Crypto.
 * Stripe signs with HMAC-SHA256 over `${timestamp}.${payload}` using whsec.
 * Header format: t=<unix>,v1=<hex>,v1=<hex>,...
 *
 * Tolerance window: 5 minutes (Stripe default).
 */
export async function verifyStripeSignature(args: {
	rawBody: string;
	signatureHeader: string;
	secret: string;
	tolerance?: number;
	now?: number;
}): Promise<boolean> {
	const tolerance = args.tolerance ?? 5 * 60;
	const now = args.now ?? Math.floor(Date.now() / 1000);

	const parts = args.signatureHeader.split(',').map((kv) => kv.split('='));
	const timestamp = parts.find(([k]) => k === 't')?.[1];
	const v1Sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
	if (!timestamp || v1Sigs.length === 0) return false;

	const ts = parseInt(timestamp, 10);
	if (!Number.isFinite(ts)) return false;
	if (Math.abs(now - ts) > tolerance) return false;

	const signedPayload = `${timestamp}.${args.rawBody}`;
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(args.secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
	const expectedHex = bufferToHex(sigBytes);

	return v1Sigs.some((sig) => timingSafeEqualHex(sig, expectedHex));
}

function bufferToHex(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	let out = '';
	for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
	return out;
}

// Constant-time string comparison for hex sigs.
function timingSafeEqualHex(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}
