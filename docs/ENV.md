# Environment Variables — Production Setup

Reflect ships as a Vite SPA + Vercel Edge serverless functions on top
of Supabase Postgres. Both layers need their own environment surface.
This doc inventories every var the codebase reads, why it's needed, and
where to set it for production.

> **Scope.** This is the prod-ready checklist. For local development the
> defaults under `.env.local` (Supabase CLI + a personal Anthropic key)
> are enough. The scripts that need extra env (cron, Telegram webhook)
> are listed under §3 with their consumer file.

---

## 1. Client-side (Vite — `VITE_*`)

These values are inlined into the build output, so they are public by
design. Use the **publishable** variants (anon key, public DSN).

| Var | Required | Where read | Purpose |
|---|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | `src/lib/supabase.ts` | Postgres + storage + realtime endpoint |
| `VITE_SUPABASE_ANON_KEY` | ✅ | `src/lib/supabase.ts` | RLS-scoped anon key (per-row safety lives in policies) |
| `VITE_SENTRY_DSN` | optional | `src/lib/sentry.ts` | Browser error reporting; absent → no-op stub |
| `VITE_RELEASE` | optional | `src/lib/sentry.ts` | Sentry release tag; usually CI commit SHA |

Set on **Vercel** under *Project → Settings → Environment Variables*
with the *Production* + *Preview* + *Development* checkboxes ticked.
These are the only `VITE_*` keys that reach the browser bundle.

---

## 2. Server-side (Vercel Edge Functions — `/api/*`)

Server vars never reach the browser. They get loaded at edge-runtime
boot. Set them only on Production + Preview (not Development) so that
local dev doesn't accidentally hit production secrets.

| Var | Required | Consumer | Purpose |
|---|---|---|---|
| `SUPABASE_URL` | ✅ | `api/_lib/auth.ts` | Server-side admin client (mirrors VITE_SUPABASE_URL) |
| `SUPABASE_ANON_KEY` | ✅ | `api/_lib/auth.ts` (`userClient`) | RLS-scoped client when the API acts on behalf of a user |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | `api/_lib/auth.ts` (`admin`) | Service-role for cron writes + audit log inserts. **Never expose client-side.** |
| `ANTHROPIC_API_KEY` | ✅ | `api/mirai/{chat,stream}.ts`, `api/cron/{forecast,cmo}.ts` | MIRAI assistant + forecast/CMO cron LLM calls |
| `RESEND_API_KEY` | ✅ for email | `api/_lib/email.ts`, `api/cron/notify-fanout.ts` | Transactional email dispatch |
| `RESEND_FROM` | ✅ for email | `api/_lib/email.ts` | Verified sender address (e.g. `Reflect <noreply@reflect.studio>`) |
| `TELEGRAM_BOT_TOKEN` | ✅ for telegram | `api/telegram/*` | Bot API auth |
| `TELEGRAM_WEBHOOK_SECRET` | ✅ for telegram | `api/telegram/webhook.ts` | Validates inbound webhook calls (rejects forgeries) |
| `CRON_SECRET` | ✅ for cron | `api/cron/*` | All cron endpoints require `?secret=$CRON_SECRET` so only Vercel Cron can fire them |
| `UPSTASH_REDIS_REST_URL` | ✅ for rate-limit | `api/_lib/rate-limit.ts` | Sliding-window rate limit storage |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ for rate-limit | `api/_lib/rate-limit.ts` | Auth for the Upstash REST API |
| `PUBLIC_APP_URL` | ✅ for share/email | `api/_lib/email.ts`, share token deeplinks | Absolute base URL — used in invitation/retro emails and Telegram share links |

### Service role + secret hygiene

- **`SUPABASE_SERVICE_ROLE_KEY`** bypasses RLS. Used in:
  - `admin()` from `api/_lib/auth.ts` for cron + audit + invite flows.
  - Any insert into `audit_log` (cannot rely on the user's JWT — they
    might be acting against themselves).
- **`CRON_SECRET`**: include as `?secret=` in every `vercel.json` cron
  trigger. The endpoint compares with timing-safe equality.
- **`TELEGRAM_WEBHOOK_SECRET`**: set when calling the Telegram
  `setWebhook` endpoint; same value lands as a header on every inbound
  call.

---

## 3. Cron schedule (Vercel)

Defined in `vercel.json`. Each entry calls a function under `/api/cron/*`
with `?secret=$CRON_SECRET`. Set the schedule via Vercel's cron UI or
in `vercel.json`:

| Path | Frequency | Purpose |
|---|---|---|
| `/api/cron/notify-fanout` | every 10 min | Resend email + Telegram drainage |
| `/api/cron/deadline-reminders` | daily 09:00 +04 | D-3 / D-1 / day-of |
| `/api/cron/finance-alerts` | hourly | Income/expense threshold + overdue receivable |
| `/api/cron/forecast` | daily 06:00 +04 | Cash forecast (Claude + fallback) |
| `/api/cron/cmo` | weekly Mon 07:00 +04 | RSS ingest → mirai_feed_posts → drafts |

If a cron isn't deployed (e.g. you're running the Vercel free tier),
the corresponding feature degrades gracefully:
- no notify-fanout → in-app notifications still flow, email/Telegram silent
- no deadline-reminders → kanban still highlights overdue cards
- no finance-alerts → admins miss threshold emails
- no forecast → Cash Cockpit shows placeholder data
- no cmo → MIRAI feed stays empty

---

## 4. First-time deploy checklist

1. Provision a Supabase project (Pro tier or higher for branching).
2. Run every migration from `supabase/migrations/0001_*` through the
   latest in numeric order. Never skip — `npm test` enforces the
   migration-pair rule (slice 119).
3. Apply the storage bucket creation in `0016_project_documents_bucket`.
4. Enable Realtime on the publication (the migration is idempotent).
5. Set every required env from §1 + §2 in Vercel.
6. Deploy. Validate:
   - Login works (`VITE_SUPABASE_*` reachable)
   - `/api/search` returns 200 (JWT verification + RLS)
   - `/api/cron/notify-fanout?secret=<CRON_SECRET>` returns 200 manually
7. Set the Telegram webhook (one-time):
   ```sh
   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
     -d "url=https://<your-domain>/api/telegram/webhook" \
     -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
   ```
8. Sentry: paste the DSN under `VITE_SENTRY_DSN`, redeploy, force a
   client error, confirm it lands.

---

## 5. Local development

`.env.local` (gitignored — never commit) covers both layers because
Vite reads `VITE_*` and Vercel dev reads everything:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<from `supabase status`>
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<from `supabase status`>
SUPABASE_SERVICE_ROLE_KEY=<from `supabase status`>

# optional locally
ANTHROPIC_API_KEY=<personal key, capped via cost guardian>
RESEND_API_KEY=<test mode key>
RESEND_FROM=Reflect <onboarding@resend.dev>
PUBLIC_APP_URL=http://localhost:5173
CRON_SECRET=local-dev-only

# omit Telegram + Upstash unless you're testing those flows
```

`supabase start` then `npm run dev` brings the studio up on
`http://localhost:5173`. The cron endpoints can be hit manually with
`curl localhost:5173/api/cron/<name>?secret=local-dev-only`.
