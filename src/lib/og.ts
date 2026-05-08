// Open Graph / iMessage preview helpers.
// Plan-design-review Pass 3 finding: og:title is THE conversion driver in iMessage,
// because the unfurl card decides whether anyone taps the link.
// og:title = the prompt itself (truncated to 70 chars), NOT "shirt.cash drop".

const OG_TITLE_MAX = 70;

export function ogTitle(prompt: string): string {
	if (prompt.length <= OG_TITLE_MAX) return prompt;
	return prompt.slice(0, OG_TITLE_MAX - 1) + '…';
}

export function ogDescription(args: { priceUsd: number; dropId: string; createdAt: number; now?: number }): string {
	const daysSince = Math.floor(((args.now ?? Date.now()) - args.createdAt) / (24 * 60 * 60 * 1000));
	const shipsIn = Math.max(0, 5 - daysSince);
	const ships = shipsIn === 0 ? 'ships now' : `ships in ${shipsIn} day${shipsIn === 1 ? '' : 's'}`;
	// Show whole-dollar prices as "$25", non-whole as "$19.99".
	const priceStr = Number.isInteger(args.priceUsd)
		? `$${args.priceUsd}`
		: `$${args.priceUsd.toFixed(2)}`;
	return `${priceStr} · ${args.dropId} · ${ships}`;
}
