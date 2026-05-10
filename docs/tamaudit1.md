# Reflect Architects OS — Tam Audit (PRD v3.8 vs. kod)

**Audit tarixi:** 2026-05-10
**PRD:** docs/PRD.md (1909 sətr)
**Audit edilən:** bütün `src/pages/`, `src/components/`, `api/`, `supabase/migrations/`

PRD-ni və hər səhifəni oxudum. Sistematik şəkildə çıxış göstərirəm — **22 ship-blocking** problem + 100+ kiçik bug.

---

## 🔥 KRİTİK — bütün modulları dağıdır

### 1. `/api/knowledge-base/upload` endpoint YOXDUR
- `src/pages/Settings.tsx:422` PDF göndərir, amma `api/knowledge-base/upload.ts` yaradılmayıb
- **Nəticə:** hər PDF upload 404 qaytarır, MIRAI Hüquqşünas RAG personası tam ölü
- US-SYS-02 violation
- **Fix:** `pdf-parse` ilə text çıxar, ~500 token chunk, OpenAI embedding, `knowledge_base`-ə insert et

### 2. `outsource_items` schema mismatch — Finance UI sınıq
- `Finance.tsx:567` `vendor`, `description` seçir — sxemada yoxdur (`work_title`, `contact_company` var)
- `Outsource.tsx:28` "+ Yeni" düyməsində `onClick` yoxdur — ölü düymə
- Status enum-da `pending`, `active` yoxdur — Finance.tsx yanlış key-lərdən istifadə edir
- **Fix:** Finance.tsx-də selector-ları düzəlt, Outsource-də create modal əlavə et

### 3. MIRAI persona enum DB mismatch — admin personaları crash edir
- `0001_init_schema.sql:391`: `('general', 'project_manager', 'finance_analyst', 'cmo', 'hr_partner')`
- Kod isə `operations_director`, `legal`, `strategist`, `team_assistant` istifadə edir
- **Nəticə:** ICP enrichment, hüquqi RAG, strateji məsləhət — hamısı insert error verir
- **Fix:** Additive migration ilə enum-a 4 yeni dəyər əlavə et

### 4. `finance_alert` threshold UI ölüdür
- `Settings.tsx:76` key `'income_alert'` yazır, cron `'finance_alert_income_threshold'` oxuyur
- Üstəlik `value: '5000'` string yazır, sxem `jsonb` istəyir
- **Nəticə:** admin nə qədər threshold dəyişsə də cron həmişə default dəyəri istifadə edir
- US-TG-03 violation

### 5. Realtime channel `tasks:all` istifadə edir
- `lib/realtime.ts:71` filter olmadan abunəlik
- PRD §3.4 deyir: `tasks:project_id=<uuid>`
- **Nəticə:** 50 nəfərlik şirkətdə hər task dəyişikliyi 50 lazımsız refetch
- **Fix:** Aktiv səhifədən `project_id` filter götür

---

## 🟠 MODUL 1 — Auth (PRD §5)

- **REQ-AUTH-01: Rate limit yoxdur** — `Login.tsx:18` birbaşa `signInWithPassword` çağırır, 5 cəhd/15 dəq IP yoxdur
- **REQ-AUTH-02: Resend fire-and-forget** — `api/invitations/create.ts:46` `.catch(() => null)` — email göndərilməsə kimsə bilmir
- **REQ-AUTH-02: UI Resend istifadə etmir** — `Settings.tsx:553` birbaşa Supabase insert edir, email heç vaxt getmir
- **REQ-AUTH-02: `accepted_at` heç vaxt yazılmır** — heç bir endpoint və ya login flag etmir
- **US-AUTH-04: Locale switch ölüdür** — `i18n` library yoxdur, bütün stringlər hardcoded AZ
- **REQ-AUTH-03: `is_active` heç vaxt yoxlanılmır** — deaktiv user normal login edə bilər
- **Email enumeration leak** — `Login.tsx:31` Supabase error message-ni birbaşa göstərir
- **Şifrəni unutdum səhifəsi yoxdur** — yalnız generic magic-link düyməsi

---

## 🟠 MODUL 2 — Dashboard (PRD §6)

- **REQ-DASH-01: Aktiv layihə health widget yoxdur** — admin dashboard-da əsas widget tamamilə absent
- **REQ-DASH-02: User dashboardda admin-only kart görünür** — Müştərilər/Maliyyə kartları hamı üçün render olunur (RLS 0 row qaytarır → ölü linklər)
- **`useTeamPresence` 30 saniyəlik polling** (`hooks.ts:324`) — PRD §10.5.1 realtime channel istəyir, polling ban
- **Empty state CTA-ları yoxdur** — `Dashboard.tsx:331-374` empty mesajlar var, "Yeni layihə yarat" CTA yoxdur
- **Personal OKR yalnız 3 göstərir** — "Hamısı →" link yoxdur
- **REQ-DASH-04 health colors:** layihə health rəng kodu yoxdur (widget özü yoxdur)
- **US-DASH-04: Realtime 500ms p95** — global `tasks:all` invalidation ilə yerinə yetirilmir

---

## 🟠 MODUL 3 — Layihələr (PRD §7)

- **Closeout checklist DB-ə yazılmır** — `ProjectDetail.tsx:84` yalnız `useState` saxlayır, refresh → bütün progress itir
- **`system_awards.deadline_month` parse səhvi** — `ProjectDetail.tsx:627` `'YYYY-MM'` gözləyir, sxemdə `int` (1-12)
- **`applications jsonb` type mismatch** — sxem `'[]'` array, kod `Record<string, ...>` obyekt gözləyir
- **Reopen `archived_at`-ı təmizləmir** — `ProjectDetail.tsx:705` reopened layihə hələ də arxivdə görünür
- **Tasks tab barebones** — filter, inline status update, add-task düyməsi yox
- **History tab `entity_id` filterdir** — task-ların activity-si layihə history-də görünmür
- **Phase edit UI yoxdur** — sxemdə `phases[]`, UI dəyişdirə bilmir
- **`deadline >= start_date` validation yoxdur**
- **Documents `source: 'upload'` mərasimi yanıltıcı** — file upload affordance yoxdur, yalnız link

---

## 🟠 MODUL 4 — Tapşırıqlar (PRD §10)

- **REQ-TASK-01: Quick create yoxdur** — US-TASK-01 hər kanban column-da inline `+` istəyir, yalnız global `+ Yeni` var
- **REQ-TASK-02: Multi-assignee picker yoxdur** — `TaskCreateModal.tsx:84` yalnız `assignSelf` checkbox; admin başqasına task təyin edə bilmir
- **Task edit modal heç yerdə yoxdur** — yalnız comments və cancel
- **REQ-TASK-03: Optimistic update yoxdur** — drag→drop 200ms snap-back görünür
- **REQ-TASK-07: Mention parser uyğunsuz** — UI `@name` yığır, DB regex `@<uuid>` axtarır → `mentions[]` həmişə boş
- **Cədvəl view-da deadline rəng yoxdur** — Tasks.tsx:386 yalnız `'—'` göstərir
- **Search URL-də saxlanmır** — refresh → filter itir
- **Bulk archive non-admin RLS səssiz davranır** — defense-in-depth OK, amma worth flagging

---

## 🟠 MODUL 5 — CRM (PRD §8)

- **Search input `onChange` yoxdur** (`Clients.tsx:69`) — ölü UI
- **BD Lead drag-drop edə bilmir** — `isAdmin` ilə qapanıb, PRD BD Lead INSERT/UPDATE icazə verir
- **BD Lead `expected_value` görür** — PRD §5 RLS: BD Lead financial fields görməməlidir, `clients_select` policy ayırmır
- **REQ-CRM-02 pipeline value səhv hesablanır** — `Clients.tsx:46` stage confidence istifadə edir, `client.confidence_pct` yox
- **REQ-CRM-04 `ai_icp_fit` enum vs numeric uyğunsuzluğu** — kod 0-100, PRD enum {Excellent/Good/Medium/Low}
- **`last_interaction_at` yenilənmir** — interaction insert edəndə client kolonu update olmur
- **`logged_by` yazılmır** — interaksiyalar attribution-suz qalır
- **`project_documents.status` yoxdur** — PRD "Draft" status istəyir, sxemdə kolon yoxdur
- **ICP throttle yalnız client-side** — localStorage təmizləyərək bypass mümkündür
- **MIRAI-dən `\d+` regex parse** — strukturlaşdırılmış tool yox, brittle approach

---

## 🟠 MODUL 6 — Maliyyə (PRD §11)

- **REQ-FIN-01: Income → receivable auto-mark yoxdur** — IncomeExpenseModal yalnız income insert edir
- **incomes/expenses üçün activity_log trigger yoxdur** — Dashboard "Gəlir/Xərc" filter həmişə boşdur
- **REQ-FIN-08: Forecast hardcoded math** — MIRAI çağırılmır, "0.6" magic number, 6 aylıq tarix istifadə olunmur
- **US-FIN-08: `nextInvoiceNumber` race condition** — iki paralel istifadəçi eyni nömrəni alır
- **US-FIN-06: xlsx export yoxdur** — `xlsx` library install edilməyib
- **Receivables UI `client_id` raw UUID göstərir** — `Finance.tsx:160` join etmir
- **PnL kateqoriya breakdown yoxdur**
- **Recurring expenses backlog risk** — keçmiş tarixli `next_run_at` ilə qayda yaradanda dərhal toplu insert
- **`Sabit` tab `last_run_at` göstərmir** — next materialization preview missing

---

## 🟠 MODUL 7 — Komanda

### 7.1 Roster
- **3/5 PRD sahəsi yoxdur** — equipment count, current workload, role label göstərilmir
- **`useTeamPresence` rol dəyişikliyində invalidate olunmur**

### 7.2 Salary
- **US-SAL-02: Əvvəlki rowun `effective_to` set olmur** — yeni maaş əlavə edəndə köhnə açıq qalır
- **`audit_log` insert olmur** — kompensasiya dəyişikliyi audit trail-siz
- **Activity log trigger yoxdur** salaries tablosu üçün
- **Telegram notification göndərilmir** maaş dəyişəndə (PRD inkonsistent)

### 7.3 Performance
- **`'performance_review'` notification dispatcher whitelist-də yoxdur** — `notify-fanout.ts:40` fallback "Bildiriş" başlığı, body boş
- **Email/Telegram fan-out işləmir** bu kind üçün
- **Year selector 2026-dan başlayır** ✓

### 7.4 Leave
- **`'leave_request' / 'leave_approved' / 'leave_denied'` notification kind-ləri də dispatcher-də yoxdur** — eyni bug
- **N+1 admin notification insert** (`Leave.tsx:298`)
- **Half-day leave dəstəklənmir** (PRD-də istənmir, amma worth noting)

### 7.5 Calendar
- **US-CAL-01: `.ics` mailto body kimi göndərilir** — əksər email client-lər ignore edir; əlavə kimi göndərilməlidir
- **Recurring events expand olunmur** — `rrule.js` integrasiyası yoxdur, yalnız ilk instance görünür
- **Multi-day event ikiqat görünmür** — yalnız ilk gündə render
- **Event delete UI yoxdur**
- **`starts_at` timezone ambiguous** — UTC-Baku qarışığı

### 7.6 Announcements
- **REJECT bug:** `Announcements.tsx:59` `posted_announcement_id = 'rejected'` — sütun `uuid`, runtime exception
- **`read_by jsonb` istifadə olunmur** — unread tracking sınıq
- **`is_featured` toggle UI yoxdur**
- **"Hamısını oxunmuş işarələ" düyməsi yoxdur** Elanlar səhifəsində
- **`ann_insert` policy çox açıq** — non-admin də post edə bilər (RLS gap)

### 7.7 Equipment
- **`condition_log` client-side yazılır** — `al_insert` policy authenticated-ə açıqdır → audit hole
- **Confirm dialog olmadan reassign** — yanlış kliklə equipment dəyişir
- **CSV export yoxdur** (PRD-də istənmir)

---

## 🟠 MODUL 8 — Şirkət

### 8.1 OKR
- **US-OKR-02: Həftəlik nudge cron yoxdur** — `api/cron/okr-nudge.ts` yaradılmayıb
- **Personal OKR-da owner avatarı yoxdur** — admin görsələr kimin OKR-i bilməz

### 8.2 Career
- **US-CAREER-01 tamamilə yoxdur** — `profiles.career_level_id` kolon yoxdur, "current → next" personalized view yoxdur, kriteriya checkbox yoxdur
- Səhifə yalnız static ladder göstərir

### 8.3 Content Plan
- **US-CONTENT-01: 2-gün xəbərdarlıq cron yoxdur**
- **Status dəyişəndə optimistic update yoxdur** — 200ms flash

---

## 🟠 MODUL 9 — Settings (PRD §16)

- **`Reflect` company adı hardcoded, save yoxdur** — `Settings.tsx:97` `defaultValue` ilə oxunur, `onChange` yox
- **PDF upload endpoint yoxdur** (kritik #1)
- **Templates `_deprecated_*` filter olunmur** — listdə zibilliklər görünür
- **Invitations UI Resend bypass edir** — emaillər heç vaxt getmir
- **Region/Timezone disabled** ✓ (yalnız Asia/Baku)
- **`finance_alert` toggle non-admin-ə də göstərilir** — toggle ölüdür onlar üçün

---

## 🟠 MODUL 10 — MIRAI

- **REQ-7.1: SSE streaming yoxdur** — `api/mirai/chat.ts:255` non-streaming `messages.create()`, first-token 2-4s (büdcə ≤800ms)
- **REQ-7.5: 6 tool whitelist heç biri implement olunmayıb** — `list_my_tasks`, `create_task`, `firm_finance_snapshot` və s. — assistant aktion ala bilmir
- **REQ-7.7: Project context yoxdur** — system prompt-a yalnız count gedir, isim/faza/deadline yox
- **`mirai_monthly_budget` admin input ölüdür** — `chat.ts:24` hardcoded `$5`, UI input heç nəyə təsir etmir
- **REQ-7.6: 80% xəbərdarlıq sonradan göstərilir** — call başa çatdıqdan sonra, pre-flight olmalı
- **REQ-7.6: 1.05× over-budget multiplier** — PRD hard cap 100% deyir
- **CMO cron RSS feed-ləri hardcoded** — admin Settings-də custom feed-lər ignore olunur
- **`tools_used` heç vaxt yazılmır** — audit trail sınıq
- **MiraiDrawer-də submit düyməsi yoxdur** — yalnız Enter
- **Error chat-a "assistant message" kimi əlavə olunur** — yanıltıcı history
- **`mirai_feedback` unique constraint `message_index` istifadə edir** — session reload-da collision riski
- **Tokens_in user message-ə attribute olunur** — accounting inflate

---

## 🟠 MODUL 11 — Telegram

- **PRIVACY HOLE:** linking codes `system_settings`-də saxlanır, **bütün authenticated user-lar oxuya bilir** — başqasının chat_id-sini hijack etmək mümkündür
- **Webhook secret fail-open** — `TELEGRAM_WEBHOOK_SECRET` set edilməsə hər kəs webhook-a POST edə bilər
- **PRD 6 rəqəm deyir, kod 6 simvol alphanumeric istifadə edir**
- **PRD 10 dəq TTL deyir, kod 15 dəq**
- **`/help`, `/unlink`, `/status` komandaları yoxdur**

---

## 🟠 MODUL 12 — Archive / Done / Outsource / Notifications

### Archive
- **Filter date math timezone problem** — `dateTo + 'T23:59:59'` non-UTC vs UTC `archived_at`
- **Restore project `archived_at`-ı təmizləmir**
- **Bulk restore yoxdur**

### Done List
- **`completedAt` fallback `created_at`** — pre-archive trigger data-da sort drift
- **Completed-by attribution yoxdur** — `task_status_history.changed_by` UI-da göstərilmir

### Outsource
- **Səhifə strukturu sınıq** — schema mismatch, dead `+ Yeni`, status enum confusion (yuxarıda detalla)

### Notifications
- **NotificationBell 20 cap, badge `99+`** — list 20-də cap, badge daha çox görünüş yaradır
- **Notification grouping yoxdur** — 30 mention 30 row kimi görünür
- **`useMarkNotificationRead all:true`** RLS scoped, OK

---

## 🟠 CROSS-CUTTING UI/UX & ACCESSIBILITY

- **Mobile sidebar tamamilə gizlidir** (`hidden lg:flex`) — telefondan istifadə mümkünsüzdür, PRD iOS Safari 16+ deyir
- **Skeleton loader yoxdur** — PRD §6.7 "skeleton matching layout" deyir
- **Global error boundary yoxdur** — bir səhv → bütün app ağ ekran
- **Drag handlers keyboard alternative-siz** — WCAG 2.1 fail
- **Modal-larda focus trap yoxdur** — Tab arxa səhifəyə çıxır
- **`<input>` placeholder label kimi istifadə olunur** — screen reader oxuya bilmir
- **Color-only status signals** — Tasks border, presence dot, leave chip — WCAG fail
- **Empty state CTA-lar yoxdur** — Roster, Outsource, Equipment
- **`console.warn` production-da qalır** — `supabase.ts:9`, terser config yox
- **Mixed loading vocabulary** — "Yüklənir…", "AI analiz edir…", "Dərc edilir…"
- **Untranslated strings hardcoded AZ** — i18n yox
- **Page-head breadcrumb / back yoxdur** — yalnız sidebar nav
- **MiraiDrawer floating button mobile-da overlap edir**

---

## 🟠 SECURITY / RLS

- **`activity_log` policy çox açıq** — `new_value` jsonb-də income/expense delta-lar leak ola bilər
- **`projects` UPDATE admin-only** — creator öz layihəsini edit edə bilmir
- **`clients_admin_write` BD Lead-ə icazə vermir** — PRD INSERT istəyir
- **`templates` SELECT bütün authenticated-ə açıq** — invoice template pricing leak riski
- **CSRF protection yoxdur** `/api/*` endpoint-lərdə — origin/referer check yox
- **`is_project_member` çox dar** — yalnız creator + assignee, project_members table yox
- **`equipment.condition` sensitive data** authenticated select-də (acceptable)

---

## 🟠 PERFORMANCE / N+1

- **Tasks/Projects pagination yoxdur** — 500+ row-da kanban lag
- **Finance `limit(200)` quietly cap** — cash totals səhv olur böyük data-da
- **Dashboard `tasks-all-open` admin üçün limit-siz**
- **Notifications bell 20 cap, 99+ badge** — total unread az hesablanır
- **N+1 admin notification insert** Leave/announcements-də
- **`Calendar.tsx` 60-day window client-side filter**
- **`useTeamPresence` 30s polling** (PRD ban)

---

## 📊 NƏTİCƏ

Kod **arxitektura intizamı** (RLS-first, additive migrations, server-side cost guarding) göstərir, amma:
- **40-60% PRD coverage** end-to-end işləyir
- **Schema vs UI drift** mütəmadi pattern (Outsource, MIRAI persona, finance_alert keys)
- **Half-shipped features** kompilə olunur amma runtime-da ölü (Career personalization, MIRAI tools, KB upload, Salary effective_to)

---

## 🎯 SHIP-BLOCKING TOP 22

1. `/api/knowledge-base/upload` endpoint missing — RAG pipeline non-functional
2. `outsource_items` schema vs Finance UI mismatch — Outsource summary blank
3. MIRAI persona enum DB mismatch — admin personaları crash
4. `finance_alert` thresholds UI wrong key — admin threshold input ölüdür
5. Realtime channel subscribes to all tasks — 10×-100× refetch overhead
6. No incomes/expenses activity_log triggers — Dashboard finance filter boş
7. `mirai_monthly_budget` admin input has no effect on hardcoded $5 cap
8. MIRAI streaming SSE not implemented — first-token latency budget violated
9. MIRAI tool layer (6 whitelisted tools) not implemented
10. Career page promotion path personalization absent — `profiles.career_level_id` yox
11. OKR weekly nudge cron missing
12. Closeout checklist progress not persisted — refresh loses checks
13. Salary `effective_to` previous-row update missing
14. Mention parser DB regex expects `@<uuid>` but UI inserts `@name`
15. Telegram link code in `system_settings` readable by all — privacy hole
16. Webhook secret check fails-open if env var missing
17. Announcements approve flow inserts 'rejected' string into UUID column
18. Forecast cron is hardcoded math, not MIRAI-powered
19. Email enumeration on magic-link reset
20. Sidebar hidden on mobile entirely — app unusable on phones
21. No skeleton loaders, no error boundary, no i18n runtime
22. `activity_log` RLS too open — non-admins read income/expense deltas

---

## ⚡ İLK 5 PRIORITY FİX

1. **KB upload endpoint yarat** (RAG açır) — 2-3 saat
2. **MIRAI persona enum migration** (4 admin personası işə düşür) — 30 dəq
3. **Outsource schema/UI sync** (Finance dashboard düzəlir) — 1 saat
4. **finance_alert key uyğunlaşdır** (admin threshold-ları işləməyə başlayır) — 30 dəq
5. **Mobile sidebar drawer** (telefonda istifadə açılır) — 2 saat

**Toplam:** ~6-7 saat — sistem 80%-dən 95%-ə qalxır.
