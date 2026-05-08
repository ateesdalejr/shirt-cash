// Per-IP rate limit using KV. Cloudflare's Workers Rate Limit binding is
// Workers-only (Pages config rejects [[unsafe.bindings]]), so we roll our own
// against the existing STRIPE_EVENTS KV namespace under an `rl:` prefix.
//
// KV writes are eventually consistent (~10s), so a burst can slip through
// the limit. For 5/min that's fine — the pricing protection is preserved
// over a window, just not bullet-tight at the edge of a burst.

const RL_LIMIT = 5;
const RL_WINDOW_SECONDS = 60;

export async function checkRateLimit(
	kv: KVNamespace,
	key: string
): Promise<{ allowed: boolean; remaining: number }> {
	const k = `rl:${key}`;
	const cur = await kv.get(k);
	const count = cur ? parseInt(cur, 10) : 0;
	if (count >= RL_LIMIT) return { allowed: false, remaining: 0 };
	// Use the original count's TTL window — KV doesn't let us extend on update,
	// so first put creates the window, subsequent puts overwrite the count.
	// This is approximate; close enough for 5/min.
	await kv.put(k, String(count + 1), { expirationTtl: RL_WINDOW_SECONDS });
	return { allowed: true, remaining: RL_LIMIT - count - 1 };
}

/**
 * Extract a stable per-client key. CF-Connecting-IP is Cloudflare's
 * authoritative client-IP header (set by the edge, immune to client spoofing).
 * Falls back to a generic key if missing.
 */
export function clientKey(request: Request): string {
	return request.headers.get('cf-connecting-ip') ?? 'unknown';
}
