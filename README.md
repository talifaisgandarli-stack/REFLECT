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
- [ ] Realtime channels (tasks/activity/announcements) — wired in v1.5
- [ ] Calendar Month/Week/Day full grids — placeholder list view shipped
- [ ] Knowledge Base PDF upload + RAG embeddings pipeline
- [ ] i18n (AZ default, EN/RU stubs)

The **Definition of Done** in PRD §11.3 still applies before any feature is
considered complete.
