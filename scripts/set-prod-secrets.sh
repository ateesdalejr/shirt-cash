#!/usr/bin/env bash
# One-shot helper: set all production secrets on the Pages project.
# Run AFTER the Pages project exists (i.e. you've connected the GitHub repo in
# the Cloudflare dashboard).
#
# Usage:
#   1. Fill in the values below or export them as env vars before running.
#   2. ./scripts/set-prod-secrets.sh
#
# Each secret is piped via stdin so wrangler doesn't prompt interactively.

set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-shirt-cash}"

# ─── values ───────────────────────────────────────────────────────────
# Either fill these in here OR export them as env vars before running.
: "${REPLICATE_API_TOKEN:=}"           # r8_...
: "${STRIPE_SECRET_KEY:=}"             # sk_test_... or sk_live_...
: "${STRIPE_WEBHOOK_SECRET:=}"         # whsec_... (from Stripe webhook config)
: "${STRIPE_PRICE_ID:=price_1TUioX1YwgP10mWxxHtW5aVG}"
: "${DISCORD_WEBHOOK_URL:=}"           # https://discord.com/api/webhooks/...
# ──────────────────────────────────────────────────────────────────────

set_secret() {
	local name="$1"
	local value="$2"
	if [ -z "$value" ]; then
		echo "  SKIP  $name (no value provided)"
		return
	fi
	printf '%s' "$value" | bunx wrangler pages secret put "$name" --project-name="$PROJECT_NAME" >/dev/null 2>&1 \
		&& echo "  OK    $name" \
		|| echo "  FAIL  $name"
}

echo "Setting Pages secrets on project: $PROJECT_NAME"
set_secret REPLICATE_API_TOKEN     "$REPLICATE_API_TOKEN"
set_secret STRIPE_SECRET_KEY       "$STRIPE_SECRET_KEY"
set_secret STRIPE_WEBHOOK_SECRET   "$STRIPE_WEBHOOK_SECRET"
set_secret STRIPE_PRICE_ID         "$STRIPE_PRICE_ID"
set_secret DISCORD_WEBHOOK_URL     "$DISCORD_WEBHOOK_URL"
echo "Done."
