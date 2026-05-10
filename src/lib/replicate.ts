// Replicate Recraft V3 — prompt -> PNG bytes.
// Recraft is purpose-built for graphic-design output (posters, illustrations),
// which lands closer to printable screen-print artwork than FLUX's
// photo-leaning aesthetic. 2d_art_poster style yields the bold flat shapes
// and vibrant palettes shirts want.
// Plain fetch() wrapper with 30s AbortController timeout.
// Failures are surfaced to the caller; the form action renders a retry button.

const DESIGN_MODEL = 'recraft-ai/recraft-v3';
const DESIGN_STYLE = 'digital_illustration/2d_art_poster';
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
		'high-quality screen-print-ready artwork, isolated subject on a plain white background',
		'bold lines, vivid colors, sharp focus, illustration, centered composition',
		'no shirt, no garment, no person, no model, no text, no watermark'
	].join(' ');
}

/**
 * Place a design image onto a flat-lay t-shirt photo. Uses Gemini 2.5 Flash
 * Image (google/nano-banana on Replicate), which is purpose-built for
 * compositional image editing — it preserves the input design's content while
 * rendering it as a screen-printed graphic that follows the shirt's fabric
 * folds and lighting.
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
			'Take the design in the input image and place it as a screen-printed graphic centered on the chest of a plain white cotton t-shirt. The output is a top-down flat-lay product photo of the t-shirt on a soft neutral light gray background, with natural fabric folds and gentle shadows. The design must match the input exactly. Sharp focus, professional product photography, no model, no person, no hanger, no logo on the shirt label.';

		const response = await fetch(`${REPLICATE_BASE}/models/google/nano-banana/predictions`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiToken}`,
				'Content-Type': 'application/json',
				Prefer: 'wait=25'
			},
			body: JSON.stringify({
				input: {
					prompt: composePrompt,
					image_input: [designImageUrl],
					output_format: 'png'
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
					size: '1024x1024',
					style: DESIGN_STYLE,
					output_format: 'png'
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
