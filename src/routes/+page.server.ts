// Creator form action.
//
// Flow:
//   prompt
//      │
//      ▼
//   Replicate (FLUX 1.1 Pro, 30s timeout)
//      │
//      ▼
//   Photon composite onto blank tee
//      │
//      ▼
//   R2 PUT mockup with immutable cache headers
//      │
//      ▼
//   D1 INSERT drop row
//      │
//      ▼
//   redirect to /s/[id]

import { fail, redirect } from "@sveltejs/kit";
import { nanoid } from "nanoid";
import type { Actions, PageServerLoad } from "./$types";
import {
  generateImage,
  composeShirtMockup,
  ReplicateError,
  ReplicateTimeoutError,
  designPrompt,
} from "$lib/replicate";
import { insertDrop, logAttempt, getRecentDrops } from "$lib/db";
import { verifyTurnstile } from "$lib/turnstile";
import { checkRateLimit, clientKey } from "$lib/ratelimit";
import { getPostHogClient } from "$lib/server/posthog";

// Expose the public Turnstile site key to the client so the widget can render.
// Empty string means Turnstile isn't configured yet — widget is hidden.
export const load: PageServerLoad = async ({ platform }) => {
  const recentDrops = platform?.env?.DB
    ? await getRecentDrops(platform.env.DB, 10)
    : [];
  return {
    turnstileSiteKey: platform?.env?.TURNSTILE_SITE_KEY ?? "",
    recentDrops,
  };
};

export const actions: Actions = {
  default: async ({ request, platform, url }) => {
    if (!platform?.env) return fail(500, { error: "platform env unavailable" });
    const env = platform.env;

    // Per-IP rate limit (5/min). Cheapest check, runs first so abusers don't
    // even reach Turnstile/Replicate. Uses STRIPE_EVENTS KV with an rl: prefix
    // (different namespace than evt: dedup keys).
    const { allowed } = await checkRateLimit(
      env.STRIPE_EVENTS,
      clientKey(request),
    );
    if (!allowed)
      return fail(429, { error: "too many requests. give it a minute." });

    const data = await request.formData();
    const prompt = (data.get("prompt") ?? "").toString().trim();
    const turnstileToken = (data.get("cf-turnstile-response") ?? "").toString();

    if (!prompt) return fail(400, { error: "prompt is required" });
    if (prompt.length > 500)
      return fail(400, { error: "prompt too long (max 500 chars)" });

    // Turnstile check: skipped if not configured. Once both site + secret keys
    // are set, every submission must include a valid token.
    if (env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY) {
      const ok = await verifyTurnstile({
        secret: env.TURNSTILE_SECRET_KEY,
        token: turnstileToken,
        remoteIp: request.headers.get("cf-connecting-ip") ?? undefined,
      });
      if (!ok)
        return fail(403, {
          error: "human check failed. try refreshing the page.",
        });
    }

    const dropId = nanoid(10);

    try {
      // 1. Generate the design (clean artwork, isolated on white). This is the
      // canonical PNG for fulfillment — the file we'd upload to Printful.
      const designBytes = await generateImage({
        apiToken: env.REPLICATE_API_TOKEN,
        prompt: designPrompt(prompt),
      });

      // 2. Save the design to R2 first. We need a public URL because the
      // compose step (nano-banana) fetches the image from a URL.
      const designKey = `designs/${dropId}.png`;
      await env.MOCKUPS.put(designKey, designBytes, {
        httpMetadata: {
          contentType: "image/png",
          cacheControl: "public, max-age=31536000, immutable",
        },
      });
      const designUrl = `${url.origin}/r2/${designKey}`;

      // 3. Compose mockup: pass the design image to nano-banana, ask it to
      // place that exact image on a flat-lay t-shirt. The mockup contains
      // the exact design that will be printed.
      const mockupBytes = await composeShirtMockup({
        apiToken: env.REPLICATE_API_TOKEN,
        designImageUrl: designUrl,
      });

      // 4. Save the mockup to R2.
      const mockupKey = `mockups/${dropId}.png`;
      await env.MOCKUPS.put(mockupKey, mockupBytes, {
        httpMetadata: {
          contentType: "image/png",
          cacheControl: "public, max-age=31536000, immutable",
        },
      });
      const mockupUrl = `${url.origin}/r2/${mockupKey}`;

      // 5. D1 INSERT.
      await insertDrop(env.DB, {
        id: dropId,
        prompt,
        mockup_url: mockupUrl,
        stripe_price_id: env.STRIPE_PRICE_ID,
        created_at: Date.now(),
        sold_count: 0,
        view_count: 0,
      });

      await logAttempt(env.DB, { prompt, status: "ok", dropId });

      const posthog = getPostHogClient();
      posthog.capture({
        distinctId: "server",
        event: "shirt_created",
        properties: { drop_id: dropId, prompt_length: prompt.length },
      });
      await posthog.flush();
    } catch (err) {
      const posthog = getPostHogClient();
      if (err instanceof ReplicateTimeoutError) {
        await logAttempt(env.DB, {
          prompt,
          status: "replicate_timeout",
          error: err.message,
        });
        posthog.capture({
          distinctId: "server",
          event: "shirt_creation_failed",
          properties: {
            reason: "replicate_timeout",
            error: err.message,
            prompt_length: prompt.length,
          },
        });
        await posthog.flush();
        return fail(504, { error: "image gen timed out (>30s)" });
      }
      if (err instanceof ReplicateError) {
        await logAttempt(env.DB, {
          prompt,
          status: "replicate_error",
          error: err.message,
        });
        posthog.capture({
          distinctId: "server",
          event: "shirt_creation_failed",
          properties: {
            reason: "replicate_error",
            error: err.message,
            prompt_length: prompt.length,
          },
        });
        await posthog.flush();
        return fail(502, { error: `image gen failed: ${err.message}` });
      }
      const errorMsg = err instanceof Error ? err.message : String(err);
      await logAttempt(env.DB, {
        prompt,
        status: "storage_error",
        error: errorMsg,
      });
      posthog.capture({
        distinctId: "server",
        event: "shirt_creation_failed",
        properties: {
          reason: "storage_error",
          error: errorMsg,
          prompt_length: prompt.length,
        },
      });
      await posthog.flush();
      return fail(500, { error: "something broke. try again." });
    }

    // SvelteKit form actions throw redirects rather than returning them.
    throw redirect(303, `/s/${dropId}`);
  },
};
