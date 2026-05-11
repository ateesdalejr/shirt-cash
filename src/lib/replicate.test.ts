import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateImage, ReplicateError, ReplicateTimeoutError } from './replicate';

const REAL_FETCH = global.fetch;

afterEach(() => {
	global.fetch = REAL_FETCH;
	vi.useRealTimers();
});

describe('generateImage', () => {
	it('returns PNG bytes on the happy path', async () => {
		const designBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
		const calls: string[] = [];

		global.fetch = vi.fn(async (input: RequestInfo | URL) => {
			const urlStr = typeof input === 'string' ? input : input.toString();
			calls.push(urlStr);
			if (urlStr.includes('api.replicate.com')) {
				return new Response(JSON.stringify({ output: ['https://cdn.replicate.com/output.png'] }), {
					status: 200
				});
			}
			return new Response(designBytes, { status: 200 });
		}) as typeof fetch;

		const out = await generateImage({ apiToken: 't', prompt: 'cat' });
		expect(out).toBeInstanceOf(Uint8Array);
		expect(out.byteLength).toBe(designBytes.byteLength);
		expect(calls[0]).toContain('api.replicate.com');
		expect(calls[1]).toContain('cdn.replicate.com');
	});

	it('throws ReplicateError on non-2xx from the predictions API', async () => {
		global.fetch = vi.fn(async () => new Response('boom', { status: 500 })) as typeof fetch;
		await expect(generateImage({ apiToken: 't', prompt: 'cat' })).rejects.toBeInstanceOf(ReplicateError);
	});

	it('throws ReplicateError when the API returns an error field', async () => {
		global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'NSFW prompt rejected' }), { status: 200 })) as typeof fetch;
		await expect(generateImage({ apiToken: 't', prompt: 'cat' })).rejects.toBeInstanceOf(ReplicateError);
	});

	it('throws ReplicateError when the API returns no output URL', async () => {
		global.fetch = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })) as typeof fetch;
		await expect(generateImage({ apiToken: 't', prompt: 'cat' })).rejects.toBeInstanceOf(ReplicateError);
	});

	it('throws ReplicateTimeoutError when the request hangs past the step budget', async () => {
		// Simulate AbortError directly. AbortSignal.timeout() fires DOMException 'AbortError'.
		global.fetch = vi.fn(async (_input, init) => {
			return new Promise((_resolve, reject) => {
				const sig = (init as RequestInit | undefined)?.signal;
				if (sig?.aborted) reject(new DOMException('Aborted', 'AbortError'));
				sig?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
			});
		}) as typeof fetch;

		vi.useFakeTimers();
		const promise = generateImage({ apiToken: 't', prompt: 'cat' });
		// Attach a noop catch immediately to avoid an unhandled-rejection warning when
		// the AbortError fires before vitest's expect.rejects assertion attaches its handler.
		promise.catch(() => {});
		await vi.advanceTimersByTimeAsync(90_001);
		await expect(promise).rejects.toBeInstanceOf(ReplicateTimeoutError);
	});
});
