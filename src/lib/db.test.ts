import { describe, it, expect, vi } from 'vitest';
import { insertDrop, getDrop, incrementViewCount, incrementSoldCount } from './db';

// Lightweight D1 mock: records SQL + bound params and returns scripted responses.
// Each `prepare()` consumes ONE scripted result; `bind()` returns the same stmt so
// `first()` resolves with the captured result for that prepare call.
type Recorded = { sql: string; binds: unknown[] };
function makeDB(scripted: Array<unknown>): { db: D1Database; recorded: Recorded[] } {
	const recorded: Recorded[] = [];
	let i = 0;
	const db = {
		prepare: (sql: string) => {
			const result = scripted[i++];
			const stmt = {
				bind: (...binds: unknown[]) => {
					recorded.push({ sql, binds });
					return stmt;
				},
				first: vi.fn().mockResolvedValue(result),
				run: vi.fn().mockResolvedValue({ success: true })
			};
			return stmt as unknown as D1PreparedStatement;
		}
	} as unknown as D1Database;
	return { db, recorded };
}

describe('db', () => {
	const drop = {
		id: 'drop_xkj8mn2',
		prompt: 'a sad raccoon',
		mockup_url: 'https://shirt.cash/r2/mockups/drop_xkj8mn2.png',
		stripe_price_id: 'price_123',
		created_at: 1_700_000_000_000,
		sold_count: 0,
		view_count: 0
	};

	it('inserts a drop with all fields and zero counters', async () => {
		const { db, recorded } = makeDB([null]);
		await insertDrop(db, drop);
		expect(recorded[0].sql).toContain('INSERT INTO drops');
		expect(recorded[0].sql).toContain('sold_count');
		expect(recorded[0].sql).toContain('view_count');
		expect(recorded[0].binds).toEqual([
			drop.id,
			drop.prompt,
			drop.mockup_url,
			drop.stripe_price_id,
			drop.created_at
		]);
	});

	it('looks up a drop by id', async () => {
		const { db, recorded } = makeDB([drop]);
		const out = await getDrop(db, drop.id);
		expect(out).toEqual(drop);
		expect(recorded[0].sql).toContain('SELECT * FROM drops WHERE id = ?');
		expect(recorded[0].binds).toEqual([drop.id]);
	});

	it('returns null when drop is not found', async () => {
		const { db } = makeDB([null]);
		expect(await getDrop(db, 'nope')).toBeNull();
	});

	it('view increment uses atomic UPDATE ... RETURNING', async () => {
		const { db, recorded } = makeDB([{ view_count: 4 }]);
		const out = await incrementViewCount(db, drop.id);
		expect(out).toBe(4);
		expect(recorded[0].sql).toContain('UPDATE drops SET view_count = view_count + 1');
		expect(recorded[0].sql).toContain('RETURNING view_count');
	});

	it('sold increment uses atomic UPDATE ... RETURNING', async () => {
		const { db, recorded } = makeDB([{ sold_count: 1 }]);
		const out = await incrementSoldCount(db, drop.id);
		expect(out).toBe(1);
		expect(recorded[0].sql).toContain('UPDATE drops SET sold_count = sold_count + 1');
		expect(recorded[0].sql).toContain('RETURNING sold_count');
	});
});
