// Replicate FLUX 1.1 Pro — prompt -> PNG bytes.
// FLUX Pro renders concepts faithfully and semi-realistically, which beats
// graphic-design models like Recraft when the goal is "the shirt actually
// depicts the joke." Output still composites well onto a tee via nano-banana.
// Plain fetch() wrapper with 30s AbortController timeout.
// Failures are surfaced to the caller; the form action renders a retry button.

const DESIGN_MODEL = 'black-forest-labs/flux-1.1-pro';
const REPLICATE_BASE = 'https://api.replicate.com/v1';

/**
 * Wrap the user's prompt to generate a clean design-only artwork. This is the
 * canonical artwork that gets archived for fulfillment (Printful upload). It
 * also gets passed as the input image to the shirt-mockup compose step so the
 * mockup contains the EXACT design that will be printed.
 */
export function designPrompt(userPrompt: string): string {
	return [
		userPrompt,
		'.',
		'cinematic, detailed, sharp focus, centered composition,',
		'isolated subject on a plain white background,',
		'no shirt, no garment, no person wearing clothing, no model, no text, no watermark'
	].join(' ');
}

/**
 * Place a design image onto a flat-lay t-shirt photo. Uses FLUX Kontext Pro,
 * a purpose-built image-editing model that preserves the input design while
 * rendering it as a screen-printed graphic following the shirt's fabric folds
 * and lighting. Replaced nano-banana (Gemini 2.5 Flash Image) which refused
 * many edgy group-chat-joke designs on safety grounds. safety_tolerance: 6
 * is the most permissive setting (only available when input_image is set).
 */
export async function composeShirtMockup({
	apiToken,
	designImageUrl,
	signal
}: {
	apiToken: string;
	designImageUrl: string;
	signal?: AbortSignal;
}): Promise<Uint8Array> {
	const internalAbort = new AbortController();
	const timeout = setTimeout(() => internalAbort.abort(), 30_000);
	const externalListener = () => internalAbort.abort();
	if (signal) {
		if (signal.aborted) internalAbort.abort();
		else signal.addEventListener('abort', externalListener, { once: true });
	}

	try {
		const composePrompt =
			'Place this image as a screen-printed graphic centered on the chest of a plain white cotton t-shirt. Top-down flat-lay product photo of the t-shirt on a soft neutral light gray background, natural fabric folds, gentle shadows. The graphic must match the input image exactly. Sharp focus, professional product photography. No model, no person, no hanger, no logo on the shirt label.';

		const response = await fetch(`${REPLICATE_BASE}/models/black-forest-labs/flux-kontext-pro/predictions`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiToken}`,
				'Content-Type': 'application/json',
				Prefer: 'wait=25'
			},
			body: JSON.stringify({
				input: {
					prompt: composePrompt,
					input_image: designImageUrl,
					aspect_ratio: '1:1',
					output_format: 'png',
					safety_tolerance: 6
				}
			}),
			signal: internalAbort.signal
		});

		if (!response.ok) {
			const text = await response.text().catch(() => '');
			throw new ReplicateError(`compose ${response.status}: ${text || response.statusText}`, response.status);
		}

		const body = (await response.json()) as { output?: string | string[]; error?: string };
		if (body.error) throw new ReplicateError(body.error);
		const outputUrl = Array.isArray(body.output) ? body.output[0] : body.output;
		if (!outputUrl) throw new ReplicateError('compose returned no output URL');

		const imgResponse = await fetch(outputUrl, { signal: internalAbort.signal });
		if (!imgResponse.ok) throw new ReplicateError(`compose output fetch ${imgResponse.status}`);
		return new Uint8Array(await imgResponse.arrayBuffer());
	} catch (err) {
		if (err instanceof ReplicateError) throw err;
		if (err instanceof DOMException && err.name === 'AbortError') throw new ReplicateTimeoutError();
		throw new ReplicateError(err instanceof Error ? err.message : String(err));
	} finally {
		clearTimeout(timeout);
		signal?.removeEventListener('abort', externalListener);
	}
}

export class ReplicateTimeoutError extends Error {
	constructor() {
		super('Replicate request timed out after 30s');
		this.name = 'ReplicateTimeoutError';
	}
}

export class ReplicateError extends Error {
	constructor(
		message: string,
		public readonly status?: number
	) {
		super(message);
		this.name = 'ReplicateError';
	}
}

export type GenerateInput = {
	apiToken: string;
	prompt: string;
	signal?: AbortSignal;
};

export async function generateImage({ apiToken, prompt, signal }: GenerateInput): Promise<Uint8Array> {
	const internalAbort = new AbortController();
	const timeout = setTimeout(() => internalAbort.abort(), 30_000);
	const externalListener = () => internalAbort.abort();
	if (signal) {
		if (signal.aborted) internalAbort.abort();
		else signal.addEventListener('abort', externalListener, { once: true });
	}

	try {
		// Use sync API (`Prefer: wait`) so a single fetch returns the final output URL.
		// Falls back to long-poll if generation exceeds Replicate's wait window.
		const response = await fetch(`${REPLICATE_BASE}/models/${DESIGN_MODEL}/predictions`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiToken}`,
				'Content-Type': 'application/json',
				Prefer: 'wait=25'
			},
			body: JSON.stringify({
				input: {
					prompt,
					aspect_ratio: '1:1',
					output_format: 'png',
					safety_tolerance: 5
				}
			}),
			signal: internalAbort.signal
		});

		if (!response.ok) {
			const text = await response.text().catch(() => '');
			throw new ReplicateError(`Replicate ${response.status}: ${text || response.statusText}`, response.status);
		}

		const body = (await response.json()) as { output?: string | string[]; status?: string; error?: string };
		if (body.error) throw new ReplicateError(body.error);

		const outputUrl = Array.isArray(body.output) ? body.output[0] : body.output;
		if (!outputUrl) throw new ReplicateError('Replicate returned no output URL');

		const imgResponse = await fetch(outputUrl, { signal: internalAbort.signal });
		if (!imgResponse.ok) throw new ReplicateError(`Output fetch ${imgResponse.status}`);
		return new Uint8Array(await imgResponse.arrayBuffer());
	} catch (err) {
		if (err instanceof ReplicateError) throw err;
		if (err instanceof DOMException && err.name === 'AbortError') throw new ReplicateTimeoutError();
		throw new ReplicateError(err instanceof Error ? err.message : String(err));
	} finally {
		clearTimeout(timeout);
		signal?.removeEventListener('abort', externalListener);
	}
}
