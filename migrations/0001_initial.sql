-- shirt.cash v1 schema
-- One drops table. No order writes (orders go to Discord webhook).

CREATE TABLE IF NOT EXISTS drops (
	id TEXT PRIMARY KEY NOT NULL,
	prompt TEXT NOT NULL,
	mockup_url TEXT NOT NULL,
	stripe_price_id TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	sold_count INTEGER NOT NULL DEFAULT 0,
	view_count INTEGER NOT NULL DEFAULT 0
);

-- Optional: log generation attempts (success/failure) for monitoring.
-- Lightweight, append-only, used for debugging Replicate timeouts.
CREATE TABLE IF NOT EXISTS drop_attempts (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	prompt TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	status TEXT NOT NULL,
	error_message TEXT,
	drop_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_drops_created_at ON drops(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drop_attempts_created_at ON drop_attempts(created_at DESC);
