import { test, expect } from '@playwright/test';

// E2E creator flow. Note: this hits the live Replicate API; either skip in CI or
// configure a mock using msw or a `MOCK_REPLICATE=1` env path in +page.server.ts.

test.describe('creator flow /', () => {
	test('renders the prompt textarea + submit button', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('textbox', { name: /describe the shirt/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /make the shirt/i })).toBeEnabled();
	});

	test.skip('submitting a prompt redirects to /s/[id] (skip in CI: hits Replicate)', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('textbox', { name: /describe the shirt/i }).fill('a sad raccoon');
		await page.getByRole('button', { name: /make the shirt/i }).click();
		await page.waitForURL(/\/s\/[a-zA-Z0-9_-]{10}$/, { timeout: 30_000 });
		await expect(page.getByRole('button', { name: /Buy Drop/i })).toBeVisible();
	});

	test('rejects empty prompt', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: /make the shirt/i }).click();
		// Browser-level required validation OR our 400 fail
		await expect(page).toHaveURL('/');
	});
});
