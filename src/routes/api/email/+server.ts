// Email capture endpoint — used by the exit-intent prompt on /s/[id].
// Stores to D1.subscribers and fires a Discord notification on first signup.
// Per-IP rate limited so a bored user can't spam the list with fake emails.

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { insertSubscriber } from "$lib/db";
import {
  formatSubscriberMessage,
  sendDiscordWebhook,
} from "$lib/discord";
import { checkRateLimit, clientKey } from "$lib/ratelimit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: RequestHandler = async ({ request, platform }) => {
  if (!platform?.env) throw error(500, "platform env unavailable");
  const env = platform.env;

  const { allowed } = await checkRateLimit(
    env.STRIPE_EVENTS,
    clientKey(request),
  );
  if (!allowed) throw error(429, "too many requests");

  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    dropId?: unknown;
  } | null;
  if (!body || typeof body.email !== "string")
    throw error(400, "email required");

  const email = body.email.trim().toLowerCase();
  if (email.length > 254) throw error(400, "email too long");
  if (!EMAIL_RE.test(email)) throw error(400, "invalid email");

  const dropId =
    typeof body.dropId === "string" && body.dropId.length <= 32
      ? body.dropId
      : null;
  const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? null;

  const { inserted } = await insertSubscriber(env.DB, {
    email,
    dropId,
    userAgent,
  });

  if (inserted && env.DISCORD_WEBHOOK_URL) {
    // Don't block the response on Discord — fire and await but ignore failures.
    await sendDiscordWebhook(
      env.DISCORD_WEBHOOK_URL,
      formatSubscriberMessage({ email, dropId }),
    ).catch(() => undefined);
  }

  return json({ ok: true, alreadySubscribed: !inserted });
};
