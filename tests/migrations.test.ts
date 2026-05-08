/**
 * Migration discipline tests — PRD §9.3.
 *
 *   "Migrations: every up + down; CI rejects PRs without down()."
 *
 * These checks run without a database — they're file-system invariants on
 * supabase/migrations/. They're the cheapest safety net we can ship and they
 * catch the most common DoD violation (a new up.sql with no paired down).
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function listMigrations() {
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
}

describe('supabase/migrations discipline (PRD §9.3)', () => {
  const files = listMigrations();

  it('directory is non-empty', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('every up.sql has a paired down.sql', () => {
    const ups = files.filter((f) => !f.endsWith('.down.sql'));
    const downs = new Set(files.filter((f) => f.endsWith('.down.sql')));

    const orphans = ups.filter((up) => {
      const expected = up.replace(/\.sql$/, '.down.sql');
      return !downs.has(expected);
    });

    expect(orphans, `Missing down migrations for: ${orphans.join(', ')}`).toEqual([]);
  });

  it('every down.sql has a paired up.sql', () => {
    const ups = new Set(files.filter((f) => !f.endsWith('.down.sql')));
    const downs = files.filter((f) => f.endsWith('.down.sql'));

    const orphans = downs.filter((down) => {
      const expected = down.replace(/\.down\.sql$/, '.sql');
      return !ups.has(expected);
    });

    expect(orphans, `Down migrations without an up: ${orphans.join(', ')}`).toEqual([]);
  });

  it('migration files are non-empty', () => {
    for (const f of files) {
      const size = statSync(join(MIGRATIONS_DIR, f)).size;
      expect(size, `${f} is empty`).toBeGreaterThan(0);
    }
  });

  it('migrations are numerically prefixed and sorted', () => {
    const ups = files
      .filter((f) => !f.endsWith('.down.sql'))
      .sort();
    for (const f of ups) {
      expect(f, `Bad name: ${f}`).toMatch(/^\d{4}_[a-z0-9_]+\.sql$/);
    }
    const ids = ups.map((f) => parseInt(f.slice(0, 4), 10));
    const unique = new Set(ids);
    expect(unique.size, 'Duplicate migration prefixes').toEqual(ids.length);
  });

  it('no NEW migration drops a base table (PRD §10.2 NO DATA LOSS)', () => {
    // PRD §10.2 forbids destructive table drops in subsequent migrations.
    // 0001's own down migration is the one legitimate exception — it must
    // be able to undo the initial schema. Any drop of a base table in a
    // later migration is a red flag.
    const baseTables = [
      'profiles', 'roles', 'projects', 'tasks', 'clients', 'incomes',
      'expenses', 'outsource_items', 'receivables', 'recurring_expenses',
      'mirai_conversations', 'mirai_messages', 'mirai_usage_log',
      'knowledge_base', 'announcements', 'calendar_events',
    ];
    const violations: string[] = [];
    for (const f of files) {
      if (f === '0001_init_schema.down.sql') continue;
      const body = readFileSync(join(MIGRATIONS_DIR, f), 'utf8').toLowerCase();
      for (const t of baseTables) {
        const re = new RegExp(`drop\\s+table\\s+(if\\s+exists\\s+)?${t}\\b`);
        if (re.test(body)) violations.push(`${f}: drops ${t}`);
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });
});
