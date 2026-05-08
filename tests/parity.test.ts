/**
 * Parity harness — PRD §9.3:
 *
 *   "Parity tests pre-deploy (counts, sums) for any rename/migration.
 *    Failing parity blocks deploy."
 *
 * What this test does today:
 *   1. Connects to DATABASE_URL (skipped if unset, so local dev + CI without
 *      a DB still pass).
 *   2. Captures a parity snapshot for the four hot tables — count(*) and
 *      sum(amount) where applicable.
 *   3. Re-captures and asserts equality. Today this is a "no-op" parity test:
 *      it proves the harness works and the snapshot is stable. Pre-deploy
 *      runs are expected to capture BEFORE migrating, then capture AFTER
 *      migrating, and assert equality — that wiring lands when CI gets a
 *      shadow Postgres.
 *
 * Importantly: this test does NOT mutate the database. It is read-only.
 */
import { describe, expect, it } from 'vitest';

type Snapshot = Record<string, { count: number; sum: number | null }>;

const HOT_TABLES: Array<{ name: string; sumColumn?: string }> = [
  { name: 'incomes', sumColumn: 'amount' },
  { name: 'expenses', sumColumn: 'amount' },
  { name: 'outsource_items', sumColumn: 'amount' },
  { name: 'mirai_messages' },
];

const dbUrl = process.env.DATABASE_URL ?? '';

async function snapshot(): Promise<Snapshot> {
  // Lazy import so the test file doesn't crash when pg isn't installed
  // locally. We import via dynamic specifier so vitest doesn't try to
  // resolve it at parse time.
  const pg = await import(/* @vite-ignore */ 'pg').catch(() => null);
  if (!pg) throw new Error('pg not installed; install before running parity');
  const client = new pg.default.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const out: Snapshot = {};
    for (const t of HOT_TABLES) {
      const sumExpr = t.sumColumn ? `coalesce(sum(${t.sumColumn})::float, 0)` : 'null';
      const { rows } = await client.query(
        `select count(*)::int as count, ${sumExpr} as sum from public.${t.name}`,
      );
      out[t.name] = { count: rows[0].count, sum: rows[0].sum };
    }
    return out;
  } finally {
    await client.end();
  }
}

describe('parity harness (PRD §9.3)', () => {
  if (!dbUrl) {
    it.skip('skipped — set DATABASE_URL to run', () => {});
    return;
  }

  it('snapshot is read-only and stable across two reads', async () => {
    const before = await snapshot();
    const after = await snapshot();
    expect(after).toEqual(before);
  });

  it('every hot table is reachable', async () => {
    const snap = await snapshot();
    for (const t of HOT_TABLES) {
      expect(snap[t.name], `Missing snapshot for ${t.name}`).toBeDefined();
      expect(typeof snap[t.name].count).toBe('number');
    }
  });
});
