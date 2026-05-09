# Contributing

Reflect ships in slices. Each commit should be atomic, runnable, and
explain its trade-offs.

## Workflow

1. Pick a single slice — a feature surface or a single PRD requirement ID.
2. Write the migration first if the slice touches the database. Pair the
   migration with a `*.down.sql`. Never drop a column or table — rename
   to `_archived_*` (PRD §10.2).
3. Add a test for any pure helper you ship. Vitest under `src/lib/*.test.ts`
   or `api/**/*.test.ts`. UI smoke tests live in `e2e/*.spec.ts`.
4. Run `npm test` and `npm run typecheck` locally before committing.
5. Commit with a single subject line under 72 chars and a body that
   explains the *why* (trade-offs, alternative paths considered, fallback
   behaviour). Reference the PRD requirement ID in the subject when
   possible (`feat: outsource workflow (REQ-FIN-07)`).
6. CI runs `typecheck → vitest → vite build → RLS audit` on every PR
   (`.github/workflows/ci.yml`).

## House rules

- **No raw hexes in components.** Use designstyle4 tokens
  (`src/styles/tokens.css`) — extend the token set if you need a new shade.
- **Server-side privacy first.** Every `/api/*` endpoint calls
  `requireUser()` and resolves admin status from the DB. Never trust a
  header or client-side claim.
- **RLS is the final guard.** UI guard rails are nice but never stand in
  for a row-level policy. Add a policy + a contract test.
- **Localise as you go.** New user-facing strings go into
  `src/locales/az.json` (source) and the parity test will tell you which
  locale you forgot. `useT()` in components, `t()` in modules.
- **Trade-off in commit messages.** When a fallback exists (e.g. forecast
  cron Claude vs deterministic), write *both* paths into the commit body
  so a future reader knows the failure mode.
- **Telegram + email finance routes admin-only** (PRD §8.1). The notify
  fan-out cron enforces this at dispatch time; new finance signal sources
  must keep the same shape.

## Slice anatomy

A typical slice ships with:

- 1 migration (up + down) when the schema changes
- 1 React component / page or 1 API handler
- 1 test file when a pure helper lands
- 1 commit, 1 atomic logical change

Examples to model from:
- DB-as-final-guard pattern: `supabase/migrations/0006_task_lifecycle.sql`
- Security-definer RPC + UI: `0010_outsource_status_rpc.sql` +
  `src/components/OutsourceModal.tsx`
- Edge handler + sync/stream split: `api/mirai/chat.ts` +
  `api/mirai/stream.ts`

## Migration discipline (PRD §10)

```sql
-- never:
DROP TABLE x;
DROP COLUMN y;

-- always:
ALTER TABLE x RENAME TO _archived_x_<yyyymm>;
ALTER TABLE t RENAME COLUMN y TO _deprecated_y;
```

Pre-deploy parity test required for any rename or backfill. The audit
script (`supabase/rls_audit.sql`) gates RLS coverage in CI.

## Testing

- Vitest: pure helpers, RLS-independent logic
- Playwright: route-level smoke + business flows once a seeded test
  user exists

For DB triggers, write a sample insert/update statement that proves the
guard fires and put it in the migration's commit body — explicit, easy
to grep later.

## Reviewing a slice

- Migration up/down pair
- RLS policy on every new table
- Activity-log emission for state changes that matter
- Tests for new helpers
- Commit body explains the fallback path, if any
