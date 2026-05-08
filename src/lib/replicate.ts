// Replicate FLUX Schnell — prompt -> PNG bytes.
// Plain fetch() wrapper with 20s AbortController timeout (eng review decision 1C).
// Failures are surfaced to the caller; the form action renders a retry button.

const FLUX_SCHNELL_VERSION = 'black-forest-labs/flux-schnell';
const REPLICATE_BASE = 'https://api.replicate.com/v1';

export class ReplicateTimeoutError extends Error {
	constructor() {
		super('Replicate request timed out after 20s');
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
	const timeout = setTimeout(() => internalAbort.abort(), 20_000);
	const externalListener = () => internalAbort.abort();
	if (signal) {
		if (signal.aborted) internalAbort.abort();
		else signal.addEventListener('abort', externalListener, { once: true });
	}

	try {
		// Use sync API (`Prefer: wait`) so a single fetch returns the final output URL.
		// Falls back to long-poll if generation exceeds Replicate's wait window.
		const response = await fetch(`${REPLICATE_BASE}/models/${FLUX_SCHNELL_VERSION}/predictions`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiToken}`,
				'Content-Type': 'application/json',
				Prefer: 'wait=15'
			},
			body: JSON.stringify({
				input: {
					prompt,
					aspect_ratio: '1:1',
					output_format: 'png',
					num_outputs: 1
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
