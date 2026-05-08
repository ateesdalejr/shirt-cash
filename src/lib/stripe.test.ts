import { describe, it, expect } from 'vitest';
import { verifyStripeSignature } from './stripe';

const SECRET = 'whsec_test_only';

async function sign(timestamp: string, body: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`));
	const bytes = new Uint8Array(sig);
	let hex = '';
	for (const b of bytes) hex += b.toString(16).padStart(2, '0');
	return hex;
}

describe('verifyStripeSignature', () => {
	const body = '{"id":"evt_123","type":"checkout.session.completed"}';

	it('accepts a valid signature within the tolerance window', async () => {
		const now = 1_700_000_000;
		const ts = `${now}`;
		const v1 = await sign(ts, body, SECRET);
		const ok = await verifyStripeSignature({
			rawBody: body,
			signatureHeader: `t=${ts},v1=${v1}`,
			secret: SECRET,
			now
		});
		expect(ok).toBe(true);
	});

	it('rejects when the signature is computed with the wrong secret', async () => {
		const now = 1_700_000_000;
		const ts = `${now}`;
		const v1 = await sign(ts, body, 'wrong_secret');
		const ok = await verifyStripeSignature({
			rawBody: body,
			signatureHeader: `t=${ts},v1=${v1}`,
			secret: SECRET,
			now
		});
		expect(ok).toBe(false);
	});

	it('rejects when the timestamp is older than the tolerance window', async () => {
		const now = 1_700_000_000;
		const oldTs = `${now - 10 * 60}`; // 10 min old, default tolerance is 5 min
		const v1 = await sign(oldTs, body, SECRET);
		const ok = await verifyStripeSignature({
			rawBody: body,
			signatureHeader: `t=${oldTs},v1=${v1}`,
			secret: SECRET,
			now
		});
		expect(ok).toBe(false);
	});

	it('rejects when the body is tampered with after signing', async () => {
		const now = 1_700_000_000;
		const ts = `${now}`;
		const v1 = await sign(ts, body, SECRET);
		const ok = await verifyStripeSignature({
			rawBody: body + 'extra',
			signatureHeader: `t=${ts},v1=${v1}`,
			secret: SECRET,
			now
		});
		expect(ok).toBe(false);
	});

	it('rejects when the signature header is malformed', async () => {
		const ok = await verifyStripeSignature({
			rawBody: body,
			signatureHeader: 'garbage',
			secret: SECRET
		});
		expect(ok).toBe(false);
	});

	it('accepts when one of multiple v1 sigs matches (Stripe rotation)', async () => {
		const now = 1_700_000_000;
		const ts = `${now}`;
		const validSig = await sign(ts, body, SECRET);
		const ok = await verifyStripeSignature({
			rawBody: body,
			signatureHeader: `t=${ts},v1=deadbeef,v1=${validSig}`,
			secret: SECRET,
			now
		});
		expect(ok).toBe(true);
	});
});
