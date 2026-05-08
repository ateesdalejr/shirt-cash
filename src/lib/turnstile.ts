// Cloudflare Turnstile server-side verification.
// https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
//
// The widget on the form puts a token in the `cf-turnstile-response` field;
// we POST that token + our secret to Cloudflare's siteverify endpoint and
// trust the response.

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileVerifyArgs = {
	secret: string;
	token: string;
	remoteIp?: string;
};

export async function verifyTurnstile({ secret, token, remoteIp }: TurnstileVerifyArgs): Promise<boolean> {
	if (!secret || !token) return false;
	const body = new FormData();
	body.append('secret', secret);
	body.append('response', token);
	if (remoteIp) body.append('remoteip', remoteIp);

	const res = await fetch(SITEVERIFY_URL, { method: 'POST', body });
	if (!res.ok) return false;
	const json = (await res.json()) as { success?: boolean };
	return json.success === true;
}
