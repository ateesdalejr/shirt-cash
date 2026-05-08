// Discord webhook formatter — Stripe order details land in your Discord channel
// for manual review before fulfillment. The message header reads
// "REVIEW BEFORE FULFILLING" and embeds the mockup PNG inline so you can eyeball
// each one before pasting into Printful (per design review issue 1B + 7-1).

export type DiscordOrderArgs = {
	dropId: string;
	prompt: string;
	mockupUrl: string;
	designUrl: string;
	priceUsd: number;
	customerEmail: string;
	shippingName: string;
	shippingAddress: string;
	stripeSessionUrl: string;
	soldCountTotal: number;
};

export function formatOrderMessage(args: DiscordOrderArgs): {
	content: string;
	embeds: Array<Record<string, unknown>>;
} {
	const content = `🛍️  **REVIEW BEFORE FULFILLING**  ·  ${args.dropId}`;
	const orderEmbed = {
		title: `Drop sold — ${args.dropId}`,
		description: `> ${truncate(args.prompt, 280)}`,
		color: 0x00ff88,
		image: { url: args.mockupUrl },
		fields: [
			{ name: 'Price', value: `$${args.priceUsd.toFixed(2)}`, inline: true },
			{ name: 'Sold (total)', value: `${args.soldCountTotal}`, inline: true },
			{ name: 'Email', value: args.customerEmail, inline: true },
			{ name: 'Ship to', value: `${args.shippingName}\n${args.shippingAddress}`, inline: false },
			{
				name: 'Stripe session',
				value: `[open in Stripe →](${args.stripeSessionUrl})`,
				inline: false
			},
			{
				name: 'Design source',
				value: `[download PNG →](${args.designUrl})`,
				inline: false
			}
		],
		timestamp: new Date().toISOString()
	};
	// Second embed renders the design source full-size so you can right-click
	// → save → upload to Printful without leaving Discord.
	const designEmbed = {
		title: 'Print this',
		description: 'design source — right-click → save image → upload to Printful',
		image: { url: args.designUrl }
	};
	return { content, embeds: [orderEmbed, designEmbed] };
}

export type SendResult = { ok: true } | { ok: false; status: number; body: string };

export async function sendDiscordWebhook(webhookUrl: string, payload: ReturnType<typeof formatOrderMessage>): Promise<SendResult> {
	const res = await fetch(webhookUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	});
	if (res.ok) return { ok: true };
	const body = await res.text().catch(() => '');
	return { ok: false, status: res.status, body };
}

function truncate(s: string, max: number): string {
	if (s.length <= max) return s;
	return s.slice(0, max - 1) + '…';
}
