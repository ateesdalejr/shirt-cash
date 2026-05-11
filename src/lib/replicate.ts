// Replicate FLUX 1.1 Pro -> PNG bytes for design, FLUX Kontext Pro for the
// shirt composite. Both calls use Replicate's sync wait (Prefer: wait=60) and
// fall back to polling the prediction's `urls.get` endpoint when it's still
// processing — the previous "no output URL" throw was the source of the
// mid-flow hangs users hit on slow predictions.
// Failures are surfaced to the caller; the form action renders a retry button.

const DESIGN_MODEL = 'black-forest-labs/flux-1.1-pro';
const COMPOSE_MODEL = 'black-forest-labs/flux-kontext-pro';
const REPLICATE_BASE = 'https://api.replicate.com/v1';
const STEP_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 1500;

/**
 * Wrap the user's prompt for the design step. Kept short so the user's intent
 * dominates — FLUX 1.1 Pro is good enough that piling on style words
 * ("cinematic, detailed, sharp focus") just drowns short prompts. The two
 * constraints we DO need: a plain background (so the compose step can place
 * it cleanly on a tee) and "no garment/model in the source image" (otherwise
 * the design itself is already a shirt).
 */
export function designPrompt(userPrompt: string): string {
	return `T-shirt graphic: ${userPrompt}. Centered on a plain solid background. No t-shirt, no garment, no person, no clothing, no model, no mockup.`;
}

type ReplicatePrediction = {
	id?: string;
	status?: string;
	output?: string | string[] | null;
	error?: string | null;
	urls?: { get?: string };
};

async function waitForOutput(
	prediction: ReplicatePrediction,
	apiToken: string,
	signal: AbortSignal
): Promise<string> {
	// Already done? Take the fast path.
	const direct = pickOutputUrl(prediction);
	if (direct) return direct;
	if (prediction.error) throw new ReplicateError(prediction.error);

	const pollUrl = prediction.urls?.get;
	if (!pollUrl) {
		throw new ReplicateError(
			`Replicate returned no output and no poll URL (status: ${prediction.status ?? 'unknown'})`
		);
	}

	while (!signal.aborted) {
		await sleep(POLL_INTERVAL_MS, signal);
		const res = await fetch(pollUrl, {
			headers: { Authorization: `Bearer ${apiToken}` },
			signal
		});
		if (!res.ok) {
			const text = await res.text().catch(() => '');
			throw new ReplicateError(`poll ${res.status}: ${text || res.statusText}`, res.status);
		}
		const next = (await res.json()) as ReplicatePrediction;
		if (next.error) throw new ReplicateError(next.error);
		const url = pickOutputUrl(next);
		if (url) return url;
		if (next.status === 'failed' || next.status === 'canceled') {
			throw new ReplicateError(`Replicate ${next.status}`);
		}
	}
	throw new ReplicateTimeoutError();
}

function pickOutputUrl(p: ReplicatePrediction): string | null {
	if (!p.output) return null;
	return Array.isArray(p.output) ? p.output[0] ?? null : p.output;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(new DOMException('Aborted', 'AbortError'));
			return;
		}
		const timer = setTimeout(() => {
			signal.removeEventListener('abort', onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timer);
			reject(new DOMException('Aborted', 'AbortError'));
		};
		signal.addEventListener('abort', onAbort, { once: true });
	});
}

function withAbortBudget<T>(
	externalSignal: AbortSignal | undefined,
	body: (signal: AbortSignal) => Promise<T>
): Promise<T> {
	const internal = new AbortController();
	const timer = setTimeout(() => internal.abort(), STEP_TIMEOUT_MS);
	const onExternalAbort = () => internal.abort();
	if (externalSignal) {
		if (externalSignal.aborted) internal.abort();
		else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
	}
	return body(internal.signal).finally(() => {
		clearTimeout(timer);
		externalSignal?.removeEventListener('abort', onExternalAbort);
	});
}

/**
 * Place a design image onto a flat-lay t-shirt photo using FLUX Kontext Pro.
 * Replaced nano-banana (Gemini 2.5 Flash Image) which refused many edgy
 * group-chat-joke designs on safety grounds. safety_tolerance: 6 is the most
 * permissive setting and is only allowed when input_image is provided.
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
	return withAbortBudget(signal, async (internalSignal) => {
		try {
			const composePrompt =
				'Place this image as a screen-printed graphic centered on the chest of a plain white cotton t-shirt. Top-down flat-lay product photo of the t-shirt on a soft neutral light gray background, natural fabric folds, gentle shadows. The graphic must match the input image exactly. Sharp focus, professional product photography. No model, no person, no hanger, no logo on the shirt label.';

			const response = await fetch(`${REPLICATE_BASE}/models/${COMPOSE_MODEL}/predictions`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiToken}`,
					'Content-Type': 'application/json',
					Prefer: 'wait=60'
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
				signal: internalSignal
			});
			if (!response.ok) {
				const text = await response.text().catch(() => '');
				throw new ReplicateError(
					`compose ${response.status}: ${text || response.statusText}`,
					response.status
				);
			}
			const body = (await response.json()) as ReplicatePrediction;
			const outputUrl = await waitForOutput(body, apiToken, internalSignal);

			const imgResponse = await fetch(outputUrl, { signal: internalSignal });
			if (!imgResponse.ok) throw new ReplicateError(`compose output fetch ${imgResponse.status}`);
			return new Uint8Array(await imgResponse.arrayBuffer());
		} catch (err) {
			if (err instanceof ReplicateError) throw err;
			if (err instanceof DOMException && err.name === 'AbortError') throw new ReplicateTimeoutError();
			throw new ReplicateError(err instanceof Error ? err.message : String(err));
		}
	});
}

export class ReplicateTimeoutError extends Error {
	constructor() {
		super(`Replicate request timed out after ${STEP_TIMEOUT_MS / 1000}s`);
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
	return withAbortBudget(signal, async (internalSignal) => {
		try {
			const response = await fetch(`${REPLICATE_BASE}/models/${DESIGN_MODEL}/predictions`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiToken}`,
					'Content-Type': 'application/json',
					Prefer: 'wait=60'
				},
				body: JSON.stringify({
					input: {
						prompt,
						aspect_ratio: '1:1',
						output_format: 'png',
						safety_tolerance: 5
					}
				}),
				signal: internalSignal
			});
			if (!response.ok) {
				const text = await response.text().catch(() => '');
				throw new ReplicateError(
					`Replicate ${response.status}: ${text || response.statusText}`,
					response.status
				);
			}
			const body = (await response.json()) as ReplicatePrediction;
			const outputUrl = await waitForOutput(body, apiToken, internalSignal);

			const imgResponse = await fetch(outputUrl, { signal: internalSignal });
			if (!imgResponse.ok) throw new ReplicateError(`Output fetch ${imgResponse.status}`);
			return new Uint8Array(await imgResponse.arrayBuffer());
		} catch (err) {
			if (err instanceof ReplicateError) throw err;
			if (err instanceof DOMException && err.name === 'AbortError') throw new ReplicateTimeoutError();
			throw new ReplicateError(err instanceof Error ? err.message : String(err));
		}
	});
}
