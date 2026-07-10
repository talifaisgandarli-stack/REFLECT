# REFLECT — project guide for Claude

Architecture-studio management app (Azerbaijani UI). Solo owner/admin: Talifa.
Production: reflectbc.vercel.app — real company data, real money. Be careful.

## Stack (fixed — PRD §3.1, do not swap libraries)

React 18 + Vite (rolldown-vite, oxc minifier) · Tailwind · Supabase (Postgres + RLS)
· React Query · Zustand · @dnd-kit · recharts. UI copy is Azerbaijani.

## Canonical docs

- `docs/PRD.md` is the single source of truth for product behavior. Before any
  schema/UX/library decision, check it; after shipping a change that alters
  behavior or schema, update it (see REQ-FIN-10..12 for the finance model).
- Skills: `prd-guard` (grounding), `world-class-tech-team` (personas).

## Verification

```
npm run verify        # typecheck + lint + build + test — run before every commit
```

Baselines (do not regress, do not chase to zero):
- Tests: 8 files / 88 passing.
- Lint: 0 errors, **13 pre-existing warnings** — new code must add none.

For diffs touching finance logic (P&L, VAT/ƏDV, overhead, payments, RLS),
run `/code-review` on the diff before merging to main — money bugs are the
most expensive class here and tests barely cover finance math.

## Database / migrations

- Migrations live in `supabase/migrations/`, numbered `00NN_name.sql` with a
  matching `.down.sql`. Latest number: check the directory before adding.
- **Deploy does NOT run migrations.** The owner pastes them into Supabase SQL
  Editor manually — always end a schema-changing task by giving her the SQL
  to run, and keep frontend code tolerant until it's applied.
- Additive only (add columns/tables; never rename/reorder view columns —
  `create or replace view` errors with 42P16 on column renames; append new
  columns at the END of the select).
- RLS: `is_admin()` = creator OR admin role. Finance/CRM tables are admin-only;
  member-facing views (`projects_user_view`, `outsource_user_view`) must never
  expose money columns.

## Domain decisions (owner-approved — do not re-litigate)

- Profit is always computed on ƏDV-siz (net-of-VAT) amounts; default rate 18%.
- VAT is per-payment (`incomes.vat_included`/`vat_rate`): bank transfers
  usually include it, cash usually doesn't. Cash projects may set project
  vat_rate 0.
- Contract value lives on the project (`contract_value_net` + `vat_rate`);
  payments are installments (payment_kind: advance/interim/final).
- Subcontractor money truth = `outsource_payments` milestones, NOT
  `outsource_items.paid_at`.
- Overhead (salaries + projectless expenses) splits across parallel projects
  monthly by admin-set % (`project_overhead_allocations`), default share by
  contract value; saved amounts are snapshots (history must not drift).
- Every new task requires a deadline. Marking a CRM client lost requires a
  reason. Roles: only Admin/Creator + Member (Trello-style; no finance access).
- Dates/months compute in Asia/Baku; calendar times display as entered (UTC
  echo), see REQ-FIN-09.

## Git workflow

- Work on branch `claude/...` → push → PR to `main` → **squash-merge**.
- **After every squash-merge, immediately reset the branch:**
  `git fetch origin main && git checkout -B <branch> origin/main`
  (and `--force-with-lease` push). Skipping this caused repeated
  "405 merge conflict" failures — the branch history diverges from main.
- Commit messages explain the user-visible problem and the fix; note schema
  changes and PRD updates.

## UI conventions

- Tokens over hex (`var(--brand-action)` etc., see `src/styles/tokens.css`).
- Shared labels/enums live in `src/lib/labels.ts` — never hardcode a stage/
  status list in a component (caused the CRM dropdown drift bug).
- Filters: dropdown options must come from actual data (with counts), panels
  and chip counts must respect active filters.
- Wide tables: wrap in `overflow-x-auto`; modals `max-h` + inner scroll.
