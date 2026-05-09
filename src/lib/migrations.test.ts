/**
 * Migration discipline guard (PRD §10.2).
 *
 * Every up.sql under supabase/migrations/ must have a paired down.sql,
 * and the inventory must form an unbroken 0001..0NNN sequence — gaps
 * make rollbacks impossible to compose. This test runs as part of
 * `npm test`, which means a fresh slice that adds a migration without
 * its down() blocks merging.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIG_DIR = join(__dirname, '..', '..', 'supabase', 'migrations');

function listMigrations(): string[] {
  return readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql'));
}

function ups(): string[] {
  return listMigrations()
    .filter((f) => !f.endsWith('.down.sql'))
    .sort();
}

function downs(): Set<string> {
  return new Set(listMigrations().filter((f) => f.endsWith('.down.sql')));
}

describe('migration pairs', () => {
  it('every up.sql has a matching down.sql', () => {
    const downSet = downs();
    const orphans = ups().filter((up) => {
      const stem = up.replace(/\.sql$/, '');
      return !downSet.has(`${stem}.down.sql`);
    });
    expect(orphans, `unpaired migrations: ${orphans.join(', ')}`).toEqual([]);
  });

  it('numbering forms an unbroken 0001..N sequence', () => {
    const numbers = ups()
      .map((f) => Number((f.match(/^(\d{4})_/) ?? [])[1]))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    expect(numbers[0]).toBe(1);
    for (let i = 1; i < numbers.length; i += 1) {
      expect(numbers[i] - numbers[i - 1], `gap before ${numbers[i]}`).toBe(1);
    }
  });

  it('every down.sql has a matching up.sql', () => {
    const upStems = new Set(ups().map((f) => f.replace(/\.sql$/, '')));
    const orphanDowns = [...downs()].filter((d) => {
      const stem = d.replace(/\.down\.sql$/, '');
      return !upStems.has(stem);
    });
    expect(orphanDowns, `orphan down files: ${orphanDowns.join(', ')}`).toEqual([]);
  });
});
