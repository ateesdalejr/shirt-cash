import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './e2e',
	fullyParallel: false, // Cloudflare Pages dev is single-process; keep tests serial.
	timeout: 30_000,
	use: {
		baseURL: 'http://127.0.0.1:8788',
		trace: 'retain-on-failure'
	},
	webServer: {
		// Run via wrangler pages dev so D1, KV, R2 bindings are available locally.
		// Assumes you've run: wrangler d1 migrations apply shirt_cash_db --local
		command: 'bun run build && wrangler pages dev .svelte-kit/cloudflare --port 8788',
		port: 8788,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	},
	projects: [
		{ name: 'mobile-safari', use: devices['iPhone 14'] },
		{ name: 'desktop', use: devices['Desktop Chrome'] }
	]
});
