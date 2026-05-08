# [shirt.cash](https://shirt.cash)

A way for you to turn your t-shirt ideas into cash.

Type a prompt in your group chat. Get a shoppable shirt link in 30 seconds. Drop the
link back in the chat. Done.

## Stack

- **SvelteKit** with `@sveltejs/adapter-cloudflare`
- **Cloudflare Pages** (Workers Paid Unbound — required for Photon CPU budget)
- **Cloudflare D1** for design metadata + atomic counters
- **Cloudflare KV** for Stripe webhook idempotency
- **Cloudflare R2** for mockup PNGs
- **Replicate** (FLUX Schnell) for image generation
- **`@cf-wasm/photon`** for in-Worker mockup composition
- **Stripe Checkout** with Apple Pay / Google Pay
- **Discord webhook** as the manual fulfillment review channel

## One-time setup

```bash
bun install
```

Create the Cloudflare resources and copy the IDs into `wrangler.toml`:

```bash
# D1
wrangler d1 create shirt_cash_db
# → copy database_id into [[d1_databases]] in wrangler.toml

# KV (Stripe event idempotency)
wrangler kv:namespace create STRIPE_EVENTS
# → copy id into [[kv_namespaces]] in wrangler.toml

# R2
wrangler r2 bucket create shirt-cash-mockups
```

Apply the migration:

```bash
bun run db:migrate:local      # for local dev
bun run db:migrate:remote     # against Cloudflare
```

Set secrets:

```bash
wrangler secret put REPLICATE_API_TOKEN
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put STRIPE_PRICE_ID
wrangler secret put DISCORD_WEBHOOK_URL
```

For local dev, copy `.env.example` to `.dev.vars` and fill in the same keys.

Drop a real blank-tee mockup at `static/shirt-template.png` (the placeholder is pure white).

## Run locally

```bash
bun dev
```

## Test

```bash
bun test                 # unit tests (Vitest)
bun run test:e2e         # E2E (Playwright via wrangler pages dev)
```

For the Stripe webhook smoke test:

```bash
stripe listen --forward-to localhost:5173/api/stripe
stripe trigger checkout.session.completed
```

## Ship

Push to `master`. Cloudflare Pages auto-deploys on every push (configured via the dashboard).

```bash
git push origin master
```

## Architecture

```
                    CREATOR  (~3-5s typical)
  prompt → Replicate FLUX Schnell → Photon composite → R2 → D1 → /s/[id]

                    BUYER  (~1-2s typical)
  iMessage tap → /s/[id] (D1 + view++) → Stripe Checkout → /s/[id]?ok=1

                    FULFILLMENT
  Stripe webhook → verify sig → KV idempotency → D1 sold++ → Discord
```

## Project files

```
migrations/0001_initial.sql       drops table + drop_attempts log
src/lib/replicate.ts              FLUX Schnell wrapper, 20s AbortController
src/lib/photon.ts                 WASM composite, module-scope init
src/lib/db.ts                     D1 wrappers + atomic RETURNING increments
src/lib/discord.ts                Order embed formatter
src/lib/stripe.ts                 Web Crypto signature verify + checkout session
src/lib/og.ts                     og:title (truncate 70) + og:description shape
src/routes/+page.svelte           creator (intentionally minimal — premise 3 v2)
src/routes/+page.server.ts        form action: prompt → drop_id
src/routes/s/[id]/+page.svelte    buyer page (Variant B aesthetic)
src/routes/s/[id]/+page.server.ts D1 read + Stripe checkout action
src/routes/api/stripe/+server.ts  webhook receiver + Discord notification
src/routes/r2/[...path]/+server.ts  R2 streaming proxy
src/routes/+error.svelte          404 + generic error page
```

Design and engineering reviews live under `~/.gstack/projects/ateesdalejr-shirt-cash/`.
