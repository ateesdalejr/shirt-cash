// Stripe webhook receiver.
//
// Pipeline:
//   POST /api/stripe
//      │
//      ▼
//   verify Stripe signature (HMAC-SHA256 over `${ts}.${body}` using whsec)
//      │  invalid → 400
//      ▼
//   parse event JSON
//      │  not checkout.session.completed → 200 (ack, no-op)
//      ▼
//   STRIPE_EVENTS KV: has event.id?
//      │  yes → 200 (idempotent dedup, 30-day TTL matches Stripe's max retry window)
//      ▼
//   write event.id to KV with 30d TTL
//      │
//      ▼
//   D1: UPDATE drops SET sold_count = sold_count + 1 WHERE id = ? (atomic)
//      │
//      ▼
//   POST formatted Discord embed (mockup PNG inline + REVIEW BEFORE FULFILLING header)
//      │  failure → log to drop_attempts, still return 200 to avoid Stripe retry storm
//      ▼
//   200 OK

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { verifyStripeSignature } from "$lib/stripe";
import { incrementSoldCount, logAttempt } from "$lib/db";
import { formatOrderMessage, sendDiscordWebhook } from "$lib/discord";
import { getPostHogClient } from "$lib/server/posthog";
import type Stripe from "stripe";

const STRIPE_EVENT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days = Stripe max retry window

export const POST: RequestHandler = async ({ request, platform, url }) => {
  if (!platform?.env)
    return json({ ok: false, error: "platform env" }, { status: 500 });
  const env = platform.env;

  const sig = request.headers.get("stripe-signature");
  if (!sig)
    return json({ ok: false, error: "missing signature" }, { status: 400 });

  const rawBody = await request.text();
  const valid = await verifyStripeSignature({
    rawBody,
    signatureHeader: sig,
    secret: env.STRIPE_WEBHOOK_SECRET,
  });
  if (!valid)
    return json({ ok: false, error: "invalid signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = JSON.parse(rawBody) as Stripe.Event;
  } catch {
    return json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  // Only act on completed checkouts. Ack everything else.
  if (event.type !== "checkout.session.completed") {
    return json({ ok: true, ignored: event.type });
  }

  // Idempotency dedup via KV.
  const dedupKey = `evt:${event.id}`;
  const seen = await env.STRIPE_EVENTS.get(dedupKey);
  if (seen) return json({ ok: true, deduped: true });
  await env.STRIPE_EVENTS.put(dedupKey, "1", {
    expirationTtl: STRIPE_EVENT_TTL_SECONDS,
  });

  const session = event.data.object as Stripe.Checkout.Session;
  const dropId = session.metadata?.drop_id;
  if (!dropId) {
    await logAttempt(env.DB, {
      prompt: "(webhook)",
      status: "storage_error",
      error: "missing drop_id metadata",
    });
    return json({ ok: true, missingDropId: true });
  }

  // Atomic SOLD increment (D1 UPDATE ... RETURNING).
  let soldCountTotal = 0;
  try {
    soldCountTotal = await incrementSoldCount(env.DB, dropId);
  } catch (err) {
    await logAttempt(env.DB, {
      prompt: "(webhook)",
      status: "storage_error",
      error: err instanceof Error ? err.message : String(err),
      dropId,
    });
  }

  // Discord notification.
  const customerEmail =
    session.customer_details?.email ?? session.customer_email ?? "unknown";
  const shippingName =
    session.collected_information?.shipping_details?.name ??
    session.customer_details?.name ??
    "unknown";
  const shippingAddress = formatAddress(
    session.collected_information?.shipping_details?.address ??
      session.customer_details?.address ??
      null,
  );
  const priceUsd = (session.amount_total ?? 0) / 100;

  // We need the mockup_url for the Discord embed. Fetch from D1 (same row we just updated).
  const drop = await env.DB.prepare(
    `SELECT prompt, mockup_url FROM drops WHERE id = ?`,
  )
    .bind(dropId)
    .first<{ prompt: string; mockup_url: string }>();

  if (drop) {
    // Design source URL follows the convention `<origin>/r2/designs/<id>.png`
    // (set in the form action). Derived here from the request origin so it
    // works on shirt.cash, shirt-cash.pages.dev, and previews.
    const designUrl = `${url.origin}/r2/designs/${dropId}.png`;
    const payload = formatOrderMessage({
      dropId,
      prompt: drop.prompt,
      mockupUrl: drop.mockup_url,
      designUrl,
      priceUsd,
      customerEmail,
      shippingName,
      shippingAddress,
      stripeSessionUrl: `https://dashboard.stripe.com/payments/${session.payment_intent}`,
      soldCountTotal,
    });
    const result = await sendDiscordWebhook(env.DISCORD_WEBHOOK_URL, payload);
    if (!result.ok) {
      await logAttempt(env.DB, {
        prompt: "(webhook)",
        status: "storage_error",
        error: `discord ${result.status}: ${result.body}`,
        dropId,
      });
    }
  }

  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: "server",
    event: "payment_received",
    properties: {
      drop_id: dropId,
      price_usd: priceUsd,
      sold_count_total: soldCountTotal,
      stripe_session_id: session.id,
    },
  });
  await posthog.flush();

  return json({ ok: true });
};

function formatAddress(addr: Stripe.Address | null): string {
  if (!addr) return "no address";
  const parts = [
    addr.line1,
    addr.line2,
    [addr.city, addr.state, addr.postal_code].filter(Boolean).join(", "),
    addr.country,
  ].filter(Boolean);
  return parts.join("\n");
}
