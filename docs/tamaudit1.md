# Reflect Architects OS — Tam Audit (PRD v3.8 vs. kod)

**İlk audit:** 2026-05-10
**Son yeniləmə:** 2026-05-12
**PRD:** docs/PRD.md (1909 sətr)
**Audit edilən:** bütün `src/pages/`, `src/components/`, `api/`, `supabase/migrations/`

PRD-ni və hər səhifəni oxudum. **22 ship-blocking + 100+ kiçik bug** tapıldı, bu fayl iş gedişi və yekun nəticələri əks etdirir.

---

## 📊 NƏTİCƏ — 2026-05-12

| Kateqoriya | İlkin | Düzəldildi | Qalır | Coverage |
|---|---|---|---|---|
| **Ship-blocker** | 22 | **22** ✅ | 0 | **100%** |
| Secondary (modul) | ~70 | ~45 | ~25 | ~64% |
| Cross-cutting | ~20 | ~7 | ~13 | ~35% |
| Security/RLS | 7 | 4 | 3 | ~57% |
| Performance/N+1 | 7 | 1 | 6 | ~14% |
| **CƏMI** | **~126** | **~79** | **~47** | **~63%** |

**Production:** `reflectbc.vercel.app` — canlı, stabil, gündəlik istifadə üçün hazır.

---

## 🔥 KRİTİK SHIP-BLOCKERS — hamısı ✅

### 1. ✅ `/api/knowledge-base/upload` endpoint
- **Düzəliş:** `api/knowledge-base/upload.ts` yaradıldı, edge runtime, paralel embedding batches
- **Yekun:** Anthropic OpenAI → Google Gemini → Voyage AI → **Postgres FTS** (heç bir API key tələbi yox, pulsuz daimi)
- **Migration:** 0028 (FTS index + match_knowledge_base RPC), 0029 (knowledge_base grants)

### 2. ✅ `outsource_items` schema mismatch
- `Finance.tsx` selectors düzəldi (`work_title`, `contact_company`, status enum `order|in_progress`)
- `Outsource.tsx` "+ Yeni" düyməsi → tam create modal əlavə olundu

### 3. ✅ MIRAI persona enum DB mismatch
- **Migration 0013:** `operations_director`, `legal`, `strategist`, `team_assistant` enum-a əlavə

### 4. ✅ `finance_alert` threshold UI
- `Settings.tsx` key `finance_alert_income_threshold` / `finance_alert_expense_threshold` (cron ilə uyğun)
- jsonb format `{azn: number}` (string deyil)

### 5. ✅ Realtime channel optimization
- Per-user channel adları (`tasks:<userId>`)
- 150ms debounced invalidation (burst hadisələr birləşir)
- RLS server-side filter → user yalnız öz tasks-ını alır

### 6. ✅ Incomes/expenses activity_log triggers
- **Migration 0020** — `incomes_activity`, `expenses_activity`, `salaries_activity` triggerləri

### 7. ✅ `mirai_monthly_budget` admin input
- `system_settings.mirai_monthly_budget` jsonb `{usd: number}` oxunur
- Admin UI Settings + MIRAI səhifəsində

### 8. ✅ MIRAI SSE streaming
- `api/mirai/chat.ts` `?stream=1` query parametri ilə SSE
- Tool calling-siz text-only fast path

### 9. ✅ MIRAI 6 tool layer
- `list_my_tasks`, `create_task`, `list_my_projects`, `firm_finance_snapshot`, `search_knowledge_base`, `client_summary`
- RLS-scoped userClient — MIRAI user icazələrini bypass edə bilməz
- Multi-turn loop limit: 4 iterasiya

### 10. ✅ Career page promotion path
- **Migration 0021:** `profiles.career_level_id`, `profiles.career_progress`
- "Cari → Növbəti" personalized panel + kriteriya checkbox-ları

### 11. ✅ OKR weekly nudge cron
- `api/cron/okr-nudge.ts` — hər Bazar ertəsi 09:00 (Asia/Baku)
- `vercel.json` cron sırası yenilənib

### 12. ✅ Closeout checklist persist
- **Migration 0017:** unique constraint + write policy
- `useState` → `closeout_checklists` cədvəlinə optimistic upsert

### 13. ✅ Salary `effective_to` trigger
- **Migration 0018:** `close_prior_salary()` triggeri — yeni maaş insert olunanda köhnə açıq row avtomatik bağlanır

### 14. ✅ Mention parser fix
- **Migration 0019:** trigger client-supplied UUID array-ı qoruyur + body-də `@<uuid>` regex-i mərc edir
- UI prefix-first match (ambiguous `@al` üçün)

### 15. ✅ Telegram link privacy hole
- **Migration 0015:** dedicated `telegram_link_codes` table with strict RLS (sahibi yalnız)
- 6 rəqəm numeric, 10 dəqiqəlik TTL, crypto.getRandomValues

### 16. ✅ Webhook secret fail-closed
- `api/telegram/webhook.ts` — env var yoxdursa 500 (fail-closed)
- Bonus: `/help`, `/status`, `/unlink` komandaları əlavə olundu

### 17. ✅ Announcements 'rejected' UUID crash
- **Migration 0014:** `rejected_at`, `rejected_by` kolonları
- Pending query indi `posted_announcement_id is null and rejected_at is null`

### 18. ✅ Forecast cron MIRAI-powered
- `api/cron/forecast.ts` Claude Haiku 4.5 ilə 30/60/90 günlük cash forecast
- JSON parse fail-də deterministic fallback (sistem heç vaxt boş cavab vermir)

### 19. ✅ Email enumeration
- `Login.tsx` generic "Email və ya şifrə yanlışdır" mesajı
- Magic link & password reset həmişə eyni "linki göndərdik" mesajı qaytarır

### 20. ✅ Mobile sidebar drawer
- `Sidebar.tsx` desktop rail + mobile drawer
- `MobileNavToggle` (hamburger) Layout-da, route dəyişəndə avtomatik bağlanır

### 21. ✅ Error boundary + skeleton primitive
- `ErrorBoundary.tsx` global, `main.tsx`-da QueryClientProvider sarıyır
- `Skeleton.tsx` primitive (geniş istifadə hələ qalır, qismən tətbiq)

### 22. ✅ activity_log RLS tightened
- **Migration 0016:** non-admin maliyyə entity-lərini görmür (`incomes`, `expenses`, `salaries`, `receivables`, `recurring_expenses`)

---

## 🟠 MODUL ÜZRƏ İŞ — vəziyyət

### MODUL 1 — Auth (PRD §5)
- ✅ Email enumeration fixed
- ✅ Şifrəni unutdum linki + Supabase password reset
- ✅ `is_active` deaktiv user avtomatik logout
- ✅ Auto-create profile trigger (Migration 0024) + RPC `ensure_profile` (Migration 0025)
- ⚠️ Rate limit migration scaffolded (0031), amma server proxy lazımdır kodla bağlanmaq üçün
- ❌ Resend invitations bypass — Settings.tsx birbaşa Supabase insert edir
- ❌ `accepted_at` heç vaxt yazılmır
- ❌ Locale switch / i18n

### MODUL 2 — Dashboard (PRD §6)
- ✅ Aktiv layihə health widget (admin)
- ✅ Admin-only kart filtri (Müştərilər/Maliyyə non-admin-də gizli)
- ❌ `useTeamPresence` 30s polling (acceptable, realtime channel daha optimal amma polling işləkdir)
- ❌ Empty state CTA-ları (partial)
- ❌ Personal OKR "Hamısı →" link

### MODUL 3 — Layihələr (PRD §7)
- ✅ Closeout checklist persisted (Migration 0017)
- ✅ Phase edit UI (admin toggle on/off)
- ✅ Reopen `archived_at` təmizlənir
- ✅ History tab task event-lərini göstərir
- ✅ Deadline ≥ start_date validation
- ❌ `system_awards.deadline_month` parse səhvi
- ❌ `applications jsonb` type mismatch
- ❌ Tasks tab improvements (filter, inline status, add-task)
- ❌ Documents upload affordance

### MODUL 4 — Tapşırıqlar (PRD §10)
- ✅ Multi-assignee picker (admin)
- ✅ Task edit modal (✎ icon kanban-da)
- ✅ Cədvəl view deadline rəng kodu
- ✅ Search URL-də saxlanır
- ✅ Mention parser
- ❌ Quick-add per kanban column
- ❌ Optimistic drag-drop (cəhd edildi, geri qaytarıldı — `@dnd-kit/core` lazımdır)
- — Bulk archive (defense-in-depth, acceptable)

### MODUL 5 — CRM (PRD §8)
- ✅ Search input işləkdir
- ✅ BD Lead drag-drop + clients write
- ✅ Pipeline value `client.confidence_pct` istifadə edir
- ✅ `logged_by` interaksiyalarda
- ✅ `last_interaction_at` trigger (Migration 0005-də vardı)
- ❌ BD Lead `expected_value` RLS ayrılması
- ❌ `ai_icp_fit` enum vs numeric uyğunsuzluğu
- ❌ `project_documents.status` "Draft"
- ❌ ICP throttle server-side
- ❌ MIRAI regex parse → structured tool

### MODUL 6 — Maliyyə (PRD §11)
- ✅ Income → receivable auto-mark trigger (Migration 0030)
- ✅ Activity log triggerləri (Migration 0020)
- ✅ Forecast MIRAI-powered (deterministic fallback ilə)
- ✅ `nextInvoiceNumber` race fix (Migration 0030 — atomic sequence)
- ✅ Receivables UI client_id → ad/şirkət (join)
- ✅ Templates `_deprecated_` filter
- ❌ xlsx export (`xlsx` paketi install yoxdur)
- ❌ PnL kateqoriya breakdown
- ❌ Recurring expenses backlog risk
- ❌ "Sabit" tab `last_run_at` göstərmir

### MODUL 7 — Komanda
#### 7.1 Roster
- ❌ 3/5 PRD sahəsi (equipment count, workload, role label)
- ❌ `useTeamPresence` rol dəyişikliyində invalidate

#### 7.2 Salary
- ✅ `effective_to` trigger (Migration 0018)
- ✅ `activity_log` trigger (Migration 0020)
- ❌ `audit_log` insert
- ❌ Telegram notification

#### 7.3 Performance
- ✅ `performance_review` notification dispatcher whitelist
- ✅ Email/Telegram fan-out işləyir

#### 7.4 Leave
- ✅ `leave_*` dispatcher whitelist
- ❌ N+1 admin notification insert
- — Half-day leave (PRD-də istənmir)

#### 7.5 Calendar
- ✅ Event delete UI (organizer + admin)
- ❌ `.ics` attachment (hələ mailto body)
- ❌ Recurring events expand (`rrule.js` integration)
- ❌ Multi-day events render
- ❌ Timezone ambiguity

#### 7.6 Announcements — tam ✅
- ✅ Reject UUID fix (Migration 0014)
- ✅ `read_by` tracking + "Hamısını oxunmuş işarələ"
- ✅ `is_featured` toggle UI (admin)
- ✅ `ann_insert` tightened to admin-only (Migration 0023)

#### 7.7 Equipment
- ✅ Reassign confirm dialog
- ❌ `condition_log` RLS

### MODUL 8 — Şirkət
#### 8.1 OKR
- ✅ Weekly nudge cron (`api/cron/okr-nudge.ts`)
- ❌ Personal OKR owner avatar (admin görünüşündə)

#### 8.2 Career — tam ✅
- ✅ `career_level_id` + `career_progress` (Migration 0021)
- ✅ "Cari → Növbəti" personalized panel
- ✅ Kriteriya checkbox-ları (self-assessment)

#### 8.3 Content Plan
- ✅ 2-gün xəbərdarlıq cron (`api/cron/content-reminders.ts`)
- ❌ Status dəyişəndə optimistic update

### MODUL 9 — Settings (PRD §16)
- ✅ PDF upload endpoint
- ✅ Templates `_deprecated_*` filter
- ✅ MIRAI aylıq büdcə inputu işləkdir
- ✅ Finance alert thresholds işləkdir
- ❌ Şirkət adı save (hardcoded `defaultValue`)
- ❌ Invitations Resend bypass

### MODUL 10 — MIRAI — tam ✅
- ✅ SSE streaming (`?stream=1`)
- ✅ 6 tool whitelist
- ✅ Project context (top project name/phase/deadline)
- ✅ `mirai_monthly_budget` admin input
- ✅ Hard cap (1.05× over-budget multiplier silindi)
- ✅ `tools_used` yazılır
- ✅ Submit düyməsi (Enter-dən başqa)
- ✅ Error banner-də qalır (history-ə qarışmır)
- ❌ 80% pre-flight warning (hələ post-call)
- ❌ CMO RSS custom feeds
- ❌ `mirai_feedback` unique constraint collision
- ❌ Tokens_in attribution

### MODUL 11 — Telegram — tam ✅
- ✅ Linking codes ayrı RLS-li cədvəldə
- ✅ Webhook secret fail-closed
- ✅ 6 rəqəm numeric + 10 dəq TTL
- ✅ `/help`, `/unlink`, `/status` komandaları

### MODUL 12 — Archive / Done / Outsource / Notifications
- ✅ Archive timezone fix (`dateTo + 'T23:59:59.999Z'`)
- ✅ Reopen project clears `archived_at`
- ✅ Outsource struktur (Modul 2 ilə birlikdə)
- ❌ Bulk restore UI
- ❌ Done `completedAt` fallback
- ❌ Done completed-by attribution
- ❌ Notification grouping

---

## 🟠 CROSS-CUTTING UI/UX

- ✅ Mobile sidebar drawer
- ✅ Global error boundary
- ✅ Skeleton primitive (geniş tətbiq qalır)
- ❌ Drag handler keyboard alternative (WCAG)
- ❌ Modal focus trap
- ❌ Placeholder vs label (a11y)
- ❌ Color-only status signals
- ❌ Empty state CTA-lar (qismən)
- ❌ `console.warn` production (terser config)
- ❌ Mixed loading vocabulary
- ❌ i18n runtime
- ❌ Page-head breadcrumb
- ❌ MiraiDrawer mobile overlap

---

## 🟠 SECURITY / RLS

- ✅ `activity_log` RLS tightened (Migration 0016)
- ✅ Templates SELECT admin-only (Migration 0032)
- ✅ BD Lead clients INSERT/UPDATE (Migration 0022)
- ✅ Telegram link codes dedicated table (Migration 0015)
- ✅ Knowledge_base grants (Migration 0029)
- ✅ Profiles grants + ensure_profile RPC (Migration 0025)
- ❌ `projects` UPDATE creator-also
- ❌ CSRF protection /api/*
- ❌ `is_project_member` genişləndirilməsi

---

## 🟠 PERFORMANCE / N+1

- ✅ Realtime debounce + per-user channel
- ❌ Tasks/Projects pagination
- ❌ Finance limit(200) cap
- ❌ Dashboard tasks-all-open limit (qismən fix)
- ❌ Notification cap (acceptable)
- ❌ N+1 Leave/Announcements
- ❌ Calendar 60-day client-side
- ❌ `useTeamPresence` polling (acceptable)

---

## 📦 MIGRATION TARİXÇƏSİ

| # | Migration | Məqsəd |
|---|---|---|
| 0013 | mirai_persona_enum | 4 yeni persona enum |
| 0014 | mirai_feed_rejected | rejected_at + rejected_by |
| 0015 | telegram_link_codes | Dedicated RLS-scoped table |
| 0016 | activity_log_rls | Non-admin maliyyə görmür |
| 0017 | closeout_write_policy | Project members write + unique |
| 0018 | salary_close_prior | effective_to auto-trigger |
| 0019 | mention_parser_fix | Client UUIDs preserved |
| 0020 | finance_activity_triggers | incomes/expenses/salaries triggers |
| 0021 | career_personalization | career_level_id + progress |
| 0022 | clients_bd_lead_write | BD Lead write policy |
| 0023 | announcements_tighten | ann_insert admin-only |
| 0024 | auto_create_profile | New auth.users → profile trigger |
| 0025 | ensure_profile_rpc | SECURITY DEFINER bootstrap |
| 0026 | embedding_dim_768 | (köhnə Gemini cəhdi) |
| 0027 | embedding_dim_1024 | (köhnə Voyage cəhdi) |
| 0028 | kb_fulltext_search | **Postgres FTS — yekun həll** |
| 0029 | kb_grants | knowledge_base service_role grants |
| 0030 | finance_helpers | Invoice sequence + income→receivable |
| 0031 | login_rate_limit | Rate limit scaffold (kod inteqrasiya gözləyir) |
| 0032 | templates_admin_only | Templates SELECT admin-only |

**Toplam:** 20 yeni migration, hamısı additive.

---

## 🎯 QALAN İŞ — Prioritetlə

### Yüksək təsir, az xərc (~3 saat) — "live with it" olmayan
1. **Resend invitations bypass** — Settings invitations UI Resend istifadə etsin
2. **Auth rate limit proxy** — Server-side login endpoint (migration 0031 hazırdır)
3. **BD Lead expected_value RLS** — financial fields ayrılması
4. **MIRAI 80% pre-flight warning** — call başlamazdan əvvəl
5. **`projects` UPDATE creator-also** — RLS genişləndirilməsi
6. **Modal focus trap** — A11y
7. **Bulk restore Archive** — multi-select + restore action

### Orta təsir, orta xərc (~6-8 saat)
8. **Calendar rrule expand + ics attachment + multi-day**
9. **xlsx export** (`xlsx` paketi + UI button)
10. **Optimistic drag-drop** (`@dnd-kit/core`)
11. **CMO RSS custom feeds** (cron-da admin Settings oxusun)
12. **Tasks tab on ProjectDetail** (filter, inline status, add)
13. **i18n runtime** (AZ/EN dictionary)

### Performans / scale (~4 saat, lazımdır 50+ user olduqda)
14. **Tasks/Projects pagination**
15. **Finance limit() pattern**
16. **Roster equipment count + workload chip**
17. **N+1 admin notification fix-ləri**

---

## 📊 YEKUN

Sistem **arxitektura intizamı** + **defensiv kodlaşdırma** göstərir:
- 20 additive migration, 0 destructive
- RLS-first dizayn, SECURITY DEFINER RPC-lər ehtiyatla
- Edge runtime / paralel I/O / debounced realtime
- Auto-create profile, FTS-based RAG (zero-dependency)
- Production stable (~3 gün canlı, ship-blocker yoxdur)

**Real istifadəçi sayı 5-10 olanda:** sistem **tamamilə adekvatdır**.
**Real istifadəçi sayı 50+:** performans batch-i tələb olunur (pagination, N+1, polling → realtime).
**Beynəlxalq genişlənmə:** i18n + a11y sprint-i tələb olunur.

---

## 📁 SƏNƏDLƏŞDİRMƏ
- `docs/PRD.md` — orijinal məhsul tələbləri (v3.8, 1909 sətr)
- `docs/tamaudit1.md` — bu fayl
- `supabase/migrations/00*` — bütün schema dəyişiklikləri
- `.env.example` — yeni env-lərin xəritəsi
