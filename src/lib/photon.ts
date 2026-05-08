// @cf-wasm/photon: composite the AI-generated PNG onto a blank shirt template.
//
// CRITICAL:
//   1. WASM module-init MUST happen at runtime, not at module evaluation time.
//      The photon package ships a `.wasm` import that only resolves under the
//      Workers runtime — Node SSR build chokes on it. We dynamic-import
//      lazily inside compositeMockup() so build-time prerender doesn't touch it.
//   2. Once the module is loaded, the WASM init is cached on the per-isolate
//      module record so subsequent calls reuse it (eng review: ~50ms saved).

const TEMPLATE_URL = '/shirt-template.png';

let templateBytes: Uint8Array | null = null;

async function loadTemplate(origin: string): Promise<Uint8Array> {
	if (templateBytes) return templateBytes;
	const res = await fetch(`${origin}${TEMPLATE_URL}`);
	if (!res.ok) throw new Error(`Failed to load shirt template: ${res.status}`);
	templateBytes = new Uint8Array(await res.arrayBuffer());
	return templateBytes;
}

export type CompositeInput = {
	designBytes: Uint8Array;
	origin: string; // e.g. https://shirt.cash, used to fetch the template asset
};

/**
 * Composite the AI design onto a blank tee.
 *
 *   ┌──────────────────────────┐
 *   │     blank shirt          │
 *   │      ┌──────┐            │
 *   │      │design│  ← scaled  │
 *   │      │ 40%  │   centered │
 *   │      └──────┘   on chest │
 *   └──────────────────────────┘
 *
 * Returns the composite as PNG bytes.
 */
export async function compositeMockup({ designBytes, origin }: CompositeInput): Promise<Uint8Array> {
	const photon = await import('@cf-wasm/photon');
	const template = await loadTemplate(origin);
	const base = photon.PhotonImage.new_from_byteslice(template);
	const overlayRaw = photon.PhotonImage.new_from_byteslice(designBytes);

	const baseWidth = base.get_width();
	const baseHeight = base.get_height();

	// Scale design to ~40% of base width, centered horizontally, slightly above center vertically.
	const targetWidth = Math.round(baseWidth * 0.4);
	const aspect = overlayRaw.get_height() / overlayRaw.get_width();
	const targetHeight = Math.round(targetWidth * aspect);
	const overlay = photon.resize(overlayRaw, targetWidth, targetHeight, photon.SamplingFilter.Lanczos3);

	const x = Math.round((baseWidth - targetWidth) / 2);
	const y = Math.round(baseHeight * 0.34); // chest area, tunable per template

	// watermark stamps `overlay` onto `base` at (x, y). In-place on `base`.
	photon.watermark(base, overlay, BigInt(x), BigInt(y));

	const result = base.get_bytes();

	base.free();
	overlayRaw.free();
	overlay.free();

	return result;
}
