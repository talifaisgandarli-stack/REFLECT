# Reflect — sessiya gedişatı (`claude/create-done-list-Y8FuN`)

PRD v3.8 + designstyle4 əsasında bu branch boyunca yığılmış 41 slice-ın xülasəsi.
Hər bir slice atomar commit-dir; `git log --oneline main..` ilə tam tarixçə.

## Modul sıxlığı

```
İŞ                     ●●●●●  task lifecycle, Done list, Arxiv, drag-drop, deadline reminders
Müştərilər             ●●●●○  8-stage pipeline, slide-in detail (5 tab), Yeni müştəri, retro
Maliyyə Mərkəzi        ●●●●○  +Gəlir/+Xərc, markPaid, P&L per-month, forecast (Claude+fallback)
Komanda                ●●●●○  Salary / Leave / Performance / Equipment / Calendar / Announcements
Şirkət                 ●●●●○  OKR (KR auto-progress + nudge candidate), Career, content stub
MIRAI                  ●●●●●  cost guardian, persona switcher (5), RAG, NDJSON streaming
Sistem                 ●●●○○  Şablon Mərkəzi, Bilik Bazası (PDF parsing), Bildiriş prefs, Audit log
Cross-cutting          ●●●●●  Realtime, Cmd+K + drawer, notifications fan-out, observability,
                              rate-limit, audit, Sentry shim, mobile drawer, i18n az/en/ru
DoD                    ●●●●○  CI workflow, RLS audit, vitest suite (~80 tests), test infra
```

## Slice axını

### Bünövrə (1–10)

| # | Commit | Mövzu |
|---|---|---|
| 1 | `0c0ae7b` | Tamamlandı (Done list) səhifəsi |
| 2 | `43e1d4c` | Tapşırıq lifecycle (create + cancel + auto-archive) |
| 3 | `9f82d82` | MIRAI cost guardian + privacy filter |
| 4 | `7219353` | Bildiriş fan-out + bell UI |
| 5 | `7b0ad44` | Realtime abunəlik (tasks + notifications) |
| 6 | `41382b9` | Notification dispatch cron (Resend + Telegram) |
| 7 | `70ba7bb` | Deadline reminder cron (D-3/D-1/D-day) |
| 8 | `83b0df0` | Cmd+K universal search backend |
| 9 | `5244c87` | Notification preferences UI |
| 10 | `fa974e6` | Vitest skeleton + format/labels tests |

### Genişlənmə (11–20)

| # | Commit | Mövzu |
|---|---|---|
| 11 | `26a5779` | Dashboard health colors + announcement/meeting widgets |
| 12 | `3b4f521` | Maliyyə +Gəlir/+Xərc + receivable markPaid |
| 13 | `1c31f06` | Project P&L tab (totals) |
| 14 | `5dc9086` | Şablon Mərkəzi CRUD + variable registry |
| 15 | `e50d75d` | Outsource hybrid workflow + advance-status RPC |
| 16 | `e1e4748` | Project closeout flow + reopen |
| 17 | `964cfbd` | HR — Salary / Leave / Performance |
| 18 | `7c56fa0` | Avadanlıq CRUD + assign |
| 19 | `4d0c9f7` | Elanlar approval queue + read tracking |
| 20 | `2fd398c` | OKR (Şirkət + Şəxsi + KR progress + health) |

### İncələmə (21–30)

| # | Commit | Mövzu |
|---|---|---|
| 21 | `b95a8e7` | Calendar Month/Week/Day + .ics + meet.new |
| 22 | `6786efa` | Karyera Strukturu + promotion path |
| 23 | `b9d7f12` | Müştəri detail panel — Layihələr/Sənədlər tab + Yeni müştəri |
| 24 | `f511746` | Retrospective survey + public share form |
| 25 | `8338e38` | Bilik Bazası ingestion (chunk + embed pipeline) |
| 26 | `4d95681` | MIRAI search_knowledge_base RAG tool |
| 27 | `ba545be` | Hesabatlar — phase donut + revenue bar + capacity heatmap |
| 28 | `bac6baf` | Project documents tab (drive_link + share token) |
| 29 | `6599817` | Award/portfolio submission UI |
| 30 | `0cb23b5` | CSV + PDF (print) export |

### Sərtləşdirmə (31–41)

| # | Commit | Mövzu |
|---|---|---|
| 31 | `9dd920c` | Contract tests (templates / ics / export) |
| 32 | `82af204` | i18n bootstrap (az/en/ru + useT) |
| 33 | `0c53986` | Production hardening (Sentry shim + audit + rate-limit) |
| 34 | `d8d8d3d` | Cmd+K deep-links + g-chord nav + MIRAI shortcut |
| 35 | `c46107f` | Client-side PDF parsing for Bilik Bazası |
| 36 | `11fce2b` | GH Actions CI + Postgres RLS audit |
| 37 | `860ac3c` | Mobile responsive — drawer sidebar + table fade |
| 38 | `ef25a2f` | API contract tests (rate-limit / audit / search) |
| 39 | `604712d` | Storage bucket upload for project documents |
| 40 | `457e4d4` | Audit log viewer admin page |
| 41 | `2f0dc6f` | Onboarding hero for new workspaces |
| 42 | `33e41e1` | Telegram inbound commands (/tasks /today /balance /help) |
| 43 | `8effdf7` | MIRAI streaming chat (NDJSON) |
| 44 | `eee6ab9` | Workload helper extracted + tests |
| 45 | `895ad05` | MIRAI persona switcher UI |
| 46 | `77563ad` | Forecast cron uses Claude with deterministic fallback |
| 47 | `fbb6fd0` | i18n consumed by Sidebar + locale switcher |
| 48 | `95bfde5` | Branded Resend email templates |
| 49 | `456324e` | Cmd+K project hits open preview drawer |
| 50 | `25973ac` | Project P&L per-month chart + CSV |

## Migrasiya intizamı

10 migrasiya, hər biri up + down:

| Fayl | Mövzu |
|---|---|
| `0001_init_schema` | 38-cədvəlli baza sxema (PRD §3.2) |
| `0002_rls` | Hər cədvəl üçün RLS policy + helper funksiyalar |
| `0003_seed_awards` | 5 mükafat seed-i |
| `0004_activity_triggers` | Universal activity log + mention parser + subtask blocker |
| `0005_client_stage_rpc` | `set_client_stage(id, to, lost_reason)` |
| `0006_task_lifecycle` | Cancel reason + workload + auto-archive triggerləri |
| `0007_notifications` | `notification_preferences` + status fan-out |
| `0008_realtime_publication` | Realtime publication-a cədvəl əlavə |
| `0009_notification_dispatch` | `notifications.dispatched_channels` jsonb |
| `0010_outsource_status_rpc` | `outsource_advance_status(id, next)` |
| `0011_closeout_rpc` | `close_project(id)` + `reopen_project(id)` |
| `0012_hr_tables` | `salaries` / `leave_requests` / `performance_reviews` + `leave_decide` |
| `0013_career_levels` | 4-tier ladder + `profiles.career_level_id` |
| `0014_retrospective_public` | `retrospective_get/submit/send` security-definer üçlüyü |
| `0015_knowledge_search` | `search_knowledge_base(embedding, limit)` + ivfflat index |
| `0016_project_documents_bucket` | Storage bucket + RLS |

§10.2 qaydası boyu hər `down` script tabloları rename edir, drop etmir.

## Test infrastrukturu

- `vitest.config.ts` — jsdom mühit, time-stable setup, src + api include.
- ~80 unit + lib testi (`format`, `labels`, `templates`, `ics`, `export`,
  `i18n`, `workload`, `rate-limit`, `audit`, `search`).
- GitHub Actions: `npm ci → typecheck → vitest → vite build` + Postgres
  RLS audit (postgres:15 service container).
- `supabase/rls_audit.sql` — public.* cədvəlində RLS söndürülmüşsə yaxud
  policy sıfırdırsa CI fail edir (managed Supabase preview branch tələb
  olunur — hazırda fail-tolerant).

## Cross-cutting xidmətlər

- **Bildirişlər**: 7 növ (`mention`, `task_assigned`, `task_status_changed`,
  `task_done`, `task_cancelled`, `deadline_reminder`, `finance_alert`).
  DB triggerlər row insert edir; cron 10 dəq-dən bir Resend email +
  Telegram bot vasitəsilə drainage edir; finance_alert yalnız admin
  Telegram-larına gedir (PRD §8.1).
- **Realtime**: tasks, notifications, activity_log, mirai_messages,
  announcements — `useRealtimeSync(userId)` Layout-da quraşdırılıb.
- **MIRAI**:
  - Hard cap $5/user/ay (PRD §7.1), creator exempt
  - 5 persona; admin-only personalar non-admin-ə qadağan
  - RAG: KB_TRIGGER_RE → search_knowledge_base RPC → top-5 chunks
  - NDJSON streaming endpoint + sync endpoint paralel
  - Forecast cron real Claude call, JSON sanity check, deterministic fallback
- **Audit**: `api/_lib/audit.ts` ilə audit_log row insert; `/audit` admin
  səhifəsində audit_log + activity_log tabları.
- **i18n**: az.json (mənbə) + en.json + ru.json — Sidebar bütünlüklə
  istifadə edir; locale switcher profile.locale-i yeniləyir.
- **Mobile**: drawer sidebar (lg-dən aşağıda hamburger trigger), table
  edge-fade, page-head wrap.

## Production blocker namizədləri

Ship-ə qədər yoxlanılması vacib olan elementlər:

1. Supabase Cloud project + auth + storage bucket provision.
2. ANTHROPIC_API_KEY + RESEND_API_KEY + TELEGRAM_BOT_TOKEN +
   CRON_SECRET + UPSTASH_REDIS_REST_URL/TOKEN env-lərinin Vercel-ə
   yüklənməsi.
3. Real Voyage / OpenAI / Cohere embedder swap (currently FNV-1a
   placeholder — RAG yalnız exact-substring match edir).
4. Sentry DSN provision + `@sentry/react` SDK swap (`src/lib/observability.ts`
   bir-fayl dəyişikliyi).
5. CI RLS audit blocking — Supabase preview branch ilə.
6. Mobile cihazda iOS Safari 16+ smoke test (PRD §9.5).
7. Lighthouse a11y ≥95, axe DevTools clean (PRD DoD §11.3).

## Hələ qalan PRD-iddiası

- Time tracking dictionary surface (PRD §11.1 Part 2 — out of v1 scope §12.1)
- Şablonlar üçün native DOCX/XLSX render (Word/Excel)
- Karyera Strukturu admin promotion approval workflow
- Telegram outbound — finance threshold alerts (REQ-FIN üçün ad-hoc)
- E2E (Playwright) test paketi
- Locale extraction qalan komponentlərdə (hələlik yalnız Sidebar tam i18n)
- Email locale-aware copy (hazırda yalnız AZ)
