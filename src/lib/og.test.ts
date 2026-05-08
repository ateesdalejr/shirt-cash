import { describe, it, expect } from 'vitest';
import { ogTitle, ogDescription } from './og';

describe('ogTitle', () => {
	it('returns the prompt unchanged when ≤70 chars', () => {
		expect(ogTitle('a sad raccoon')).toBe('a sad raccoon');
	});

	it('returns exactly 70 chars when prompt is exactly 70 chars', () => {
		const p = 'x'.repeat(70);
		expect(ogTitle(p)).toBe(p);
		expect(ogTitle(p)).toHaveLength(70);
	});

	it('truncates with ellipsis when prompt is longer than 70 chars', () => {
		const p = 'a sad raccoon eating a hot pocket at 3am, in the style of a renaissance oil painting';
		const out = ogTitle(p);
		expect(out).toHaveLength(70);
		expect(out.endsWith('…')).toBe(true);
	});
});

describe('ogDescription', () => {
	it('says "ships in 5 days" right after creation', () => {
		const now = 1_700_000_000_000;
		const out = ogDescription({ priceUsd: 25, dropId: 'drop_x1', createdAt: now, now });
		expect(out).toBe('$25 · drop_x1 · ships in 5 days');
	});

	it('counts down ships_in as days pass', () => {
		const created = 1_700_000_000_000;
		const twoDaysLater = created + 2 * 24 * 60 * 60 * 1000;
		expect(ogDescription({ priceUsd: 25, dropId: 'd', createdAt: created, now: twoDaysLater })).toBe('$25 · d · ships in 3 days');
	});

	it('says "ships now" once 5+ days have passed', () => {
		const created = 1_700_000_000_000;
		const sixDaysLater = created + 6 * 24 * 60 * 60 * 1000;
		expect(ogDescription({ priceUsd: 25, dropId: 'd', createdAt: created, now: sixDaysLater })).toBe('$25 · d · ships now');
	});

	it('uses singular "1 day" not "1 days"', () => {
		const created = 1_700_000_000_000;
		const fourDaysLater = created + 4 * 24 * 60 * 60 * 1000;
		expect(ogDescription({ priceUsd: 25, dropId: 'd', createdAt: created, now: fourDaysLater })).toBe('$25 · d · ships in 1 day');
	});
});
