// SvelteKit + Cloudflare bindings.
// Reference: https://kit.svelte.dev/docs/types#app

declare global {
	namespace App {
		interface Platform {
			env: {
				DB: D1Database;
				STRIPE_EVENTS: KVNamespace;
				MOCKUPS: R2Bucket;
				REPLICATE_API_TOKEN: string;
				STRIPE_SECRET_KEY: string;
				STRIPE_WEBHOOK_SECRET: string;
				STRIPE_PRICE_ID: string;
				DISCORD_WEBHOOK_URL: string;
				PUBLIC_SITE_URL: string;
				// Turnstile — both optional. If either is missing, verification is skipped.
				TURNSTILE_SITE_KEY?: string;
				TURNSTILE_SECRET_KEY?: string;
			};
			cf: CfProperties;
			ctx: ExecutionContext;
		}
	}
}

export {};
