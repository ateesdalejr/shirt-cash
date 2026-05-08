#!/usr/bin/env bash
# Delete every `price:*` key from the STRIPE_EVENTS KV namespace.
# Use after changing prices in Stripe to skip the 60s TTL wait.
#
# Usage: ./scripts/bust-price-cache.sh

set -euo pipefail

NS_ID="8b142dfb42da43f99e0cbfb23dad84e4"

KEYS_JSON=$(bunx wrangler kv key list --namespace-id="$NS_ID" --prefix=price:)

if [ "$KEYS_JSON" = "[]" ]; then
	echo "no price:* keys cached — nothing to bust"
	exit 0
fi

# Build the JSON array bulk-delete expects: ["key1", "key2", ...]
TMP=$(mktemp /tmp/bust-keys-XXXXXX.json)
echo "$KEYS_JSON" | jq '[.[].name]' > "$TMP"

echo "--- busting these keys ---"
cat "$TMP"
echo

bunx wrangler kv bulk delete --namespace-id="$NS_ID" "$TMP" --force
rm -f "$TMP"

echo "done"
