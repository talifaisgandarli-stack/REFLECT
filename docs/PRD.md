# Reflect Architects OS — Product Requirements Document
**Version:** 3.8 (Presence + Focus dashboard widgets, finance widget removed from dashboard)
**Date:** 2026-05-05
**Product Owner:** Talifa İsgəndərli
**Status:** Pre-PMF / Active Development

**v3.8 changes (2026-05-05):**
- Added REQ-DASH-06 (Presence panel) + REQ-DASH-07 (Focus Mode widget) — both required on admin and user dashboards
- Added REQ-DASH-08 — Finance widget removed from dashboard per product decision; lives only in Maliyyə Mərkəzi
- US-DASH-03 (finance snapshot on dashboard) is now superseded; should be removed in next user-stories revision
- Detailed specs for presence + focus already documented in §10.5 (added in v3.8 addendum)
**Scope of this document:** Functional, data, integration, security, AI, ops, and acceptance specifications for a fully-ready product. **UI/UX visual design is intentionally excluded** and lives in a separate design-system spec.

---

## 0. How to read this document

- §1–2: Why & for whom
- §3: Architecture, data model, RLS, performance budgets
- §4: Navigation contract (final structure)
- §5: Module-by-module functional spec, with user stories + acceptance criteria + data contracts + RLS + edge cases
- §6: Cross-cutting requirements (activity log, errors, jobs, search, accessibility)
- §7: AI (MIRAI) — personas, RAG, cost, privacy
- §8: Integrations (Telegram, Calendar, Drive, RSS feeds)
- §9: Non-functional requirements (security, performance, reliability, observability)
- §10: Data lifecycle & migration discipline (NO DATA LOSS)
- §11: Release plan, MoSCoW, definition of done
- §12: Open questions & explicit non-goals

Every requirement uses a stable ID (`REQ-<MODULE>-NN`) so it can be referenced from tickets, tests and PRs.

---

## 1. Product Vision

### 1.1 Positioning
Reflect Architects OS is the **first business-management platform built exclusively for architecture firms** that feels genuinely modern. Existing tools (Deltek Ajera, Monograph, ArchiOffice, BQE Core) are too enterprise-heavy, too generic, or aesthetically outdated. Reflect is powerful, flexible, fast — built by an architect, for architects.

### 1.2 North Star Metric
**Weekly Active Projects (WAP)** — projects with ≥1 task update in a rolling 7-day window. Target: 100% of active projects touched weekly.

### 1.3 Six-month Success Metrics
- ≥80% of tasks updated within 24h of status change (task velocity)
- ≤2 min from invite-accept to first task created (onboarding speed)
- ≥70% monthly retention of invited team members (stickiness)
- ≥4.5/5 NPS from client retrospective surveys
- 0 hours/month of manual bookkeeping for the firm (finance automation completeness)
- MIRAI: ≥1 useful interaction/user/week, $0 over budget

### 1.4 Product Principles
1. **No data loss, ever.** Migrations are additive; deprecations rename, never drop. (See §10.)
2. **Privacy by RLS, not by UI.** Hidden ≠ secure. Every guard exists at the database layer. (See §9.1.)
3. **Speed over completeness.** A 60-second task creation beats a 6-field "perfect" form.
4. **Architect-native vocabulary.** Phases, expertise, ekspertiza subtasks, AZ-specific fields — not generic project-management abstractions.
5. **AI is an assistant, not an authority.** MIRAI cites sources; uncertain answers say so.

---

## 2. Users & Roles

### 2.1 Personas
| Persona | Role | Jobs-to-be-Done |
|---|---|---|
| Studio Director | Talifa (Creator/Admin) | Firm health, risk, payments, hiring |
| Project Architect | Senior architect | Project tasks, deadlines, expertise coordination |
| Designer | Mid-level | Update task status, log time, access files |
| Intern | Junior | View assigned tasks, mark done, see announcements |
| BD Lead | Business dev | Pipeline, proposals, interactions |
| Finance Manager | Admin/accountant | Income/expense, outsource payments, forecast |
| Outsource Specialist | External | Own tasks only |
| Client | External | Public document/survey access via share token |

### 2.2 Role Hierarchy (numeric levels)
```
Level 1  Creator   (is_creator = true; Talifa) — unrestricted
Level 2  Admin     — full read/write except creator-only settings
Level 3  Team Lead — manage own projects + team tasks
Level 4  Member    — own tasks + assigned projects
Level 5  External  — own outsource tasks only (no project tree)
```

Helper functions in Postgres:
- `is_creator()` → `profiles.is_creator = true`
- `is_admin()` → `roles.level <= 2 OR is_creator()`
- `is_team_lead()` → `roles.level <= 3 OR is_creator()`
- `current_role_level()` → integer

**Rule:** sidebar visibility never substitutes for RLS. Every component that renders financial values must call a role check inline (`useRoleLevel() <= 2`) AND the underlying query must be RLS-protected.

---

## 3. Technical Architecture

### 3.1 Stack
```
Frontend:   React 18 + Vite + Tailwind CSS
Routing:    React Router v6
State:      React Query (server) + Zustand (UI)
Backend:    Supabase (PostgreSQL 15, RLS, Auth, Storage, Realtime, Edge Functions)
API:        Vercel Serverless Functions (/api/*) for AI + cron + privileged ops
Hosting:    Vercel (frontend + /api), Supabase Cloud (backend)
AI:         Claude Haiku 4.5 via Anthropic API (MIRAI)
Vector DB:  pgvector extension on Supabase (RAG)
Jobs:       Vercel Cron + Supabase pg_cron for scheduled work
Email:      Resend (transactional) — magic links via Supabase Auth
Telegram:   Bot API (one Reflect bot, per-user chat_id linking)
```

### 3.2 Database — Core Tables (canonical list)

**Identity & access**
- `profiles` (id, email, full_name, avatar_url, role_id, is_creator, telegram_chat_id, telegram_linked_at, locale, created_at)
- `roles` (id, key, level, name, is_admin)
- `invitations` (id, email, role_id, invited_by, token, expires_at, accepted_at)

**Work**
- `projects` (id, name, client_id, phases[] text[], requires_expertise, expertise_deadline, payment_buffer_days, deadline, start_date, status, created_by, created_at, archived_at)
- `tasks` (id, project_id, title, description, status, parent_task_id, task_level, assignee_ids uuid[], start_date, deadline, estimated_duration, duration_unit, risk_buffer_pct, is_expertise_subtask, workload, workload_calculated_at, cancel_reason, archived_at, created_by)
- `task_status_history` (id, task_id, from_status, to_status, changed_by, changed_at)
- `task_comments` (id, task_id, user_id, body, mentions uuid[], created_at)

**Clients / CRM**
- `clients` (id, name, company, email, phone, pipeline_stage, confidence_pct, expected_value, last_interaction_at, ai_icp_fit, ai_icp_calculated_at, created_by)
- `client_stage_history` (id, client_id, from_stage, to_stage, changed_by, changed_at, lost_reason)
- `client_interactions` (id, client_id, type, note, occurred_at, logged_by)

**Finance**
- `incomes` (id, project_id, client_id, amount, payment_method, occurred_at, invoice_number, note, created_by)
- `expenses` (id, project_id, category, amount, vendor, occurred_at, note, created_by, recurring_rule_id)
- `recurring_expenses` (id, label, amount, period, next_run_at)
- `outsource_items` (id, project_id, work_title, contact_person, contact_company, amount, paid_at, payment_method, responsible_user_id, deadline, status)
- `outsource_user_view` (Postgres view exposing outsource_items WITHOUT amount/paid_at/payment_method to non-admins)
- `receivables` (id, client_id, project_id, amount, due_at, paid_amount, status)
- `cash_forecasts` (id, generated_at, horizon_days, projected_balance, confidence_low, confidence_high, generated_by)

**Documents**
- `project_documents` (id, project_id, client_id, category, title, source enum('drive_link','auto_generated','upload'), external_link, storage_path, share_token, shared_with[], created_by, created_at)  ← absorbs the legacy Sənəd Arxivi
- `templates` (id, category, name, body, variables jsonb, mime_type, created_by)
- `retrospective_surveys` (id, project_id, client_id, share_token, sent_at, responded_at, nps_score, ratings jsonb, comment)
- `closeout_checklists` (id, project_id, items jsonb, completed_at)
- `portfolio_workflows` (id, project_id, selected_awards uuid[], website_published_at, press_release_sent, applications jsonb)
- `system_awards` (id, name, organizer, deadline_month, url, criteria)

**Communication**
- `announcements` (id, title, body, category, cover_url, is_featured, mirai_generated, approved, approved_by, created_by, published_at, read_by jsonb)
- `calendar_events` (id, title, description, starts_at, ends_at, all_day, recurrence_rule, location, meet_url, organizer_id, attendees uuid[], external_emails text[], project_id, created_at)
- `notifications` (id, user_id, kind, payload jsonb, read_at, created_at)

**AI**
- `mirai_conversations` (id, user_id, persona, started_at, last_message_at, archived_at)
- `mirai_messages` (id, conversation_id, role, content, tokens_in, tokens_out, cost_usd, tools_used jsonb, created_at)
- `mirai_usage_log` (id, user_id, period_yyyymm, tokens_in, tokens_out, cost_usd)
- `knowledge_base` (id, source_pdf, chunk_index, content, embedding vector(1536), uploaded_by, uploaded_at)
- `mirai_feed_posts` (id, source_url, source_kind enum('trend','opportunity'), summary, deadline_at, fetched_at, posted_announcement_id)

**System**
- `okrs` (id, scope enum('company','personal'), employee_id NULL, period, objective, owner_id, created_at)
- `key_results` (id, okr_id, title, metric_type, current_value, target_value, unit, updated_at)
- `system_settings` (key, value, updated_by, updated_at)
- `activity_log` (id, entity_type, entity_id, user_id, action, field_name, old_value, new_value, created_at)
- `audit_log` (id, actor_id, action, resource, ip, user_agent, created_at)
- `equipment` (id, name, kind, serial, assigned_to, condition, purchased_at, notes)

### 3.3 Auth
- Supabase Auth (email/password + magic-link reset)
- JWT, auto-refresh
- Session 7 days, idle timeout 24h
- All `/api/*` endpoints verify `Authorization: Bearer <jwt>` server-side; DB role lookup, not header trust
- `ADMIN_EMAILS` env var deprecated — role from `profiles.role_id` only

### 3.4 Real-time
Supabase Realtime channels:
- `tasks:project_id=<uuid>` → status changes broadcast
- `activity_log` → Dashboard feed
- `announcements` → unread badge updates
- `mirai_messages:conversation_id=<uuid>` → streaming surface for handoff

### 3.5 Performance Budgets
| Surface | Metric | Target |
|---|---|---|
| Web | LCP | ≤1.5s on Vercel CDN |
| Web | TTI | ≤2.5s on 4G mid-tier mobile |
| API | p50 | ≤80ms |
| API | p95 | ≤200ms |
| MIRAI | first token | ≤800ms |
| MIRAI | end-to-end (short query) | ≤4s |
| Realtime | task event delivery | ≤500ms p95 |

---

## 4. Navigation Contract (final structure)

```
İŞ
├── Dashboard          (admin/user variants)
├── Layihələr          (admin: financials; user: no financials)
├── Tapşırıqlar
├── Arxiv              (admin: all; user: own tasks/projects only)
└── Podrat İşləri      (admin: amounts; user: operational view)

MÜŞTƏRİLƏR             (admin only)
└── Müştərilər

MALİYYƏ MƏRKƏZİ        (admin only)
└── Maliyyə Mərkəzi

KOMANDA
├── İşçi Heyəti
├── Əmək Haqqı         (admin: all; user: own salary)
├── Performans         (admin: all; user: self, all years)
├── Məzuniyyət
├── Təqvim
├── Elanlar            (MIRAI feed + manual posts)
└── Avadanlıq

ŞİRKƏT
├── OKR                (admin: company + everyone; user: self only)
├── Karyera Strukturu  (admin: edit; user: read + promotion path)
└── Məzmun Planlaması  (admin only)

SİSTEM                  (admin only)
└── Parametrlər
    ├── Ümumi
    ├── Şablonlar
    ├── Bilik Bazası   (legacy Qaynaqlar PDFs + MIRAI RAG sources)
    ├── Bildirişlər
    └── Dəvətlər       (invite management — REQ-AUTH-02)
```

**Removed from nav:** Sənəd Arxivi (data → `project_documents`), Qaynaqlar (PDFs → Parametrlər/Bilik Bazası), Tamamlandı (merged into Arxiv flow).
**Moved:** Arxiv from System group → İŞ group.
**MIRAI:** Not a sidebar nav group — accessed via Dashboard quick-launch button (REQ-DASH-01) and directly via `/mirai` route.
**Telegram:** Not a sidebar nav item — Telegram linking lives in `/profil` (REQ-AUTH-03).

**Rule:** Removing a nav item NEVER drops the underlying table. See §10.

---

## 5. Module Specifications

> Each module: purpose → entities → user stories with acceptance criteria → RLS → edge cases.

### MODULE 1 — Authentication & Onboarding

**REQ-AUTH-01 — Login**
- Email + password via Supabase
- Invalid → inline field error
- Reset → magic link email (Resend)
- Session 7d, idle 24h
- Failed login: 5 attempts/15 min/IP → 429

**REQ-AUTH-02 — Invite-only registration**
- Creator/Admin invites by email + role
- Invitation token expires 48h
- Pending invitations listed; revoke supported
- On accept: `profiles` row created, `role_id` assigned

**REQ-AUTH-03 — Profile**
- Each user manages: avatar, full_name, locale (az/en/ru), telegram_chat_id (linking flow → §8.1)
- Email/role: admin only

**RLS:**
- `profiles`: select all rows authenticated; update only `auth.uid() = id` or admin
- `invitations`: admin only

**Edge cases:**
- Re-invite same email (existing pending) → reuse and bump expiry
- Deactivated user: `is_active = false` blocks login but preserves history

---

### MODULE 2 — Dashboard

**Variants:** admin Dashboard (firm-wide) / user Dashboard (self-focused).

**REQ-DASH-01** Admin sees: active projects health, team workload, deadlines ≤14d, 50 latest activity entries (Realtime), MIRAI quick-launch.
**REQ-DASH-02** User sees: own tasks today/this-week, own deadlines, unread announcements, upcoming meetings, personal OKR progress.
**REQ-DASH-03** Activity feed filter: All / Tasks / Projects / Finance / Clients (client-side).
**REQ-DASH-04** Task health colors: green ≥14d, amber <14d, red <3d or overdue.
**REQ-DASH-05** Empty states designed per widget (text only — visual lives in design-system spec).
**REQ-DASH-06** **Presence panel** required on both admin and user dashboards — shows all team members with online/away/offline status, current page label, last seen timestamp. Specs: see REQ-PRESENCE-01..05 in §10.5.1.
**REQ-DASH-07** **Focus Mode widget** required on both admin and user dashboards — chameleon mascot Pomodoro timer, configurable intervals, personal-only data. Specs: see REQ-FOCUS-01..06 in §10.5.2.
**REQ-DASH-08** Finance widget (Gəlir/Xərc/Balans) **removed from dashboard** per product decision (2026-05-05) — finance data lives entirely in Maliyyə Mərkəzi (REQ-FIN-*). Dashboard remains role-agnostic for headline metrics; admin-only finance access governed by Maliyyə Mərkəzi RLS, not dashboard widget visibility.

**RLS:** widget aggregates check `is_admin()` server-side where applicable; non-admins receive `0` masked values rather than NULL to keep the API contract uniform. Presence + Focus widgets bypass admin gating (visible to all roles per REQ-PRESENCE-01 and REQ-FOCUS-01).

---

### MODULE 3 — Layihələr (Projects)

**Entities:** `projects`, `tasks` (project_id), `closeout_checklists`, `portfolio_workflows`.

**REQ-PROJ-01** Create project: name, client (select/create inline), `phases[]` (Konsepsiya/SD/DD/CD/Tender/İcra nəzarəti), start_date, deadline, requires_expertise, expertise_deadline, payment_buffer_days (default 10).

**REQ-PROJ-02** Backward-planned timeline when `requires_expertise = true`:
```
design_deadline = expertise_deadline
                  − payment_buffer_days (default 10)
                  − 30 (expertise wait)
                  − 10 (revision)
                  − 3  (print prep)
```
Working-days mode is a v2 toggle; v1 = calendar days.

**REQ-PROJ-03** Project detail tabs: Overview / Tasks / Documents (`project_documents`) / Finance (admin only) / Closeout / History.

**REQ-PROJ-04** Closeout flow: built-in checklist (akt imzalandı, final sənədlər, arxiv, portfel, retrospektiv sorğu). All checked → "Layihəni Tamamla" → `status = closed`, portfolio workflow row created.

**REQ-PROJ-05** Award/portfolio submission: pick from `system_awards` (5 seeded), per-award checklist, deadline indicator with days remaining.

**REQ-PROJ-06** **Schema migration safety:** legacy `phase` (singular) consolidated into `phases[]`. Migration runs additive: `phases[]` populated from `phase`, both kept until parity test passes 14 days, then `phase` renamed `_deprecated_phase`.

**RLS:**
- `projects` SELECT: assigned team_members + admin
- Financial fields exposed via `projects_admin_view`; non-admins query `projects_user_view` (no amount columns)

**Edge cases:**
- Project with no tasks → closeout still allowed (warning surfaced)
- Reopen closed project: admin only; appends `reopened_at`

---

### MODULE 4 — Tapşırıqlar (Tasks)

**Status model (7):**
```
İdeyalar      backlog
başlanmayıb   queued
İcrada        active
Yoxlamada     review
Ekspertizada  expert review pending
Tamamlandı    done
Cancelled     cancelled (with reason)
```

**REQ-TASK-01** Quick create (title only) + full create modal (title, assignee_ids[], project, start_date, deadline, estimated_duration, duration_unit, risk_buffer_pct, is_expertise_subtask, task_level, parent_task_id).

**REQ-TASK-02** Multi-assignee — `assignee_ids uuid[]` replaces legacy single `assignee_id`. Migration: copy → drop column renamed `_deprecated_assignee_id` (per §10).

**REQ-TASK-03** Drag between status columns → status update + `task_status_history` row + `activity_log` entry.

**REQ-TASK-04** Cancellation requires reason from list `[Müştəri imtina etdi | Layihə dəyişdi | Texniki problem | Yenidən planlaşdırılır | Digər (with text)]`.

**REQ-TASK-05** Subtask completion blocking: parent task cannot move to Tamamlandı while any child is open. Modal shows blockers and offers "Hamısını tamamla" shortcut.

**REQ-TASK-06** Workload formula:
```
workload = estimated_duration × (1 + risk_buffer_pct/100)
```
`workload_calculated_at` updated on save.

**REQ-TASK-07** Mention `@userId` format inside `task_comments.body`; `mentions[]` populated server-side via parser; mentioned users notified (in-app + Telegram if linked).

**REQ-TASK-08** Archive: tasks `Tamamlandı`/`Cancelled` → `archived_at = now()`. Hidden from board, surfaced in Arxiv module (see Module 5).

**REQ-TASK-09** Expertise subtasks auto-suggested when `is_expertise_subtask = true`:
- Çertyoj hazırlığı / Spesifikasiya / Möhür+imza / Çap+ciltləmə / Ekspertizaya təhvil

**RLS:** `tasks` SELECT: project members + admin. Comments visible to anyone with task SELECT.

**Edge cases:**
- Reassign last assignee → must replace, not empty
- Bakı timezone: all `*_at` stored UTC; UI renders Asia/Baku

---

### MODULE 5 — Arxiv

**Lives under İŞ.** Read-only view of:
- `tasks` where `archived_at IS NOT NULL`
- `projects` where `status = 'closed'`

**REQ-ARC-01** Filters: by project / assignee / date range / status.
**REQ-ARC-02** "Restore" admin-only → clears `archived_at` / reopens project.
**REQ-ARC-03** User scope: own tasks + projects they were on. Admin: everything.

---

### MODULE 6 — Müştərilər (Clients / CRM)

**Pipeline (8 stages):**
```
Lead          10%
Təklif        30%
Müzakirə      50%
İmzalanıb     75%
İcrada        95%
Portfolio     100%
Udulan         0%
Arxiv          —
```

**REQ-CRM-01** Pipeline kanban with drag → `client_stage_history` entry; "Udulan" requires `lost_reason`.
**REQ-CRM-02** Pipeline value per stage: `Σ(expected_value × confidence_pct/100)`.
**REQ-CRM-03** Quick interaction log (≤30s): type (Zəng/Email/Görüş/WhatsApp), free text, date.
**REQ-CRM-04** AI ICP enrichment via MIRAI (cached `ai_icp_fit` until inputs change; refresh max 1×/24h/client).
**REQ-CRM-05** Slide-in detail panel (no full-page nav); sections: overview, interactions, proposals, projects, documents.
**REQ-CRM-06** Proposals = `project_documents` rows with `category='price_protocol'`, optional `project_id`. Share token enables public read-only access.
**REQ-CRM-07** Retrospective survey: triggered from closeout, public form, NPS 0–10 + per-category 1–5 stars + free text.

**RLS:** `clients` admin-only by default. BD Lead role (level 3) granted SELECT/INSERT but NOT financial fields (`expected_value`).

---

### MODULE 7 — Maliyyə Mərkəzi (Finance)

**Single page, 6 tabs:**
1. Cash Cockpit (sticky top bar with current balance)
2. P&L (project-level + firm-level)
3. Outsource (admin amounts; users: hidden via view)
4. Xərclər (one-off + recurring)
5. Debitor (receivables)
6. Forecast (MIRAI 30/60/90d)

**REQ-FIN-01** "+ Gəlir" modal: amount, project, client, payment_method, date, invoice_number, note. On save → `incomes` row + activity_log + receivable status sync.
**REQ-FIN-02** Receivable overpayment validation: `paid_amount` cannot exceed `amount`. Excess flagged, blocks save.
**REQ-FIN-03** `markPaid` partial fix: supports partial payments (`paid_amount += delta`), updates `status` only when fully paid.
**REQ-FIN-04** Negative-amount validation across `incomes`, `expenses`, `outsource_items`: `amount > 0` check at DB and form layers.
**REQ-FIN-05** Sabit (recurring) xərclər: format normalized — `recurring_expenses` table, period enum (`weekly|monthly|quarterly|yearly`), `pg_cron` materializes monthly entries into `expenses`.
**REQ-FIN-06** Project P&L view: per-project income, direct expenses, outsource costs, net.
**REQ-FIN-07** Outsource hybrid workflow: status transitions Sifariş → İcra → Təhvil → Ödənildi. Users can update operational status without seeing amounts.
**REQ-FIN-08** Forecast: MIRAI persona "Maliyyə Analitiki" computes `cash_forecasts` row daily (cron) for horizons 30/60/90; UI displays latest with confidence range and disclaimer.
**REQ-FIN-09** Bakı timezone fix: all date math (month boundaries, due dates) computed in `Asia/Baku` not UTC.

**RLS:**
- `incomes`, `expenses`, `outsource_items`, `receivables`, `cash_forecasts`: admin only
- `outsource_user_view`: returns project, work_title, deadline, status, responsible_user_id ONLY (no money fields) — granted to authenticated

---

### MODULE 8 — Komanda

#### 8.1 İşçi Heyəti
List of `profiles`, role, contact, equipment count, current workload.

#### 8.2 Əmək Haqqı
- `salaries` (id, employee_id, amount, currency, effective_from, effective_to, components jsonb)
- Admin sees all; user sees own only (RLS by `auth.uid() = employee_id`)

#### 8.3 Performans
- Yearly performance gauges per employee
- Activates from year 2026 onward
- User sees self for all years; admin sees all
- `performance_reviews` (id, employee_id, year, score, ratings jsonb, reviewer_id, summary)

#### 8.4 Məzuniyyət
- `leave_requests` (id, employee_id, kind, starts_at, ends_at, days, status, approver_id, note)
- Workflow: request → admin approve/deny → calendar event auto-created on approve

#### 8.5 Təqvim — see §8 Integrations (Google Calendar parity)

#### 8.6 Elanlar
- Manual posts + MIRAI auto-posts (`mirai_generated = true, approved = false` until admin approves)
- Categories: Xəbər / Hadisə / Siyasət / Layihə / Trend (MIRAI) / Opportunity (MIRAI) / Digər
- Unread tracking via `read_by jsonb` keyed by user_id
- "Hamısını oxunmuş işarələ" bulk action

#### 8.7 Avadanlıq
- `equipment` table; assign/unassign, condition log, transfer history

---

### MODULE 9 — Şirkət

#### 9.1 OKR
- Company OKR (admin only)
- Personal OKR (user sees own; admin sees all)
- Weekly nudge via MIRAI if no update in 7 days
- Health: On Track ≥70%, At Risk 40–69%, Off Track <40%

#### 9.2 Karyera Strukturu
- `career_levels` (id, name, level_index, requirements jsonb)
- Admin edits; users read + see promotion path from current level → next

#### 9.3 Məzmun Planlaması
- Editorial calendar for marketing/social posts (admin only)
- `content_plans` (id, channel, scheduled_at, topic, owner_id, status, body)

---

### MODULE 10 — Sistem / Parametrlər

#### 10.1 Ümumi
- Firm name, logo, default currency, working hours, AZ holidays
- `system_settings` key/value

#### 10.2 Şablonlar
- Letter, invoice, act, survey templates
- Variable system `{{variable_name}}` with auto-fill registry
- Excel/Word export support

#### 10.3 Bilik Bazası
- Replaces legacy "Qaynaqlar" nav
- Admin uploads PDFs (AZ construction law, AZDNT normatives)
- Pipeline: PDF → text extraction → chunk → embed → `knowledge_base` row
- Used by MIRAI RAG (Hüquqşünas persona)

#### 10.4 Bildirişlər
- Per-channel toggles (in-app, email, Telegram)
- Per-event toggles (deadlines, mentions, status changes, finance alerts, MIRAI feed)
- Stored in `notification_preferences (user_id, channel, event_kind, enabled)`

---

## 6. Cross-Cutting Requirements

### 6.1 Universal Activity Log
Every create/update/delete on tasks, projects, clients, incomes, expenses, outsource_items, calendar_events → `activity_log` entry via DB trigger:
```
entity_type, entity_id, user_id, action, field_name, old_value, new_value, created_at
```
Surfaced on Dashboard feed (admin) and project History tab.

### 6.2 Cmd+K Universal Search
Server endpoint `/api/search?q=...` searches across: tasks, projects, clients, documents, announcements, team members. Returns top 8 grouped. Keyboard-first: arrows + Enter.

### 6.3 Keyboard Shortcuts
```
Cmd/Ctrl + K   global search
Cmd/Ctrl + N   new task (context-aware)
Cmd/Ctrl + /   open MIRAI
G then D/T/P/M/F   navigate Dashboard/Tasks/Projects/Müştərilər/Maliyyə
Escape   close modal/panel
```

### 6.4 Notifications
Pluggable channel system: in-app (default), email (Resend), Telegram. Each notification = `notifications` row + dispatch fan-out per user preferences.

### 6.5 i18n
Primary AZ. Strings in `locales/az.json`. EN/RU stubs for future. All dates in Asia/Baku display TZ.

### 6.6 Accessibility
- WCAG 2.1 AA color contrast (verified in design-system spec)
- Full keyboard navigability
- ARIA labels on all interactive non-button elements
- Screen reader announcements for Realtime updates

### 6.7 Empty / Loading / Error states
- Empty: AZ message + primary CTA per page
- Loading: skeleton matching layout
- Error: toast for transient, inline for validation, full-page for 500. Generic copy ("Xəta baş verdi"); details only in dev/admin diagnostics.

### 6.8 Avatars
Circular, initials fallback on deterministic gradient. Stack max 3 + "+N".

---

## 7. MIRAI (AI Assistant)

### 7.1 Architecture
- Provider: Anthropic Claude **Haiku 4.5** (`claude-haiku-4-5-20251001`)
- Pricing assumption: $0.25/1M input, $1.25/1M output
- Hard cap: $5/user/calendar-month → ~4M input tokens/user/month
- Streaming via SSE over `/api/mirai/chat`
- Server-side key only — never to client
- All requests authenticated; `user_id` logged per response (audit)

### 7.2 Personas
**Admin (6):** Əməliyyat Direktoru / Layihə Mühəndisi / Hüquqşünas (RAG) / Marketinq Direktoru (CMO) / Maliyyə Analitiki / Strateq.
**User (1):** Komanda Köməkçisi.

Persona switch starts a new conversation context; history not carried across personas.

### 7.3 Privacy Filter (mandatory, DB-level)
Every MIRAI tool call wraps the user's session JWT and queries via Supabase with that JWT. RLS enforces scope. The application layer additionally:
- Strips financial figures from any non-admin context
- Removes other-user PII unless admin
- Logs `tools_used` per message for audit

### 7.4 RAG
- `knowledge_base` (chunk + 1536-d embedding)
- Question → embed → cosine top-5 → inject into context with source labels
- Citations appended: `Mənbə: <pdf_name>, Maddə X.Y.Z`
- Empty result → MIRAI must reply: "Bu məsələ üzrə dəqiq məlumatım yoxdur."

### 7.5 Tool Layer
Whitelisted tools (server-executed, scoped by user role):
- `list_my_tasks`, `list_my_projects`
- `create_task` (current user as creator)
- `summarize_project` (project_id must be in user's scope)
- `firm_finance_snapshot` (admin only)
- `search_knowledge_base`
- `post_announcement_draft` (admin only — feeds Elanlar approval queue)

### 7.6 Cost Guardian
- Per-message: refuse if estimated cost would exceed remaining monthly budget
- 80% of budget → warning banner
- 100% → chat disabled until next calendar month, message shown
- Creator exempt from limit
- Daily cron rolls usage into `mirai_usage_log`

### 7.7 Context Engine
System prompt injects: today's date (Asia/Baku), user role, active projects (names+phases+deadlines), open task count, persona-specific extras.

### 7.8 CMO → Elanlar Cron
Weekly Vercel cron: fetch ArchDaily / Dezeen / Architizer / WAF RSS + award calendars → MIRAI CMO summarizes & filters (architecture + AZ/regional relevance) → inserts `mirai_feed_posts` and creates `announcements` row with `mirai_generated=true, approved=false`. Admin moderation queue gates publication.

### 7.9 Performance Tracking
- Token usage per persona per week
- Avg response latency
- Refusal rate (tool denied / over-budget)
- User satisfaction thumbs (`mirai_feedback` table)

---

## 8. Integrations

### 8.1 Telegram
- Single Reflect bot
- Linking flow: user opens "Telegram-ı qoş" → bot deep link with one-time code → bot sends code → user pastes back → server verifies and stores `telegram_chat_id`
- **Old direct-bot scripts removed.** Replaced by in-app onboarding.
- Notifications:
  - Task deadlines: D-3, D-1, D-day
  - Mentions
  - Status changes on assigned tasks
  - Finance alerts (admin/creator only): income > X AZN, expense > Y AZN, overdue receivables (X/Y in `system_settings`)
- All financial Telegram messages route ONLY to admin chat IDs.

### 8.2 Calendar (Google Parity)
| Capability | v1 implementation |
|---|---|
| Views | Month / Week / Day |
| Email invite | `.ics` attached + `mailto:` link (no Google API needed) |
| Google Meet link | Button opens `https://meet.new`; user pastes link to event |
| External attendees | `external_emails text[]` on event; `.ics` includes them |
| Internal notify | In-app + Telegram (if linked) |
| Recurring | RFC 5545 via `recurrence_rule` |
| Multi-day | Already supported by `starts_at`/`ends_at` |

**v2 (post-PMF):** OAuth Google Calendar API for native Meet link generation and 2-way sync.

### 8.3 Google Drive
- Documents support `external_link` to Drive/Dropbox
- No OAuth in v1 — link only

### 8.4 Email (Resend)
- Transactional only: invitations, password reset (via Supabase), survey links, share-token notifications, MIRAI usage warnings

### 8.5 RSS Feeds (MIRAI CMO)
- ArchDaily, Dezeen, Architizer, WAF — fetched server-side weekly
- HTML stripped, summary generated, deadline parsed if present

---

## 9. Non-Functional Requirements

### 9.1 Security (mandatory)
- **RLS on every table.** No `DISABLE ROW LEVEL SECURITY` — ever.
- Policies use `auth.uid()` + `roles.level`. Blanket `authenticated` grants forbidden.
- Financial tables (`incomes`, `expenses`, `salaries`, `outsource_items`, `receivables`, `cash_forecasts`) **no SELECT for non-admin** under any condition.
- Every new table requires policies before deploy (CI check: `psql -f rls_audit.sql` fails build if a table has no policy).
- All `/api/*`: JWT verified server-side, role re-checked from DB. Client claims not trusted.
- Rate limits: 100 req/min admin, 30 req/min user, 10 req/min anonymous. Implementation: Upstash Redis sliding window per IP+user.
- Input sanitization: zod schemas at API boundary; parameterized queries only; HTML sanitization for rich text (DOMPurify).
- Secrets: never in repo; only via Vercel/Supabase env vars; `VITE_*` prefix indicates safe-for-client.
- `console.log` stripped in production builds.
- Errors to users are generic; stack traces hidden in prod; full details to `audit_log` and Sentry.
- MIRAI: API key server-side; tool layer scoped; user_id audit per response; RAG cannot return chunks containing other firms' data (single-tenant in v1, but enforced by upload tagging).
- Telegram: financial messages only to admin chat IDs.
- Dependency hygiene: `npm audit` weekly cron; high/critical → block deploy until patched.

**Mandatory question for every new feature:** *"Can someone who shouldn't see this data see it?"* If yes → fix before deploy.

### 9.2 Performance
See §3.5. Verified via:
- Vercel Analytics (LCP/TTI)
- Supabase query insights (p50/p95)
- MIRAI custom metrics (`mirai_messages` durations)

### 9.3 Reliability
- Backups: Supabase daily PITR + weekly `pg_dump` to off-site bucket
- Manual `pg_dump` taken before every schema migration
- Migrations: every up + down; CI rejects PRs without `down()`
- Parity tests pre-deploy (counts, sums) for any rename/migration. Failing parity blocks deploy.
- Health checks: `/api/health` returns DB + AI provider status

### 9.4 Observability
- **Sentry** for frontend + serverless errors
- **Logflare/Vercel logs** for `/api/*`
- **Supabase logs** for DB
- **MIRAI cost dashboard** in admin Sistem → Bildirişlər
- **Audit log** for any privileged action (role change, RLS policy change, settings.update)

### 9.5 Browser Support
Latest 2 versions of Chrome, Edge, Safari, Firefox. iOS Safari 16+. No IE.

---

## 10. Data Lifecycle & Migration Discipline (NO DATA LOSS)

### 10.1 Pre-change protocol
1. `pg_dump` backup, dated, stored locally + off-site
2. Migration written with `up()` AND `down()`
3. Parity SQL written

### 10.2 Forbidden operations
```sql
-- NEVER:
DROP TABLE x;
DROP COLUMN y;

-- INSTEAD:
ALTER TABLE x RENAME TO _archived_x_<yyyymm>;
ALTER TABLE t RENAME COLUMN y TO _deprecated_y;
```

### 10.3 Additive feature pattern
- New table created in parallel with old
- Data backfilled
- `VIEW` unifies if needed
- Code reads from `VIEW` only
- Old table renamed `_archived_*` after 14d parity green

### 10.4 Pre-deploy parity test
```sql
SELECT COUNT(*), SUM(amount) FROM old_table;
SELECT COUNT(*), SUM(amount) FROM new_view;
-- mismatch → deploy blocked
```

### 10.5 Visual audit per changed page
- All old records visible?
- All filters work?
- Each old record detail opens?
- Before/after screenshot pair stored in PR

### 10.6 Nav removal ≠ data deletion
- `HesabFakturalarPage` removed from routes → table preserved
- Qaynaqlar removed from nav → PDFs migrated to Bilik Bazası, old table preserved
- Sənəd Arxivi removed from nav → data migrated to `project_documents`, old table renamed `_archived_document_archive_2026`

---

## 10.5 Presence + Focus Mode (PRD v3.8 addendum)

### 10.5.1 Presence (REQ-PRESENCE-*)

**REQ-PRESENCE-01 — Online status visible to all team members**
- Each authenticated user has presence state: `online | away | offline`
- Visible to ALL team members (manager and member roles), not admin-restricted — fosters team awareness
- Updates via Supabase realtime channel; no polling

**REQ-PRESENCE-02 — Status semantics**
- `online`: active session within last 60 seconds (heartbeat)
- `away`: session active but no input for ≥5 min OR tab not focused for ≥3 min
- `offline`: heartbeat lost ≥90 seconds OR explicit logout
- Status displayed as colored dot: green / amber / gray

**REQ-PRESENCE-03 — Current location label**
- When `online`, show which page user is on: "Tapşırıqlarda" / "Layihələrdə" / "Maliyyədə"
- Privacy: page label only, no detail (e.g. not "Aksent Group profilində" — just "Müştərilərdə")
- Helps coordination: "Səbinə Tapşırıqlarda → mən rahat ona text edə bilərəm"

**REQ-PRESENCE-04 — Last seen timestamp**
- For `offline` users: "5 dəq əvvəl", "2 saat əvvəl", "Dünən 14:30", "3 gün əvvəl"
- Uses relative time within 7 days, absolute after

**REQ-PRESENCE-05 — Mobile vs desktop session distinction**
- Track session type. UI may indicate mobile presence (📱) when applicable.
- Same user with multiple active sessions = single online state (highest priority wins)

**Data:** `user_presence` table — `user_id, status, last_heartbeat_at, current_page, session_type`
**RLS:** all authenticated users can read; only system writes (via realtime channel + auth trigger)
**Performance budget:** ≤50ms p95 to render presence panel; realtime updates ≤2s end-to-end

### 10.5.2 Focus Mode (REQ-FOCUS-*)

**REQ-FOCUS-01 — Personal opt-in tool**
- Strictly personal — never visible to other team members
- No effect on time-tracking, billing, velocity calculations
- Pure motivational/wellness tool; failure to use carries no penalty

**REQ-FOCUS-02 — Configurable intervals**
- Presets: 25/5, 40/20 (default), 50/10, 90/15
- Custom values: 15-180 min work, 5-30 min break

**REQ-FOCUS-03 — Chameleon mascot growth**
- Mascot displays growth stage 1→4 during work session (egg → baby → juvenile → adult chameleon)
- Visible only to the user themselves
- Session interruption returns mascot to start; no "death" animation (avoid anxiety reinforcement in work tool)

**REQ-FOCUS-04 — Local-first state**
- Session state persists in localStorage; survives page reload
- Optional cloud sync (per-user table `focus_sessions` for personal stats only)
- Stats: sessions per day/week, total focused time, longest streak

**REQ-FOCUS-05 — Notification**
- Browser notification on session/break end (if permission granted)
- Optional sound: chameleon-themed click (designed audio cue, not mimicking real animal voice)
- Mute toggle in settings

**REQ-FOCUS-06 — Dashboard widget placement**
- Compact widget on dashboard (right column, lower bento)
- Click expands to full-screen focus mode (single-task focus surface)
- Hidden state preserved if user dismisses for current session

**Data:** `focus_sessions` (optional cloud persistence) — `user_id, started_at, planned_minutes, completed_at, interrupted, mascot_stage`
**RLS:** user can only read/write their own rows
**Out of scope (v1):** ambient sounds, achievement/streak rewards, multi-device session continuation — defer to v1.5

---

## 11. Release Plan

### 11.1 Sprint phases
**Part 1 — Təməl (foundation)**
- Design tokens, login redesign (UI track — separate doc)
- Sidebar dark + admin/user nav variants
- RLS role-based + creator status
- Sidebar URL bypass fix
- `api/agent.js` hardcoded email → DB lookup
- `assignee_id` → `assignee_ids[]` migration
- `HesabFakturalarPage` removed from routes
- `phase` → `phases[]` migration
- Mention `@userId` parser
- Universal `activity_log`
- Subtask → Done blocking modal
- Receivable overpayment validation
- `markPaid` partial fix
- Negative amount validation
- Bakı timezone fix
- Dashboard avatar + meeting + announcement widget

**Part 2 — Əsas Featurelər**
- Tapşırıqlar 7 status + migration
- Timesheet/day log UI
- Maliyyə Mərkəzi (8 pages → 1 + tabs)
- Cash Cockpit sticky top bar
- Project P&L
- Outsource hybrid workflow
- Forecast engine
- Recurring expenses format fix
- Müştəri lifecycle 8-stage pipeline
- Müştəri slide-in detail panel
- Workload estimator
- Retrospective survey
- Şablon Mərkəzi
- Qaynaqlar → Parametrlər/Bilik Bazası migration
- Sənəd Arxivi → `project_documents` migration
- Arxiv → İŞ group + RLS
- Cmd+K universal search
- Karyera Strukturu user promotion path
- Performance gauge + 2026 activation
- Salary user-self view
- OKR personal scope

**Part 3 — MIRAI + Telegram + Təqvim**
- Old Telegram bot scripts removed
- In-app Telegram onboarding (chat_id flow)
- MIRAI pop-up + persona router
- MIRAI privacy filter
- MIRAI context engine
- MIRAI tool layer
- MIRAI cost guardian
- MIRAI Telegram notifications
- MIRAI CMO → Elanlar cron
- MIRAI RAG engine + pgvector
- MIRAI performance tracking
- Calendar Month/Week/Day views
- Calendar `.ics` email invite
- Calendar `meet.new` integration

### 11.2 MoSCoW (cumulative)
**Must:** Auth, Roles+RLS, Projects, Tasks 7-status, Dashboard widgets (admin+user), Müştərilər pipeline, Maliyyə Mərkəzi income/expense, Activity log, Migrations §10.
**Should:** MIRAI basic chat (no RAG), Elanlar feed + MIRAI moderation, Documents + share token, Retrospective survey, Calendar Month/Week/Day, Telegram link + reminders.
**Could:** OKRs, MIRAI RAG, Portfolio + awards, Forecast, Excel/Word template generator, Karyera promotion path, Equipment.
**Won't (v1):** mobile native, time-tracking against tasks, video calls, client login portal, multi-firm tenancy, custom domains, Stripe firm billing, native Google Calendar OAuth (v2).

### 11.3 Definition of Done (every feature)
- [ ] Functional acceptance criteria met
- [ ] RLS policy in place + tested with non-admin user
- [ ] `up()` + `down()` migration; parity test green
- [ ] Activity log entries emitted where relevant
- [ ] Empty / loading / error states implemented
- [ ] Keyboard navigable
- [ ] AZ strings in `locales/az.json`
- [ ] Sentry error path verified (forced failure → captured)
- [ ] Pre/post screenshots for visual audit
- [ ] Manual test pass on Chrome + Safari
- [ ] PR description references requirement IDs

---

## 12. Out of Scope & Open Questions

### 12.1 Out of scope (v1.0)
- Native mobile app (web responsive only)
- Time tracking per task (timesheet exists at day-level only)
- Video calls / screen recording
- Client login portal (share-token only)
- Multi-firm / multi-tenant
- Per-firm custom domains
- Stripe firm-billing
- Native Google Calendar OAuth + Meet API (deferred to v2)
- Offline mode

### 12.2 Open questions
1. **MIRAI budget granularity:** firm-wide vs per-user? *Recommendation: per-user, $5/mo, simplest to communicate.*
2. **Working-day expertise calc:** AZ holiday calendar v1 or v2? *Recommendation: v1 calendar days; v2 working days.*
3. **Task project cardinality:** 1:1 or many:many? *Recommendation: 1:1 for v1; cross-project work duplicated.*
4. **Client identity for proposals:** share-token vs login? *Recommendation: share-token only v1.*
5. **Outsource specialist account creation:** invite (Level 5) vs anonymous link? *Recommendation: invite — keeps RLS clean.*
6. **MIRAI feed approval SLA:** auto-publish after N hours if admin doesn't act? *Decision pending.*

---

## 13. User Stories (Given/When/Then)

> Format: PRDold v2.0 compatible (`US-<MODULE>-NN`) with explicit Given/When/Then acceptance criteria. Each story cross-references the requirement IDs from §5. Stories are the source of truth for QA test cases.

### MODULE 1 — Auth (refs REQ-AUTH-01..03)

```
US-AUTH-01  Login with email + password
AS A team member
I WANT to log in with email and password
SO THAT I access the platform securely

Given valid credentials
  When I submit the login form
  Then I am redirected to my role-appropriate Dashboard within 500ms
  And my session is persisted for 7 days

Given invalid credentials
  When I submit
  Then an inline error appears under the password field
  And no Dashboard data is fetched

Given 5 failed attempts in 15 minutes from one IP
  When I retry
  Then I receive HTTP 429 with retry-after header
```

```
US-AUTH-02  Creator invites a team member
AS A creator
I WANT to invite a team member by email + role
SO THAT I control who accesses the platform

Given I am authenticated as Creator/Admin
  When I submit "Dəvət et" with email + role
  Then an invitation row is created with token + 48h expiry
  And the invitee receives a magic-link email
  And the pending invitation is listed in the admin panel

Given a pending invitation
  When I click "Revoke"
  Then the token is invalidated
  And subsequent magic-link clicks return "invitation expired"
```

```
US-AUTH-03  Reset forgotten password
AS A team member
I WANT to reset my password via email
SO THAT a forgotten password is not a blocker

Given I click "Şifrəni unutdum" and submit my email
  When the email exists in profiles
  Then a Supabase magic-link is dispatched (≤10s)
  And the response is identical (200) regardless of email existence (no enumeration)
  And the link expires in 30 minutes
```

```
US-AUTH-04  Update profile
AS A user
I WANT to edit my avatar, name, and locale
SO THAT my identity reflects me

Given I am on Profile
  When I update locale to "en"
  Then UI strings switch to English without a full reload
  And my role/email fields remain read-only
```

---

### MODULE 2 — Dashboard (refs REQ-DASH-01..05)

```
US-DASH-01  Director sees firm health at a glance
AS A studio director
I WANT to see active project health on Dashboard
SO THAT I catch risks early

Given I am admin and 5 projects are active
  When Dashboard loads
  Then I see each project with phase badge, completion %, deadline color (green ≥14d / amber <14d / red <3d or overdue)
  And clicking a project opens its detail page
  And empty state shows "Aktiv layihə yoxdur — Yeni layihə yarat" CTA when none exist
```

```
US-DASH-02  Member sees own work for today / this week
AS A team member
I WANT to see my tasks due today and this week
SO THAT I know what to work on

Given I have 12 open tasks
  When I open Dashboard with the "Bu gün" tab
  Then only tasks where deadline = today appear
  And overdue tasks render at the top in red
  And "Bu həftə" tab shows tasks where deadline ≤ end of week

Given I tick a task as Tamamlandı from Dashboard
  When the API succeeds
  Then the row removes with animation
  And an activity_log entry is emitted
```

```
US-DASH-03  Finance snapshot for current month
AS A finance manager
I WANT this-month income vs expense in one place
SO THAT I track liquidity daily

Given I am admin
  When Dashboard loads
  Then I see Gəlir / Xərc / Balans as tabular numerals
  And a trend indicator vs last month (↑/↓ + %)
  And clicking the widget navigates to Maliyyə Mərkəzi

Given I am a non-admin user
  When the Dashboard renders
  Then the finance widget is absent (RLS returns 0 rows; UI hides widget entirely)
```

```
US-DASH-04  Live activity feed
AS A studio director
I WANT a live activity feed without refreshing
SO THAT I stay informed passively

Given activity_log has 50 recent entries
  When Dashboard renders
  Then the feed shows the latest 50 with avatar, action, entity link, relative timestamp
  And filter pills (All/Tasks/Projects/Finance/Clients) work client-side
  And new entries appear at top via Realtime within 500ms p95
```

```
US-DASH-05  Team workload overview
AS A team lead
I WANT to see each team member's open task load
SO THAT I redistribute before burnout

Given the team has 8 members
  When I open the workload widget
  Then each member shows avatar + name + open task count
  And the bar is green (1–5), amber (6–9), red (10+)
  And clicking a member filters Tapşırıqlar to their assignments
```

---

### MODULE 3 — Layihələr (refs REQ-PROJ-01..06)

```
US-PROJ-01  Create a new project
AS AN architect
I WANT to create a project with all key details
SO THAT the team has one source of truth from day one

Given I open "Yeni Layihə"
  When I submit name, client, ≥1 phase, deadline
  Then the project is created with phases[] populated
  And it appears in the grid with entrance animation
  And requires_expertise + expertise_deadline + payment_buffer_days are stored if provided

Given I leave required fields empty
  When I attempt save
  Then field-level validation prevents submission
```

```
US-PROJ-02  Backward-planned expertise timeline
AS A project architect
I WANT a calculated design deadline when expertise is required
SO THAT I know the real internal cutoff

Given requires_expertise = true and expertise_deadline = 2026-06-30
  When the project loads
  Then design_deadline = 2026-06-30 − 10 (payment) − 30 (expertise) − 10 (revision) − 3 (print) = 2026-05-08
  And a red banner appears if design_deadline is < 14 days away
  And a timeline visualization shows each subtraction step
```

```
US-PROJ-03  Closeout checklist
AS A studio director
I WANT a closeout checklist when finishing a project
SO THAT nothing is missed

Given a project with status = active
  When I click "Layihəni Bağla"
  Then a drawer opens with default items (akt / final sənədlər / arxiv / portfel / retrospektiv sorğu)
  And each item is checkable inline
  And "Layihəni Tamamla" activates only when all are checked

Given all items are checked and I confirm
  When the API succeeds
  Then project.status = 'closed'
  And a portfolio_workflows row is created
```

```
US-PROJ-04  Submit to architecture awards
AS A studio director
I WANT to submit completed projects for awards
SO THAT I don't miss application deadlines

Given a closed project
  When I open Portfolio
  Then system_awards are listed and filterable by deadline_month
  And selecting awards saves to portfolio_workflows.selected_awards
  And per-award checklists track application progress
  And deadline indicator shows "Ağ Xan mükafatı — Mart (12 gün qaldı)"
```

```
US-PROJ-05  Reopen a closed project (admin)
AS A studio director
I WANT to reopen a closed project
SO THAT I correct mistaken closures

Given a project with status = 'closed' and I am admin
  When I click "Yenidən aç"
  Then project.status = 'active'
  And reopened_at timestamp is set
  And an activity_log entry is created
```

---

### MODULE 4 — Tapşırıqlar (refs REQ-TASK-01..09)

```
US-TASK-01  Create task with quick or full form
AS A project architect
I WANT to create tasks fast or in detail
SO THAT capture friction is minimal

Given I click "+" in the İcrada column
  When I type a title and press Enter
  Then a task is created in İcrada with creator = me

Given I open the full-create modal
  When I submit title + assignees + project + deadline + estimate + risk_buffer
  Then workload = estimated_duration × (1 + risk_buffer_pct/100) is computed
  And workload_calculated_at is stamped
```

```
US-TASK-02  Drag task between status columns
AS A team member
I WANT to drag tasks between status columns
SO THAT updates are instant and visual

Given a task in İcrada
  When I drag to Yoxlamada and drop
  Then status updates to Yoxlamada
  And task_status_history + activity_log entries are created
  And other users on the same project receive Realtime update ≤500ms p95
```

```
US-TASK-03  Cancel a task with reason
AS A team member
I WANT to cancel a task with a reason
SO THAT historical context is preserved

Given I drag a task to Cancelled
  When the cancel dialog opens
  Then I must select from [Müştəri imtina etdi | Layihə dəyişdi | Texniki problem | Yenidən planlaşdırılır | Digər]
  And "Digər" requires a free-text reason
  And confirming sets status='Cancelled' and cancel_reason saved
  And the card is grayed visually
```

```
US-TASK-04  Subtask blocks parent completion
AS A project architect
I WANT parent tasks to wait for their subtasks
SO THAT incomplete work isn't marked done

Given a parent task with 2 open subtasks
  When I drag the parent to Tamamlandı
  Then a blocking modal lists the open subtasks
  And the parent stays in its current status
  And a "Hamısını tamamla" shortcut closes all children atomically
```

```
US-TASK-05  Mention a teammate in a comment
AS A team member
I WANT to @mention teammates in comments
SO THAT they are notified

Given I type "@" in a task comment
  When I select a teammate
  Then the comment body stores "@<userId>" format
  And mentions[] is populated server-side
  And the mentioned user receives in-app + Telegram (if linked) notification
```

```
US-TASK-06  My tasks focused view
AS A team member
I WANT a "Mənim Tapşırıqlarım" view
SO THAT I'm not overwhelmed by the team backlog

Given I open the personal view
  When tasks load
  Then they are filtered to assignee_ids contains auth.uid()
  And grouped: Overdue (red, top) / Today / This Week / Later
  And inline status update is supported (checkbox for Tamamlandı, dropdown for others)
```

```
US-TASK-07  Bulk archive completed and cancelled
AS A studio director
I WANT to archive done/cancelled tasks in one action
SO THAT the board stays clean

Given the board has 30 tasks in Tamamlandı or Cancelled
  When I click "Arxivlə" and confirm
  Then archived_at = now() is set on all 30
  And they disappear from the board
  And the Arxiv module shows them with restore option for admin
```

```
US-TASK-08  Expertise subtask suggestions
AS AN architect
I WANT typical expertise subtasks suggested
SO THAT I don't recreate the same checklist

Given I create a task with is_expertise_subtask = true
  When the modal renders
  Then suggested children appear:
    □ Çertyoj hazırlığı
    □ Spesifikasiya yazılması
    □ Möhür + imza
    □ Çap + ciltləmə
    □ Ekspertizaya təhvil
  And selecting them creates linked subtasks with parent_task_id set
  And each subtask carries the purple "E" badge marker (semantic, not visual spec)
```

---

### MODULE 5 — Arxiv (refs REQ-ARC-01..03)

```
US-ARC-01  Browse archived work
AS A team member
I WANT to browse archived tasks and projects
SO THAT I find historical context

Given I open Arxiv
  When the page loads
  Then I see tasks with archived_at IS NOT NULL plus closed projects
  And filters work by project / assignee / date range / status
  And as a non-admin I see only my own archived items
```

```
US-ARC-02  Restore archived item
AS A studio director
I WANT to restore an archived item
SO THAT mistakes are recoverable

Given an archived task and I am admin
  When I click "Restore"
  Then archived_at = NULL
  And the task reappears on the kanban
  And an activity_log entry records the restoration
```

---

### MODULE 6 — Müştərilər (refs REQ-CRM-01..07)

```
US-CRM-01  Track clients through pipeline
AS A BD lead
I WANT to drag clients across pipeline stages
SO THAT I know where each deal stands

Given a client at Müzakirə (50%)
  When I drag to İmzalanıb (75%)
  Then client_stage_history records (from='Müzakirə', to='İmzalanıb', changed_by=me)
  And confidence_pct updates to 75%
  And pipeline value totals refresh per stage

Given I drag to Udulan
  When the dialog opens
  Then lost_reason is required before save
```

```
US-CRM-02  Quick interaction log
AS A BD lead
I WANT to log a client interaction in under 30 seconds
SO THAT the CRM stays current

Given I open a client detail panel
  When I type a note + select type (Zəng/Email/Görüş/WhatsApp) + submit
  Then a client_interactions row is inserted with logged_by=me
  And the feed refreshes inline (no page reload)
  And clients.last_interaction_at updates
```

```
US-CRM-03  AI-enriched ICP fit
AS A studio director
I WANT MIRAI to score each client's ICP fit
SO THAT I prioritize high-value relationships

Given a client with ≥3 interactions and project history
  When I click "AI analiz"
  Then "AI is thinking..." state appears
  And within 10s ai_icp_fit ∈ {Excellent/Good/Medium/Low} is saved
  And ai_icp_calculated_at stamps the run
  And subsequent calls are throttled to 1×/24h per client
```

```
US-CRM-04  Slide-in detail panel
AS A BD lead
I WANT a slide-in panel for client details
SO THAT I don't lose the pipeline context

Given I click a client card
  When the panel opens from the right
  Then the pipeline view stays visible behind it
  And tabs: Overview / Interactions / Proposals / Projects / Documents work without full nav
  And Esc closes the panel
```

```
US-CRM-05  Generate a proposal linked to client
AS A BD lead
I WANT to create a proposal from the client panel
SO THAT proposals stay linked to the relationship

Given a client and I click "Təklif yarat"
  When I fill the form and save
  Then a project_documents row is created with category='price_protocol' and client_id linked
  And share_token is generated
  And proposal status = 'Draft'
  And "Linki paylaş" copies app.domain/docs/<share_token> to clipboard
```

```
US-CRM-06  Send retrospective survey on closeout
AS A studio director
I WANT to send NPS surveys after project completion
SO THAT I collect satisfaction data

Given a project closeout completes
  When I click "Sorğu göndər"
  Then a retrospective_surveys row is created with share_token
  And the client receives an email with the link
  And the public form (no auth) accepts NPS 0–10 + per-category 1–5 + comment
  And on submit responded_at + nps_score are saved
  And admin Dashboard updates average NPS
```

---

### MODULE 7 — Maliyyə Mərkəzi (refs REQ-FIN-01..09)

```
US-FIN-01  Log income on payment receipt
AS A finance manager
I WANT to log income in seconds
SO THAT books stay current

Given I click "+ Gəlir"
  When I submit amount > 0, project, client, payment_method, date
  Then an incomes row is created
  And an activity_log entry is emitted
  And if the amount matches an open receivable, it auto-marks it paid

Given amount ≤ 0
  When I attempt save
  Then validation blocks the submission with "Məbləğ müsbət olmalıdır"
```

```
US-FIN-02  Receivable overpayment guard
AS A finance manager
I WANT the system to reject overpayments
SO THAT books don't go negative on accident

Given a receivable with amount=10000 paid_amount=8000
  When I attempt to record payment of 5000
  Then the form rejects with "Ödəniş qalıq məbləği aşır"
  And no row is written
```

```
US-FIN-03  Partial payment via markPaid
AS A finance manager
I WANT to record partial payments
SO THAT real-world payment flow is supported

Given a receivable with amount=10000 paid_amount=4000 status='partial'
  When I record an additional 3000
  Then paid_amount becomes 7000
  And status remains 'partial'
  And only at paid_amount=10000 does status flip to 'paid'
```

```
US-FIN-04  Outsource amounts hidden from non-admins
AS A non-admin team member
I WANT to see outsource items I'm responsible for, without the amount
SO THAT operational coordination works without exposing money

Given I am responsible_user_id on an outsource_items row
  When I open Outsource via the user route
  Then outsource_user_view returns project, work_title, contact_person, deadline, status only
  And money columns (amount, paid_at, payment_method) are absent from the API payload
```

```
US-FIN-05  Recurring expense generation
AS A finance manager
I WANT recurring expenses to materialize automatically
SO THAT I don't forget rent / subscriptions

Given a recurring_expenses row with period='monthly' and next_run_at = today
  When the daily pg_cron runs
  Then a new expenses row is inserted with the recurring_rule_id linked
  And next_run_at advances to the next period
  And an activity_log entry is created
```

```
US-FIN-06  Project P&L
AS A studio director
I WANT a P&L per project
SO THAT I see profitability granularly

Given a project with 3 incomes, 5 expenses, 2 outsource_items paid
  When I open Maliyyə → P&L → drill into the project
  Then I see Gəlir, Birbaşa Xərclər, Outsource, Net (tabular numerals, AZN)
  And export to xlsx is available
```

```
US-FIN-07  AI-powered cash forecast
AS A studio director
I WANT a 30/60/90-day cash forecast
SO THAT I plan hiring and expenses proactively

Given ≥6 months of historical incomes/expenses
  When I open Forecast
  Then the latest cash_forecasts row renders projected balance with confidence_low/confidence_high
  And a disclaimer "Bu proqnoz son 6 ayın məlumatlarına əsaslanır" is shown
  And "Yenilə" is rate-limited to 1×/24h per user
```

```
US-FIN-08  Generate invoice from template
AS A finance manager
I WANT to generate an invoice from a template
SO THAT it's ready in under 60s

Given a template with variables {{client_name}}, {{amount}}, {{date}}, {{services}}
  When I select a project and fill missing variables
  Then a project_documents row is saved with source='auto_generated'
  And PDF + share-token link are produced
  And invoice_number is auto-incremented per fiscal year (format AZ-YYYY-NNNN)
```

---

### MODULE 8 — Komanda

#### 8.1 Salary (REQ-Komanda 8.2)
```
US-SAL-01  User views own salary
AS A team member
I WANT to see only my own salary
SO THAT my privacy is preserved

Given my salaries.employee_id = auth.uid()
  When I open Əmək Haqqı
  Then I see my current effective salary + history
  And no other employee row is fetched (RLS verified)
```

```
US-SAL-02  Admin manages salaries
AS AN admin
I WANT to set / update salaries
SO THAT compensation records stay accurate

Given I am admin
  When I update an employee's salary with effective_from = next month
  Then a new salaries row is inserted (no overwrite)
  And the previous row's effective_to is set to the day before
  And an audit_log entry is recorded
```

#### 8.2 Performance
```
US-PERF-01  User sees own performance gauges
AS A team member
I WANT to see my performance reviews across years
SO THAT I track my growth

Given performance_reviews exist for years 2026, 2027
  When I open Performans
  Then I see a gauge per year with score and ratings breakdown
  And no other employee data is visible
```

```
US-PERF-02  Admin reviews team performance
AS AN admin
I WANT to author performance reviews per employee
SO THAT formal reviews live in one place

Given I am admin
  When I submit a review (year, score, ratings, summary)
  Then a performance_reviews row is created with reviewer_id = me
  And the employee receives an in-app notification
```

#### 8.3 Leave
```
US-LEAVE-01  Request leave
AS A team member
I WANT to request leave
SO THAT my absence is approved and visible

Given I submit a leave request (kind, dates, note)
  When status defaults to 'pending'
  Then the approver (admin or my manager) receives a notification
  And the dates appear as "pending" on the team calendar (but not booked)
```

```
US-LEAVE-02  Approve leave
AS AN admin
I WANT to approve / deny leave
SO THAT planning is clear

Given a pending leave_request
  When I approve
  Then status='approved' and approver_id stamped
  And a calendar_events row is auto-created (kind='leave', attendees=[employee])
  And the requester receives in-app + Telegram notification
```

#### 8.4 Calendar
```
US-CAL-01  Create event with internal + external attendees
AS A team member
I WANT to create an event with internal teammates and external emails
SO THAT external collaborators are included

Given I open Yeni Hadisə
  When I add internal attendees + external_emails + recurrence_rule (RFC 5545)
  Then a calendar_events row is inserted
  And internal attendees receive in-app + Telegram notifications
  And external attendees receive an email with .ics attachment + mailto link
```

```
US-CAL-02  Add Google Meet link
AS AN organizer
I WANT to attach a Meet link to an event
SO THAT remote attendance works

Given I click "Meet yarat" on an event
  When meet.new opens in a new tab
  Then I copy the URL back to the event meet_url field
  And the saved event displays a "Görüşə qoşul" button to attendees
  And the .ics for external attendees includes the Meet URL
```

```
US-CAL-03  Switch calendar views
AS A team member
I WANT Month / Week / Day views
SO THAT I navigate at the right granularity

Given I am on Təqvim
  When I switch view modes
  Then events render correctly in each view
  And recurring events expand instances within the visible range
  And multi-day events span correctly
```

#### 8.5 Elanlar
```
US-ELAN-01  Publish manual announcement
AS AN admin
I WANT to publish announcements to the team
SO THAT important news reaches everyone

Given I am admin
  When I submit title + body + category (+ optional cover)
  Then an announcements row is created with mirai_generated=false, approved=true
  And all users see it on their next Dashboard render
  And Realtime pushes an unread badge update
```

```
US-ELAN-02  Approve MIRAI feed post
AS AN admin
I WANT to review MIRAI auto-feed posts before publication
SO THAT only relevant posts reach the team

Given a mirai_feed_posts entry with approved=false
  When I review and click "Saxla / Paylaş"
  Then announcements row is created with mirai_generated=true, approved=true, approved_by=me
  And it becomes visible to all users

Given I click "Rədd et"
  Then the post is hidden from the queue
  And no announcement is created
```

```
US-ELAN-03  Filter announcements by category
AS A team member
I WANT to filter announcements by category
SO THAT I find relevant info fast

Given I am on Elanlar
  When I click a category pill (Xəbər / Hadisə / Trend / Opportunity / Siyasət / Layihə)
  Then the list filters client-side without reload
  And the unread indicator persists per item
```

#### 8.6 Equipment
```
US-EQUIP-01  Assign equipment to a teammate
AS AN admin
I WANT to assign equipment to team members
SO THAT inventory ownership is tracked

Given I am admin
  When I select an equipment row and assign it
  Then assigned_to is updated
  And a history record is appended (transfer log)
  And the assignee receives an in-app notification
```

---

### MODULE 9 — Şirkət

#### 9.1 OKR
```
US-OKR-01  Admin sets company OKRs per quarter
AS AN admin
I WANT to set company OKRs per quarter
SO THAT the team has aligned objectives

Given I am admin
  When I create an OKR with scope='company', period='Q2 2026', objective + 3 key_results
  Then okrs row is created with employee_id=NULL
  And progress = average of key_results progress %
  And it is visible to all users (read-only for non-admin)
```

```
US-OKR-02  User updates personal OKR
AS A team member
I WANT to update my personal OKR progress
SO THAT my goals stay current

Given a personal OKR with scope='personal', employee_id=auth.uid()
  When I update a key_result current_value
  Then key_results.updated_at refreshes
  And progress recomputes
  And no other user can SELECT this row (RLS verified)

Given I have not updated in 7 days
  When the weekly cron runs
  Then MIRAI nudges me via in-app notification
```

```
US-OKR-03  Admin OKR health overview
AS AN admin
I WANT a team OKR overview
SO THAT I catch lagging objectives

Given I am admin and team OKRs exist
  When I open the OKR overview
  Then each member shows On Track (≥70%), At Risk (40–69%), Off Track (<40%)
  And clicking expands the personal OKRs of that member
```

#### 9.2 Karyera
```
US-CAREER-01  User views career path
AS A team member
I WANT to see my current level and the path to the next
SO THAT promotion criteria are transparent

Given I am at level "Mid Designer"
  When I open Karyera Strukturu
  Then I see my current level + requirements (read-only)
  And the next level "Senior Designer" with criteria checklist
  And criteria already met show a green check (e.g. "≥3 closed projects")
```

#### 9.3 Content
```
US-CONTENT-01  Plan content posts
AS AN admin
I WANT to plan editorial posts on a calendar
SO THAT marketing has a single calendar

Given I am admin
  When I create a content_plans entry (channel, scheduled_at, topic, owner, status='draft')
  Then it appears on the content calendar
  And owner receives a deadline reminder 2 days before scheduled_at
```

---

### MODULE 10 — Sistem / Parametrlər

```
US-SYS-01  Manage templates
AS AN admin
I WANT to author / version templates
SO THAT generated documents stay consistent

Given I am admin
  When I create / edit a template (category, body with {{variables}})
  Then the variable list is auto-extracted and stored in templates.variables
  And a preview renders with sample values
  And only admins can edit; users can use templates only

US-SYS-02  Upload PDF to Bilik Bazası
AS AN admin
I WANT to upload AZ law / AZDNT PDFs
SO THAT MIRAI's Hüquqşünas persona can cite them

Given I upload a PDF
  When the ingestion pipeline runs
  Then the file is text-extracted
  And chunks (≈500 tokens, 50 token overlap) are embedded via the configured model
  And rows are inserted into knowledge_base with source_pdf set
  And reuploading the same file replaces existing chunks (versioning)

US-SYS-03  Notification preferences
AS A team member
I WANT to choose which notifications I receive on which channel
SO THAT I'm not spammed

Given I open Parametrlər → Bildirişlər
  When I toggle "Telegram → Mention" off
  Then notification_preferences updates (user_id, channel='telegram', event_kind='mention', enabled=false)
  And subsequent mentions deliver only to in-app
```

---

### MODULE 11 — MIRAI

```
US-MIRAI-01  Ask MIRAI in Azerbaijani
AS A studio director
I WANT to ask MIRAI questions in Azerbaijani and get expert answers
SO THAT I have an always-available senior advisor

Given I open MIRAI and select persona "Strateq"
  When I ask a strategic question
  Then the response streams via SSE with first token ≤800ms p95
  And the persona name appears as the sender label
  And token usage is logged to mirai_messages + mirai_usage_log
```

```
US-MIRAI-02  Hüquqşünas cites AZ normative sources
AS A studio director
I WANT MIRAI to cite legal sources
SO THAT I trust the answer

Given persona = Hüquqşünas and my question is about expertise requirements
  When the model retrieves top-5 chunks via pgvector
  Then the response cites "Mənbə: <pdf_name>, Maddə X.Y.Z" inline
  And if no chunk scores above the relevance threshold
  Then MIRAI replies "Bu məsələ üzrə dəqiq məlumatım yoxdur, hüquqşünasla məsləhətləşin"
```

```
US-MIRAI-03  Privacy filter prevents data leakage
AS A non-admin user
I WANT MIRAI to refuse access to data outside my scope
SO THAT firm financials remain private

Given I am a Member (level 4) and ask "Bu ay nə qədər gəlirimiz olub?"
  When MIRAI's tool layer attempts firm_finance_snapshot
  Then the tool denies (admin-only)
  And the response politely declines: "Bu məlumat yalnız adminlər üçün açıqdır"
  And no financial values appear in the response
  And tools_used logs the denial
```

```
US-MIRAI-04  Cost guardian enforces $5/month/user
AS A studio director
I WANT a hard cap on MIRAI costs per user
SO THAT a runaway loop doesn't blow the budget

Given a user has consumed $4 of $5 in the current calendar month
  When they send another message
  Then a warning banner appears at the top of MIRAI: "80% limitə çatdınız"

Given the user reaches $5
  When they attempt another message
  Then MIRAI rejects with "Bu ay MIRAI limitinə çatdınız"
  And the chat is disabled until next month
  And the creator (is_creator=true) is exempt
```

```
US-MIRAI-05  CMO weekly feed posts
AS AN admin
I WANT MIRAI CMO to surface architecture trends and award opportunities
SO THAT the team stays informed without manual research

Given the weekly cron runs (Mon 09:00 Asia/Baku)
  When ArchDaily/Dezeen/Architizer/WAF feeds are fetched
  Then MIRAI summarizes + filters relevance (architecture + AZ/regional)
  And inserts mirai_feed_posts (source_kind='trend' or 'opportunity')
  And creates announcements rows with mirai_generated=true, approved=false
  And admins receive a moderation queue notification
```

---

### MODULE 12 — Telegram

```
US-TG-01  Link Telegram via in-app onboarding
AS A team member
I WANT to link my Telegram from inside Reflect
SO THAT setup is friction-free

Given I am on Profil → Telegram
  When I click "Telegram-ı qoş"
  Then a one-time 6-digit code is generated and stored server-side (TTL 10 min)
  And a deep link to the Reflect bot opens with the code prefilled
  And after I send the code in the bot, telegram_chat_id is saved + telegram_linked_at stamped
  And the in-app status flips to "Qoşulub"
```

```
US-TG-02  Receive task deadline reminders
AS A team member
I WANT Telegram reminders for my task deadlines
SO THAT I never miss a deadline

Given I am Telegram-linked and have a task with deadline = 2026-05-10
  When the reminder cron runs daily 09:00 Asia/Baku
  Then I receive messages on 2026-05-07 (D-3), 2026-05-09 (D-1), 2026-05-10 (D)
  And the format is "📋 {task_title} — deadline {when}! [{project_name}]"
  And reminders honor my notification_preferences (telegram + deadline)
```

```
US-TG-03  Finance alerts to admin only
AS A studio director
I WANT large income / expense / overdue alerts via Telegram
SO THAT I catch material events fast

Given thresholds in system_settings (income_alert=5000, expense_alert=2000)
  When an income > 5000 AZN is logged
  Then a Telegram message goes ONLY to admin/creator chat IDs
  And no non-admin chat ID receives any financial value
  And the message includes project + amount + logged_by
```

---

## 14. Story Coverage Matrix

| Module | Stories | Module | Stories |
|---|---|---|---|
| Auth | US-AUTH-01..04 | Salary | US-SAL-01..02 |
| Dashboard | US-DASH-01..05 | Performance | US-PERF-01..02 |
| Layihələr | US-PROJ-01..05 | Leave | US-LEAVE-01..02 |
| Tapşırıqlar | US-TASK-01..08 | Calendar | US-CAL-01..03 |
| Arxiv | US-ARC-01..02 | Elanlar | US-ELAN-01..03 |
| Müştərilər | US-CRM-01..06 | Equipment | US-EQUIP-01 |
| Maliyyə | US-FIN-01..08 | OKR | US-OKR-01..03 |
| Sistem | US-SYS-01..03 | Karyera | US-CAREER-01 |
| MIRAI | US-MIRAI-01..05 | Content | US-CONTENT-01 |
| Telegram | US-TG-01..03 | | |

**Total:** 56 user stories across 19 module groups. Each story is QA-testable; cross-references exist to §5 REQ IDs.

---

*Last updated: 2026-05-03*
*Owner: Talifa İsgəndərli*
*Next review: end of Part 1 sprint*
