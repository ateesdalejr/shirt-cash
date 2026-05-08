// D1 wrappers for the `drops` table.
// Single primary key lookup + atomic counter increments.

export type Drop = {
	id: string;
	prompt: string;
	mockup_url: string;
	stripe_price_id: string;
	created_at: number;
	sold_count: number;
	view_count: number;
};

export async function insertDrop(db: D1Database, drop: Drop): Promise<void> {
	await db
		.prepare(
			`INSERT INTO drops (id, prompt, mockup_url, stripe_price_id, created_at, sold_count, view_count)
			 VALUES (?, ?, ?, ?, ?, 0, 0)`
		)
		.bind(drop.id, drop.prompt, drop.mockup_url, drop.stripe_price_id, drop.created_at)
		.run();
}

export async function getDrop(db: D1Database, id: string): Promise<Drop | null> {
	const result = await db.prepare(`SELECT * FROM drops WHERE id = ?`).bind(id).first<Drop>();
	return result ?? null;
}

/**
 * Atomic view counter increment.
 *
 * Returns the new view_count. Use RETURNING so the read and write are a single
 * round-trip and the counter we display is exactly what we just wrote (no race).
 */
export async function incrementViewCount(db: D1Database, id: string): Promise<number> {
	const row = await db
		.prepare(`UPDATE drops SET view_count = view_count + 1 WHERE id = ? RETURNING view_count`)
		.bind(id)
		.first<{ view_count: number }>();
	return row?.view_count ?? 0;
}

/**
 * Atomic sold counter increment. Called from the Stripe webhook AFTER idempotency
 * dedup, so duplicate events do not double-increment.
 */
export async function incrementSoldCount(db: D1Database, id: string): Promise<number> {
	const row = await db
		.prepare(`UPDATE drops SET sold_count = sold_count + 1 WHERE id = ? RETURNING sold_count`)
		.bind(id)
		.first<{ sold_count: number }>();
	return row?.sold_count ?? 0;
}

export async function logAttempt(
	db: D1Database,
	args: { prompt: string; status: 'ok' | 'replicate_timeout' | 'replicate_error' | 'photon_error' | 'storage_error'; error?: string; dropId?: string }
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO drop_attempts (prompt, created_at, status, error_message, drop_id)
			 VALUES (?, ?, ?, ?, ?)`
		)
		.bind(args.prompt, Date.now(), args.status, args.error ?? null, args.dropId ?? null)
		.run();
}
