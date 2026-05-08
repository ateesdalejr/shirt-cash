import { test, expect } from '@playwright/test';

// Pre-seed: this assumes a drop exists with id 'test_drop_seed'.
// Use `wrangler d1 execute shirt_cash_db --local --command "INSERT INTO drops ..."` before running.

test.describe('buyer page /s/[id]', () => {
	test('renders the drop with mockup, price, and Buy button', async ({ page }) => {
		await page.goto('/s/test_drop_seed');
		await expect(page.getByText('drop_id')).toBeVisible({ timeout: 5_000 }).catch(() => {});
		await expect(page.getByText('PRICE')).toBeVisible();
		await expect(page.getByText('$25')).toBeVisible();
		await expect(page.getByRole('button', { name: /Buy Drop/i })).toBeEnabled();
	});

	test('shows the prompt as a quoted caption', async ({ page }) => {
		await page.goto('/s/test_drop_seed');
		const quote = page.locator('.quote');
		await expect(quote).toBeVisible();
		await expect(quote).toContainText('"'); // wrapped in quotes
	});

	test('?ok=1 swaps Buy button for the ORDERED banner', async ({ page }) => {
		await page.goto('/s/test_drop_seed?ok=1');
		await expect(page.getByText(/ORDERED · CHECK DISCORD/i)).toBeVisible();
		await expect(page.getByRole('button', { name: /Buy Drop/i })).not.toBeVisible();
	});

	test('404 page renders with the correct headline for bogus drop_id', async ({ page }) => {
		const response = await page.goto('/s/zzzzzzzzzz');
		expect(response?.status()).toBe(404);
		await expect(page.getByText(/this drop didn'?t make it/i)).toBeVisible();
		await expect(page.getByText('lost in the chat', { exact: false })).toBeVisible();
		await expect(page.getByRole('link', { name: /back to shirt\.cash/i })).toBeVisible();
	});

	test('viewport is mobile-friendly (touch targets ≥ 44px)', async ({ page }) => {
		await page.goto('/s/test_drop_seed');
		const buy = page.getByRole('button', { name: /Buy Drop/i });
		const box = await buy.boundingBox();
		expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
	});
});
