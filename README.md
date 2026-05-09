# Reflect Architects OS

Internal operating system for the studio. Spec: [`docs/PRD.md`](docs/PRD.md) (v3.8).
Visual system: [`docs/designstyle4.md`](docs/designstyle4.md) — Living System direction.
Branch progress: [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Stack (PRD §3.1 — locked)

- React 18 + Vite + Tailwind CSS
- React Router v6
- React Query (server state) + Zustand (UI state)
- Supabase (Postgres 15, RLS, Auth, Storage, Realtime, pgvector)
- Vercel Serverless `/api/*` (MIRAI, cron, privileged ops)
- Anthropic SDK — Claude Haiku 4.5 (MIRAI)
- Resend (transactional email)
- Telegram Bot API (per-user `chat_id` linking)
- pdfjs-dist (Bilik Bazası PDF parsing)
- recharts (Hesabatlar charts)

## Develop

```bash
cp .env.example .env.local      # fill in Supabase URL + anon key
npm install
npm run dev                     # http://localhost:5173
```

### Scripts

```bash
npm run dev          # vite dev server (port 5173)
npm run build        # production bundle (dist/)
npm run typecheck    # tsc --noEmit
npm test             # vitest run (lib + api unit tests)
npm run test:watch   # vitest watch
npm run e2e          # playwright run (uses npm run dev as webServer)
npm run e2e:ui       # playwright UI mode
npm run lint         # eslint src/ + api/
```

## Database

Migrations live in `supabase/migrations/`. Each up has a paired `*.down.sql`
(PRD §10.1, §10.2 — never drop, always rename to `_archived_*`).

Apply with the Supabase CLI:

```bash
supabase link --project-ref <ref>
supabase db push
```

RLS is enabled on every public table from day one (PRD §9.1). The audit
script `supabase/rls_audit.sql` fails if any public table has RLS disabled
or zero policies — wired into CI.

The `outsource_user_view` exposes outsource items without money columns;
project documents flow through a private `project-documents` storage bucket
with name-mapped RLS.

## Routing

Frontend nav follows PRD §4 contract:

```
İŞ            /, /layihelər, /layihelər/:id, /tapşırıqlar, /tamamlandı,
              /arxiv, /podrat
MÜŞTƏRİLƏR    /müştərilər (admin)
MALİYYƏ       /maliyyə (admin), /hesabatlar (admin)
KOMANDA       /komanda/{heyət|maaş|performans|məzuniyyət|təqvim|elanlar|avadanlıq}
ŞİRKƏT        /şirkət/{okr|karyera|məzmun}
SİSTEM        /parametrlər/*, /audit (admin)
MIRAI         /mirai, /telegram
ŞƏXSİ         /bildirişlər (any authed)
PUBLIC        /survey/:token, /share/:token
```

Admin-only routes are gated by `RequireAdmin` (DB role lookup, not header
trust — PRD §3.3).

## /api/* (Vercel Serverless)

```
POST  /api/mirai/chat              — Claude Haiku 4.5 (sync)
POST  /api/mirai/stream            — Claude Haiku NDJSON streaming
POST  /api/invitations/create      — 48h token, branded Resend invite
POST  /api/telegram/init           — generate one-time linking code
POST  /api/telegram/webhook        — bot webhook + /tasks /today /balance
POST  /api/presence/heartbeat      — REQ-PRESENCE-02
POST  /api/knowledge/ingest        — admin-only KB chunk + embed pipeline
GET   /api/search?q=...            — Cmd+K cross-entity search
GET   /api/cron/forecast           — daily Claude cash forecast
GET   /api/cron/cmo                — weekly RSS → mirai_feed_posts
GET   /api/cron/notify-fanout      — every 10 min, Resend + Telegram drainage
GET   /api/cron/deadline-reminders — daily 05:00 D-3/D-1/D-day
GET   /api/cron/finance-alerts     — hourly threshold + overdue receivable
```

Every endpoint calls `requireUser()` (verifies JWT, resolves role from DB).
Cron endpoints accept `x-vercel-cron: 1` or `?key=$CRON_SECRET`.

Rate limits per PRD §9.1 (admin 100/min, user 30/min, anon 10/min) via
Upstash REST when `UPSTASH_REDIS_REST_*` are configured; in-memory
fallback otherwise.

## Environment

```
# Supabase
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...

# AI
ANTHROPIC_API_KEY=sk-ant-...
PUBLIC_APP_URL=https://reflect.studio    # used by email templates

# Email
RESEND_API_KEY=re_...
RESEND_FROM=Reflect <noreply@reflect.studio>

# Telegram
TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=...

# Cron
CRON_SECRET=...

# Optional
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
VITE_SENTRY_DSN=https://...@sentry.io/...
VITE_RELEASE=reflect@1.0.0
```

## Design tokens

`tailwind.config.js` and `src/styles/tokens.css` map 1:1 to designstyle4
Appendix A. Do not introduce raw hexes in components — extend the token set
or the design doc instead.

## i18n

Locale dictionaries: `src/locales/{az,en,ru}.json`. AZ is the source of
truth; the locale-parity test enforces every key is present in EN + RU.
Use the `useT()` hook in components, `t()` in module-level code.

The Sidebar locale switcher writes `profiles.locale`; UI reloads to pick up
the new dictionary (a profile-store invalidator is a follow-up).

## Observability

- `src/lib/observability.ts` — Sentry envelope shim; `installGlobalHandlers()`
  wired in `main.tsx`. Swap to `@sentry/react` SDK when DSN is provisioned.
- `api/_lib/audit.ts` — `logAudit()` writes to `audit_log`; viewable at
  `/audit` for admins.

## Status

See [`docs/PROGRESS.md`](docs/PROGRESS.md) for the full slice ledger
(50+ commits across this branch). The PRD §11.3 Definition of Done still
applies before any feature is considered complete.

For contributing conventions see [`CONTRIBUTING.md`](CONTRIBUTING.md).
