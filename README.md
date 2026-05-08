# Reflect Architects OS

Internal operating system for the studio. Spec: [`docs/PRD.md`](docs/PRD.md) (v3.8).
Visual system: [`docs/designstyle4.md`](docs/designstyle4.md) — Living System direction.

## Stack (PRD §3.1 — locked)

- React 18 + Vite + Tailwind CSS
- React Router v6
- React Query (server state) + Zustand (UI state)
- Supabase (Postgres 15, RLS, Auth, Storage, Realtime, pgvector)
- Vercel Serverless `/api/*` (MIRAI, cron, privileged ops)
- Anthropic SDK — Claude Haiku 4.5 (MIRAI)
- Resend (transactional email)
- Telegram Bot API (per-user `chat_id` linking)

## Develop

```bash
cp .env.example .env.local      # fill in Supabase URL + anon key
npm install
npm run dev                     # http://localhost:5173
```

## Database

Migrations live in `supabase/migrations/`. Order:
1. `0001_init_schema.sql` — every canonical table from PRD §3.2
2. `0002_rls.sql` — RLS policies, helpers, finance views
3. `0003_seed_awards.sql` — `system_awards` baseline (REQ-PROJ-05)

Apply with the Supabase CLI:

```bash
supabase link --project-ref <ref>
supabase db push
```

RLS is enabled on every public table from day one (PRD §9.1). The
`outsource_user_view` exposes outsource items without money columns; the
`projects_user_view` is reserved for non-admin reads once budget columns land.

## Routing

Frontend nav follows PRD §4 contract exactly:

```
İŞ            /, /layihelər, /tapşırıqlar, /arxiv, /podrat
MÜŞTƏRİLƏR    /müştərilər (admin)
MALİYYƏ       /maliyyə (admin)
KOMANDA       /komanda/{heyət|maaş|performans|məzuniyyət|təqvim|elanlar|avadanlıq}
ŞİRKƏT        /şirkət/{okr|karyera|məzmun}
SİSTEM        /parametrlər/* (admin)
MIRAI         /mirai, /telegram
```

Admin-only routes are gated by `RequireAdmin` (DB role lookup, not header trust —
PRD §3.3).

## /api/* (Vercel Serverless)

- `POST /api/mirai/chat` — Claude Haiku 4.5, persona router, monthly cost guardian
- `POST /api/invitations/create` — admin-only, 48h token, Resend magic link
- `POST /api/telegram/init` — generate one-time linking code
- `POST /api/telegram/webhook` — bot webhook (`/start <code>` binds chat_id)
- `POST /api/presence/heartbeat` — REQ-PRESENCE-02
- `GET /api/cron/forecast` — daily, MIRAI cash forecast (REQ-FIN-08)
- `GET /api/cron/cmo` — weekly, RSS → `mirai_feed_posts` (REQ §7.8)

Every endpoint calls `requireUser()` (verifies JWT, resolves role from DB).
Cron endpoints accept `x-vercel-cron: 1` or `?key=$CRON_SECRET`.

## Design tokens

`tailwind.config.js` and `src/styles/tokens.css` map 1:1 to designstyle4
Appendix A. Do not introduce raw hexes in components — extend the token set
or the design doc instead.

## Status

- [x] Foundations: tokens, fonts, mascot, sphere, capsule sidebar, login
- [x] Schema + RLS for every PRD §3.2 table
- [x] All §4 routes scaffolded; admin/user variants gated
- [x] Tasks 7-status kanban with drag-drop status changes
- [x] Pipeline kanban for clients with slide-in detail
- [x] Maliyyə Mərkəzi with Cash Cockpit + Forecast
- [x] MIRAI page with particle sphere + chat bridge to /api/mirai/chat
- [x] Presence panel + Focus Mode mascot timer
- [x] Universal activity log (PRD §6.1) — DB triggers on tasks/projects/clients
- [x] `@<uuid>` mention parser + notifications fan-out (REQ-TASK-07)
- [x] Subtask → Done blocking modal + DB guard (REQ-TASK-05)
- [x] `up()`/`down()` migration pairs for every migration (PRD §10.1)
- [x] Finance: Income / Expense create modals (REQ-FIN-01, REQ-FIN-04)
- [x] Receivable markPaid partial flow (REQ-FIN-02 overpayment, REQ-FIN-03 partial)
- [x] Project create modal with backward-planned timeline (REQ-PROJ-01, REQ-PROJ-02)
- [x] Task quick + full create with live workload preview (REQ-TASK-01, REQ-TASK-06)
- [x] Task cancellation with reason from fixed list (REQ-TASK-04)
- [x] Realtime channels: tasks, activity_log, announcements, user_presence (PRD §3.4)
- [x] Presence heartbeat from frontend (REQ-PRESENCE-02)
- [x] Invite acceptance flow: /api/invitations/accept + Login `?invite=<token>` form + admin invite/revoke panel (REQ-AUTH-02)
- [x] CRM: Client create modal (REQ-CRM-01) + inline-create wired into ProjectModal
- [x] Quick interaction log inside Müştəri drawer (REQ-CRM-03)
- [x] Retrospective survey: admin trigger + public /survey/:token form (REQ-CRM-07)
- [x] Calendar Month/Week/Day grids + EventModal + .ics email invite + meet.new (PRD §8.2 / US-CAL-01..03)
- [x] MIRAI RAG: MD/TXT ingestion, OpenAI embeddings (1536-d), pgvector cosine top-5, citations rendered as sources strip (PRD §7.4)
- [x] Dashboard upcoming-meetings + unread-announcements widgets + sidebar unread badge (REQ-DASH-02, PRD §8.6)
- [x] Maliyyə Mərkəzi: P&L, Outsource, Xərclər tabs (REQ-FIN-05, REQ-FIN-06, REQ-FIN-07)
- [x] MIRAI streaming + handoff: SSE over /api/mirai/chat, mirai_conversations + mirai_messages persistence, Realtime mirai_messages:conversation_id subscription (PRD §3.4, §7.1, US-MIRAI-01)
- [x] Outsource user-side status updates via update_outsource_status RPC (REQ-FIN-07) + recurring_expenses → expenses materializer with daily Vercel cron (REQ-FIN-05)
- [x] Test infrastructure: Vitest + migration-pairing tests + parity harness skeleton + GitHub Actions CI (PRD §9.3, §11.3)
- [ ] Realtime channels (tasks/activity/announcements) — wired in v1.5
- [ ] Calendar Month/Week/Day full grids — placeholder list view shipped
- [ ] Knowledge Base PDF upload + RAG embeddings pipeline
- [ ] i18n (AZ default, EN/RU stubs)

The **Definition of Done** in PRD §11.3 still applies before any feature is
considered complete.
