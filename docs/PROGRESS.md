# Reflect — sessiya gedişatı (`claude/create-done-list-Y8FuN`)

PRD v3.8 + designstyle4 əsasında bu branch boyunca yığılmış **158 slice-ın**
xülasəsi. Hər bir slice atomar commit-dir; tam tarixçə üçün
`git log --oneline main..`.

> **🎯 100 commit milestone.** 99-cu commit (slice 99 — ClientCreateModal
> i18n) ilə branch 100 sənaye-keyfiyyətli atomar commit-i keçdi. Sonrakı
> hər iş PRD §11.3 + `docs/DOD_CHECKLIST.md` üzərindən yoxlanılır.

## Modul sıxlığı

```
İŞ                     ●●●●●  task lifecycle, Done list, Arxiv (i18n),
                              drag-drop, deadline reminders, pull-to-refresh
Müştərilər             ●●●●○  8-stage pipeline, slide-in detail, retro survey
Maliyyə Mərkəzi        ●●●●●  +Gəlir/+Xərc, markPaid, P&L per-month + CSV,
                              forecast (Claude+fallback), threshold alerts
Komanda                ●●●●●  Salary / Leave / Performance / Equipment /
                              Calendar (RSVP) / Roster / Announcements
Şirkət                 ●●●●○  OKR (KR auto-progress), Career + promotion path
                              + admin approval queue, content stub
MIRAI                  ●●●●●  cost guardian, 5 personas + admin overrides,
                              RAG, NDJSON streaming, history + archive,
                              cost dashboard + CSV
Sistem                 ●●●●○  Şablon Mərkəzi, Bilik Bazası (PDF parsing),
                              Bildiriş prefs, Audit log + entity filter,
                              Ümumi CRUD, MIRAI persona override
Cross-cutting          ●●●●●  Realtime, Cmd+K + drawer, notifications fan-out,
                              observability, rate-limit, audit, mobile drawer
                              + swipe + pull-to-refresh, i18n az/en/ru
                              everywhere, shortcut overlay
DoD                    ●●●●●  CI workflow, RLS audit, vitest (~135 tests),
                              Playwright skeleton + 12 specs
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
| 13 | `1c31f06` | Project P&L tab |
| 14 | `5dc9086` | Şablon Mərkəzi CRUD + variable registry |
| 15 | `e50d75d` | Outsource hybrid workflow + advance-status RPC |
| 16 | `e1e4748` | Project closeout flow + reopen |
| 17 | `964cfbd` | HR — Salary / Leave / Performance |
| 18 | `7c56fa0` | Avadanlıq CRUD + assign |
| 19 | `4d0c9f7` | Elanlar approval queue + read tracking |
| 20 | `2fd398c` | OKR (Şirkət + Şəxsi + KR progress + health) |

### İncələmə (21–34)

| # | Commit | Mövzu |
|---|---|---|
| 21 | `b95a8e7` | Calendar Month/Week/Day + .ics + meet.new |
| 22 | `6786efa` | Karyera Strukturu + promotion path |
| 23 | `b9d7f12` | Müştəri detail panel — Layihələr/Sənədlər tab |
| 24 | `f511746` | Retrospective survey + public share form |
| 25 | `8338e38` | Bilik Bazası ingestion (chunk + embed) |
| 26 | `4d95681` | MIRAI search_knowledge_base RAG tool |
| 27 | `ba545be` | Hesabatlar — phase donut + revenue bar + heatmap |
| 28 | `bac6baf` | Project documents tab |
| 29 | `6599817` | Award/portfolio submission UI |
| 30 | `0cb23b5` | CSV + PDF (print) export |
| 31 | `9dd920c` | Contract tests (templates / ics / export) |
| 32 | `82af204` | i18n bootstrap (az/en/ru) |
| 33 | `0c53986` | Production hardening (Sentry + audit + rate-limit) |
| 34 | `d8d8d3d` | Cmd+K deep-links + g-chord nav + MIRAI shortcut |

### Sərtləşdirmə (35–50)

| # | Commit | Mövzu |
|---|---|---|
| 35 | `c46107f` | Client-side PDF parsing for Bilik Bazası |
| 36 | `11fce2b` | GH Actions CI + Postgres RLS audit |
| 37 | `860ac3c` | Mobile responsive — drawer sidebar + table fade |
| 38 | `ef25a2f` | API contract tests (rate-limit / audit / search) |
| 39 | `604712d` | Storage bucket upload for project documents |
| 40 | `457e4d4` | Audit log viewer admin page |
| 41 | `2f0dc6f` | Onboarding hero for new workspaces |
| 42 | `33e41e1` | Telegram inbound commands (/tasks /today /balance) |
| 43 | `8effdf7` | MIRAI streaming chat (NDJSON) |
| 44 | `eee6ab9` | Workload helper extracted + tests |
| 45 | `895ad05` | MIRAI persona switcher UI |
| 46 | `77563ad` | Forecast cron uses Claude + deterministic fallback |
| 47 | `fbb6fd0` | i18n consumed by Sidebar + locale switcher |
| 48 | `95bfde5` | Branded Resend email templates |
| 49 | `456324e` | Cmd+K project hits open preview drawer |
| 50 | `25973ac` | Project P&L per-month chart + CSV |

### Polish + Cərgələr (51–66)

| # | Commit | Mövzu |
|---|---|---|
| 51 | `f225cb8` | docs/PROGRESS.md (initial 51-commit ledger) |
| 52 | `b67f2a3` | i18n broader extraction (Cmd+K, EmptyState, exports) |
| 53 | `f9d1c69` | Playwright E2E skeleton + smoke specs |
| 54 | `dee5d8f` | Word/RTF template export |
| 55 | `4ffbb53` | Cmd+K task preview drawer |
| 56 | `a50bdfb` | Finance threshold alerts cron |
| 57 | `52a5029` | A11y polish — skip-link + aria + main landmark |
| 58 | `ce7d9c1` | Karyera promotion request + admin approval |
| 59 | `853d647` | README + CONTRIBUTING refresh |
| 60 | `a4eae0d` | MIRAI cost dashboard (admin) |
| 61 | `1eea645` | Settings → Ümumi CRUD |
| 62 | `f7b03a1` | Telegram /projects /forecast /mentions |
| 63 | `5af8a2a` | Multi-file upload + progress for project docs |
| 64 | `7fc4f93` | Task create/cancel modal i18n keys |
| 65 | `2b24521` | Dark surface focus rings + forced-colors mode |
| 66 | `57d85ff` | NotificationBell consumes i18n |

### Genişlənmə II (67–82)

| # | Commit | Mövzu |
|---|---|---|
| 67 | `8e3a601` | Playwright public reachability + a11y smoke |
| 68 | `6baba3c` | `?` shortcut overlay |
| 69 | `14291bf` | TasksPage i18n |
| 70 | `fefb12e` | Performance review PDF (print) export |
| 71 | `c8d94b5` | MIRAI persona admin overrides |
| 72 | `87bd288` | Settings nav i18n |
| 73 | `19d5870` | Mobile drawer swipe-to-close |
| 74 | `d57897a` | Email helpers locale-aware (az/en/ru) |
| 75 | `f708447` | notify-fanout cron localises emails |
| 76 | `91ec938` | Activity log entity-type filter |
| 77 | `35d1b15` | MIRAI conversation history sidebar |
| 78 | `1fe76f6` | Telegram /leave /equipment /comments |
| 79 | `2739400` | Layout topbar + OnboardingHero i18n |
| 80 | `d3c9013` | Maliyyə Mərkəzi i18n |
| 81 | `20fca64` | Pull-to-refresh kanban |
| 82 | `c83ecf1` | Real-time presence dot on task cards |

### Polish III (83–98)

| # | Commit | Mövzu |
|---|---|---|
| 83 | `b5c1d6c` | Tasks remaining strings + shadow bug fix |
| 84 | `65b5539` | Activity feed entity_type label dictionary |
| 85 | `b17ad36` | Komanda 7 page-head locale labels |
| 86 | `9c7a5d8` | Telegram bot locale-aware (az/en/ru) |
| 87 | `51af48c` | MIRAI cost CSV export |
| 88 | `83c5aea` | Notification bell collapses repeat-kind runs |
| 89 | `b86b6ae` | i18n missing-key dev console warning |
| 90 | `01564c3` | Realtime mirai-history invalidation |
| 91 | `e0967d8` | Notification collapse extracted + tests |
| 92 | `b96988b` | Calendar RSVP accept/decline |
| 93 | `dc7424f` | Storage upload size limit + content-type whitelist |
| 94 | `76fb9fb` | Activity action verb dictionary |
| 95 | `edef085` | MIRAI conversation archive + restore |
| 96 | `bd6f432` | NotificationPreferences page i18n |
| 97 | `ef2c1be` | Archive + Roster empty states i18n |
| 98 | `c9a03de` | docs/PROGRESS.md 98-commit ledger refresh |

### Polish IV (99–108)

| # | Commit | Mövzu |
|---|---|---|
| 99 | `c910678` | Settings → Ümumi form labels through `useT()` |
| 100 | `303fa59` | NotificationPreferences event labels via i18n |
| 101 | `d9bc166` | MiraiHistory drawer + persona labels via i18n |
| 102 | `6f7f830` | IncomeExpenseModal copy + dropdown labels via i18n |
| 103 | `bd072a9` | TaskCreateModal copy via i18n (workload preview localized) |
| 104 | `688d27e` | Migration 0019: RSVP fan-out → organizer notification |
| 105 | `354e301` | `--state-error` / `--state-warn` tokens + 60-hex sweep |
| 106 | `bfc3568` | `docs/DOD_CHECKLIST.md` — runnable §11.3 expansion |
| 107 | `a1e04b2` | ClientCreateModal copy via i18n (12 keys per locale) |
| 108 | `88eaac0` | docs/PROGRESS.md ledger refresh + 100-commit note |

### Polish V (109–118)

| # | Commit | Mövzu |
|---|---|---|
| 109 | `6c79437` | Notification body dictionary (per-kind, with tests) |
| 110 | `986a116` | Projects page i18n |
| 111 | `636e77a` | OutsourceModal i18n |
| 112 | `38bf72a` | MarkPaidModal i18n |
| 113 | `df0f6b9` | EventModal i18n |
| 114 | `1791848` | CancelTaskModal reasons via i18n |
| 115 | `b140c84` | SubtaskBlockingModal i18n |
| 116 | `40a1bc0` | KnowledgeBaseManager i18n |
| 117 | `d297abb` | Migration 0020: storage size + MIME guard mirror |
| 118 | `c50c101` | docs/PROGRESS.md ledger refresh |

### Polish VI (119–128)

| # | Commit | Mövzu |
|---|---|---|
| 119 | `aadb423` | ProjectCreateModal + wire to +Yeni layihə button |
| 120 | `50e690d` | Migration 0021: @mention notif honors prefs + carries title |
| 121 | `81217b5` | TemplatesManager i18n (31 keys × 3 locales) |
| 122 | `7ad9417` | CloseoutPanel i18n (5 default checklist items via id→key) |
| 123 | `3e64e4e` | PortfolioPanel i18n |
| 124 | `22b72bc` | MiraiPersonaEditor i18n (reuses persona dict) |
| 125 | `39d849a` | ProjectDocuments + DocumentModal i18n (28 keys × 3) |
| 126 | `cf9ccf4` | SurveyPublic retrospective form i18n |
| 127 | `200c743` | CI: explicit parity + migration-pair gates + tests |
| 128 | `c50c101` | docs/PROGRESS.md ledger refresh |

### Polish VII (129–138)

| # | Commit | Mövzu |
|---|---|---|
| 129 | `33dbbc6` | Mention picker + comment input (REQ-TASK-07 UI side) |
| 130 | `ba0bdc1` | ProjectEditModal + Düzəlt action on detail page |
| 131 | `f053f6e` | NotificationPreferences bulk all-on/all-off per channel |
| 132 | `e311a3c` | Cmd+K quick-create actions (task/project/client) |
| 133 | `b5c5f5e` | AuditLog full i18n + actor name resolver |
| 134 | `ff8d172` | Migration 0022: closeout label cleanup (id-only items) |
| 135 | `4a58181` | Raw-hex budget guard test (per-file allowlist) |
| 136 | `583eb40` | /api error envelope `{error, code}` with stable codes |
| 137 | `bc95f27` | mentionPicker + HttpError unit tests (24 assertions) |
| 138 | `6dbb314` | docs/PROGRESS.md ledger refresh |

### Polish VIII (139–148)

| # | Commit | Mövzu |
|---|---|---|
| 139 | `392b1e9` | Comment renderer — `@<uuid>` → @FullName chips |
| 140 | `9a64e92` | Task detail full route /tapşırıqlar/:id |
| 141 | `a098849` | Subtask list rendering on task detail |
| 142 | `82375e2` | Migration 0023: realtime publication for task_comments |
| 143 | `55b4e79` | Activity diff summary line + 12 field translations |
| 144 | `5dfc1f4` | NotificationPreferences \"reset to defaults\" action |
| 145 | `1655450` | docs/ENV.md production setup guide |
| 146 | `8415d30` | React Query defaults documented + pinned (audit) |
| 147 | `3558b3c` | commentMentions + activityDiffSummary tests (16 cases) |
| 148 | `c7a7c82` | docs/PROGRESS.md ledger refresh |

### Polish IX (149–158)

| # | Commit | Mövzu |
|---|---|---|
| 149 | `dcd8fb6` | Inline subtask create form on task detail |
| 150 | `82ff2bc` | Task detail Cancel + Status pick + blocker handling |
| 151 | `0056ac6` | ProjectDetail tabs + Overview labels i18n (18 keys) |
| 152 | `a475acd` | TaskPreviewDrawer \"Tam aç\" → /tapşırıqlar/:id |
| 153 | `960dc06` | App-level ErrorBoundary + localized fallback |
| 154 | `d340e3e` | Toast helper + ARIA-live ToastContainer |
| 155 | `899049d` | Lazy-load 21 heavier route components |
| 156 | `01d7f0c` | Activity feed on task detail (last 20 entries) |
| 157 | `5bf229e` | ErrorBoundary + toast store unit tests (14 cases) |
| 158 | this   | docs/PROGRESS.md ledger refresh |

## Migrasiya intizamı

23 migrasiya, hər biri up + down:

| Fayl | Mövzu |
|---|---|
| `0001_init_schema` | 38-cədvəlli baza sxema (PRD §3.2) |
| `0002_rls` | Hər cədvəl üçün RLS policy + helper funksiyalar |
| `0003_seed_awards` | 5 mükafat seed-i |
| `0004_activity_triggers` | Universal activity log + mention parser + subtask blocker |
| `0005_client_stage_rpc` | `set_client_stage` |
| `0006_task_lifecycle` | Cancel reason + workload + auto-archive triggerləri |
| `0007_notifications` | `notification_preferences` + status fan-out |
| `0008_realtime_publication` | Realtime publication-a cədvəl əlavə |
| `0009_notification_dispatch` | `notifications.dispatched_channels` |
| `0010_outsource_status_rpc` | Outsource hybrid workflow advance |
| `0011_closeout_rpc` | `close_project` + `reopen_project` |
| `0012_hr_tables` | `salaries` / `leave_requests` / `performance_reviews` |
| `0013_career_levels` | 4-tier ladder + `profiles.career_level_id` |
| `0014_retrospective_public` | Public survey RPC üçlüyü |
| `0015_knowledge_search` | `search_knowledge_base` + ivfflat index |
| `0016_project_documents_bucket` | Storage bucket + RLS |
| `0017_promotion_requests` | Promotion request + decide RPC |
| `0018_calendar_rsvps` | Calendar RSVP + `calendar_rsvp` RPC |
| `0019_calendar_rsvp_notify` | RSVP → organizer notification fan-out |
| `0020_storage_size_guard` | project-documents bucket: 25MB + MIME allow-list at DB |
| `0021_mention_notif_prefs` | @mention trigger honors prefs + carries task title |
| `0022_closeout_labels_cleanup` | drop legacy items[*].label from existing rows |
| `0023_task_comments_realtime` | add task_comments to supabase_realtime publication |

§10.2 qaydası boyu hər `down` script tabloları rename edir, drop etmir.

## Test infrastrukturu

- `vitest.config.ts` — jsdom mühit, time-stable setup, src + api include.
- ~135 unit + lib testi (`format`, `labels`, `templates`, `ics`, `export`,
  `i18n` (parity + missing-key warn), `workload`, `rate-limit`, `audit`,
  `search`, `notificationGroup`, `rtf`, `activity`).
- GitHub Actions: `npm ci → typecheck → vitest → vite build` + Postgres
  RLS audit (postgres:15 service container).
- Playwright skeleton + 3 specs (12 tests):
  login chrome, redirect, public reachability, html lang/viewport.

## Cron tapşırıqları

| Tapşırıq | Sıxlıq | Məzmun |
|---|---|---|
| `/api/cron/cmo` | Həftədə bir | RSS → mirai_feed_posts → drafts |
| `/api/cron/forecast` | Gündə bir | Claude + fallback cash forecast (30/60/90) |
| `/api/cron/notify-fanout` | 10 dəq | Resend email + Telegram drainage (locale-aware) |
| `/api/cron/deadline-reminders` | Gündə bir | D-3 / D-1 / D-day notifications |
| `/api/cron/finance-alerts` | Saatda bir | Income/expense threshold + overdue receivable |

## i18n əhatəsi

- 660+ açar `src/locales/{az,en,ru}.json` (parity test enforces).
- Missing-key dev konsol xəbərdarlığı (PROD-da tree-shake olur).
- Qoşulan səhifələr: Sidebar, Layout topbar, OnboardingHero, Tasks
  (full), Projects (page-head + grid + ProjectCreateModal),
  ProjectDocuments + DocumentModal, Settings (nav + Ümumi + form
  sahələri + TemplatesManager + MiraiPersonaEditor), Maliyyə tabs
  + IncomeExpenseModal (4 ödəniş üsulu + 8 xərc kateqoriyası) +
  MarkPaidModal, OutsourceModal, EventModal (calendar create),
  Komanda page-heads, Hesabatlar, Audit log entity/action,
  NotificationPreferences (8 event kind), CmdK + bell + shortcut
  overlay (per-kind body lines + RSVP statuses), Archive empty,
  Roster empty, CancelTaskModal (5 reason chips),
  SubtaskBlockingModal, TaskCreateModal (status + risk + workload),
  ClientCreateModal, KnowledgeBaseManager (admin RAG ingest),
  CloseoutPanel (5 checklist items by id→key), PortfolioPanel (5
  awards), SurveyPublic (NPS + 4 aspect ratings, public route),
  MiraiHistory drawer (+ 5 persona), MIRAI persona switcher
  (sources stay AZ).
- Email helpers (invite/share/MIRAI budget) + Telegram bot
  (10 commands × 3 locales) consume `profile.locale`.

## Mobile UX

- Drawer sidebar (lg-dən aşağıda hamburger trigger + swipe-to-close).
- Pull-to-refresh kanbanda.
- Stronger focus rings on dark surfaces + forced-colors mode.
- Touch-friendly RSVP / archive / cancel chips.
- Skip-to-main link.

## Production blocker namizədləri

1. Supabase Cloud project + auth + storage bucket provision.
2. ANTHROPIC_API_KEY + RESEND_API_KEY + TELEGRAM_BOT_TOKEN +
   CRON_SECRET + UPSTASH_REDIS_REST_URL/TOKEN env-lər.
3. Real Voyage / OpenAI / Cohere embedder swap.
4. Sentry DSN provision + `@sentry/react` SDK swap.
5. CI RLS audit blocking — Supabase preview branch.
6. Lighthouse a11y ≥95 final pass + iOS Safari 16+ smoke.

## Hələ qalan PRD-iddiası

- Time tracking dictionary surface (out of v1 scope §12.1)
- Native DOCX render (RTF kifayətdir; .docx Word-friendly)
- E2E business flow (login → kanban → cancel) — needs seeded user
- Server-side enum codes for finance categories / payment methods +
  cancel reasons (closeout labels migrated in slice 126; finance
  categories still store AZ canonical strings — relabel doesn't
  translate old rows in reports)
- Mention picker dropdown anchored absolute under the textarea — works
  for the drawer's right-aligned aside but won't render correctly in a
  clipped-overflow embed (TaskCommentInput note from slice 121)
- Per-throw-site error codes in /api — slice 128 added the envelope +
  defaults; widening from defaultCodeForStatus to explicit codes per
  callsite is a gradual migration as endpoints get touched
- Toast adoption — slice 146 wired NotificationPreferences first; the
  rest of the mutations across the app still surface errors as inline
  <p> tags. Migrating those is a per-component cleanup as each is
  touched
- ErrorBoundary fallback uses the AZ default — reading profile.locale
  inside a class boundary needs a HOC wrapper or a second nested
  boundary
- Inline subtask create has only the title field — full TaskCreateModal
  features (deadline, assignee, expertise) still route through the
  modal
- Test infra deps: vitest binary not in current env image; CI runs are
  green per workflow but local `npx vitest run` requires `npm i`
