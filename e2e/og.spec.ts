import { test, expect } from '@playwright/test';

// Pre-seed: a drop with id 'test_drop_seed' must exist in local D1.

test.describe('Open Graph / iMessage preview', () => {
	test('og:title is the prompt (not "shirt.cash drop")', async ({ page }) => {
		await page.goto('/s/test_drop_seed');
		const title = await page.locator('meta[property="og:title"]').getAttribute('content');
		expect(title).toBeTruthy();
		expect(title).not.toMatch(/^shirt\.cash drop$/i);
		expect((title ?? '').length).toBeLessThanOrEqual(70);
	});

	test('og:description has the canonical $25 · drop_id · ships in N day(s) shape', async ({ page }) => {
		await page.goto('/s/test_drop_seed');
		const desc = await page.locator('meta[property="og:description"]').getAttribute('content');
		expect(desc).toMatch(/^\$25 · test_drop_seed · ships (in \d+ days?|now)$/);
	});

	test('og:image is the R2 mockup URL', async ({ page }) => {
		await page.goto('/s/test_drop_seed');
		const img = await page.locator('meta[property="og:image"]').getAttribute('content');
		expect(img).toMatch(/\/r2\/mockups\/test_drop_seed\.png$/);
	});

	test('twitter:card is summary_large_image', async ({ page }) => {
		await page.goto('/s/test_drop_seed');
		const card = await page.locator('meta[name="twitter:card"]').getAttribute('content');
		expect(card).toBe('summary_large_image');
	});

	test('og:site_name is shirt.cash', async ({ page }) => {
		await page.goto('/s/test_drop_seed');
		const site = await page.locator('meta[property="og:site_name"]').getAttribute('content');
		expect(site).toBe('shirt.cash');
	});
});
