-- Email capture from /s/[id] exit-intent prompt.
-- One row per email; revisits are no-ops (email is PK).
-- drop_id records which drop they were looking at when they signed up so we
-- can correlate signups back to which designs drove them.

CREATE TABLE IF NOT EXISTS subscribers (
	email TEXT PRIMARY KEY NOT NULL,
	drop_id TEXT,
	created_at INTEGER NOT NULL,
	user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_subscribers_created_at ON subscribers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscribers_drop_id ON subscribers(drop_id);
