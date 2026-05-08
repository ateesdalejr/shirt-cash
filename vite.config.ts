import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	ssr: {
		// @cf-wasm/photon ships a .wasm import that only resolves under the Workers
		// runtime. Don't try to bundle it during Node-time SSR build; the Cloudflare
		// adapter wires it up at runtime.
		external: ['@cf-wasm/photon']
	},
	optimizeDeps: {
		exclude: ['@cf-wasm/photon']
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		exclude: ['e2e/**'],
		environment: 'node'
	}
} as Parameters<typeof defineConfig>[0] & { test: Record<string, unknown> });
