import { describe, it, expect } from 'vitest';
import { formatOrderMessage } from './discord';

const baseArgs = {
	dropId: 'drop_xkj8mn2',
	prompt: 'a sad raccoon eating a hot pocket at 3am',
	mockupUrl: 'https://shirt.cash/r2/mockups/drop_xkj8mn2.png',
	designUrl: 'https://shirt.cash/r2/designs/drop_xkj8mn2.png',
	priceUsd: 25,
	customerEmail: 'buyer@example.com',
	shippingName: 'Jane Doe',
	shippingAddress: '123 Main St\nSan Francisco, CA, 94110\nUS',
	stripeSessionUrl: 'https://dashboard.stripe.com/payments/pi_123',
	soldCountTotal: 7
};

describe('formatOrderMessage', () => {
	it('produces the REVIEW BEFORE FULFILLING header in content', () => {
		const out = formatOrderMessage(baseArgs);
		expect(out.content).toContain('REVIEW BEFORE FULFILLING');
		expect(out.content).toContain('drop_xkj8mn2');
	});

	it('embeds the mockup PNG inline so you can eyeball it', () => {
		const out = formatOrderMessage(baseArgs);
		expect(out.embeds[0].image).toEqual({ url: baseArgs.mockupUrl });
	});

	it('includes a second embed with the design source for Printful', () => {
		const out = formatOrderMessage(baseArgs);
		expect(out.embeds).toHaveLength(2);
		expect(out.embeds[1].image).toEqual({ url: baseArgs.designUrl });
	});

	it('includes price, sold count, email, shipping address, and design source as fields', () => {
		const out = formatOrderMessage(baseArgs);
		const fields = (out.embeds[0].fields as Array<{ name: string; value: string }>).map((f) => f.name);
		expect(fields).toContain('Price');
		expect(fields).toContain('Sold (total)');
		expect(fields).toContain('Email');
		expect(fields).toContain('Ship to');
		expect(fields).toContain('Design source');
	});

	it('renders the prompt as a quoted description', () => {
		const out = formatOrderMessage(baseArgs);
		expect(out.embeds[0].description).toBe(`> ${baseArgs.prompt}`);
	});

	it('truncates very long prompts in the description', () => {
		const longPrompt = 'x'.repeat(400);
		const out = formatOrderMessage({ ...baseArgs, prompt: longPrompt });
		const desc = out.embeds[0].description as string;
		expect(desc.length).toBeLessThan(longPrompt.length);
		expect(desc.endsWith('…')).toBe(true);
	});

	it('uses neon green (0x00ff88) as the embed color for brand consistency', () => {
		const out = formatOrderMessage(baseArgs);
		expect(out.embeds[0].color).toBe(0x00ff88);
	});
});
