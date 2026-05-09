# Definition of Done — Ship-Ready Checklist

A runnable expansion of PRD §11.3 that anyone (engineer or reviewer) can
walk through before merging or releasing a slice. Each item lists *how*
to verify it, not just *what* to verify.

When a slice can't satisfy an item (e.g. a backend-only migration with no
UI surface), strike that line in the PR body and explain.

---

## A. Functional acceptance

- [ ] **Acceptance criteria met.** Cite the PRD requirement IDs (e.g.
  `REQ-TASK-09`) in the PR body and demo each path.
- [ ] **Empty state shipped.** Component renders deliberately for zero
  rows / no permission / not-yet-loaded with a useful CTA — not a blank
  div.
- [ ] **Loading state shipped.** Skeleton, spinner, or `t('common.loading')`
  text — never a flash of zero data.
- [ ] **Error state shipped.** API failure surfaces a non-fatal message
  in the UI (don't `throw` at the user). Verify via DevTools → Network →
  block the request.

## B. Security & data integrity

- [ ] **RLS policy reviewed.** Run the new feature signed in as a
  Level 4 / non-admin user; verify they can't read or mutate rows that
  belong to someone else.
- [ ] **Final guard at the DB.** Don't rely on the UI to enforce
  invariants — encode them as `CHECK`, `UNIQUE`, trigger, or
  `security definer` RPC. `git grep "create policy"` should show the
  new table covered.
- [ ] **No secrets in the diff.** `git diff main..HEAD | grep -iE
  'sk-|api[_-]?key|password|bearer'` returns nothing.

## C. Migration discipline

- [ ] **Paired up + down.** `0NNN_<slug>.sql` and
  `0NNN_<slug>.down.sql`. Rename never DROP — use `_archived_<col>` if a
  column must go.
- [ ] **Parity test green.** `vitest run src/tests/migration_pairs.test.ts`
  (or whichever the suite calls). Both files exist for every new
  migration.
- [ ] **Roll-forward then roll-back.** Apply up.sql, run the slice once,
  then apply down.sql and confirm no orphan rows remain.

## D. Observability

- [ ] **Activity log emits.** If the slice creates / updates / deletes a
  user-visible entity, an `activity_logs` row gets written. Check via
  `select * from activity_logs order by created_at desc limit 5;` after
  the test action.
- [ ] **Sentry covers the failure path.** Force a failure (e.g. revoke
  the RLS policy temporarily) and confirm an event in Sentry — no quiet
  swallow.
- [ ] **MIRAI cost guardian respected.** Any new prompt path uses the
  shared dispatcher so monthly $-cap still applies.

## E. UX & accessibility

- [ ] **Keyboard navigable.** Tab through the new control without
  reaching for the mouse. Escape closes modals. Enter submits primary
  action.
- [ ] **Visible focus.** `--focus-ring` is present on every interactive
  element (designstyle4 §A).
- [ ] **`aria-label` set on icon-only buttons** and on dialog roots.
- [ ] **Tap target ≥ 44px** on mobile views (designstyle4 §motion).

## F. i18n

- [ ] **No raw user-visible strings in components.** Every label, button,
  empty-state line, and aria-label resolves through `useT()` or the
  module-level `t()`.
- [ ] **All three locales present.** AZ is the source of truth; EN +
  RU rows exist for every new key.
- [ ] **Locale parity test green.** `vitest run i18n` passes — no
  missing keys, no empty values.

## G. Visual & responsive

- [ ] **Tokens not raw hex.** Inline `style={{ color: '#…' }}` only when
  recharts SVG paint forces it (then matched to a token value with a
  comment).
- [ ] **Designstyle4 compliance.** Mindaro `--brand-action` used as the
  CTA, sage `--brand-text` for headings, paper `--canvas` background.
- [ ] **Mobile + desktop screenshots.** Attach pre/post in the PR for
  any UI slice.

## H. Tests

- [ ] **Unit test for new pure logic.** Workload, expertise, calendar
  math, notification grouping, etc. live in `src/lib/*.test.ts`.
- [ ] **Vitest suite green locally.** `npm run test` exits 0.
- [ ] **Playwright smoke green** for any cross-page slice. `npm run e2e`
  exits 0.
- [ ] **TypeScript clean.** `npx tsc --noEmit` returns no errors that
  the slice introduced.

## I. Browser pass

- [ ] Chrome current + Safari current (macOS). The two engines diverge
  on focus rings, date pickers, and `gap` in flex containers.
- [ ] No console errors on the happy path. Warnings are tolerable but
  must be triaged.

## J. PR hygiene

- [ ] **Title cites the slice + PRD section** — e.g.
  `feat(tasks): localize TaskCreateModal copy (slice 95, REQ-TASK-01)`.
- [ ] **Body explains the trade-off**, not just the change. Reviewers
  need to know what was *not* done and why.
- [ ] **Single concern per commit.** Locale additions, schema migration,
  and component wire-up may share a slice but should each be a logical
  step in the diff (squash at merge time).

---

## Quick smoke (run before opening a PR)

```sh
# All four should exit 0:
npx tsc --noEmit
npm run test -- --run
npm run lint           # if configured
npm run build          # catches Vite/Tailwind purge regressions
```

If any one fails, the slice is not done — even if the feature looks
correct in the browser.
