# Reflect Architects OS — Tam Audit (tamauditvol.md)
**Tarix:** 2026-05-14  
**Əhatə:** PRD.md × designstyle4.md × codebase (12 modul + §6–§9 cross-cutting)  
**Ümumi uyğunluq:** ~78% (kritik blokerlər yoxdur, lakin token sistemi sistemli boşluq var)

---

## 1. Executive Summary

| Sahə | Uyğunluq | Kritik boşluq |
|------|----------|---------------|
| PRD Module 1–6 (Auth, Dashboard, Tasks, Projects, Clients, Finance) | ~90% | Rate-check Login.tsx-dən çağırılır (lib/auth.ts:68) — OK |
| PRD Module 7–12 (MIRAI, Salary, Roster, Leave, Perf, Settings, Telegram) | ~82% | §7.9 per-persona usage log yoxdur |
| designstyle4 token sistemi | ~68% | Semantic rəng tokenləri TAMAMƏN eksikdir; 10+ faylda hardcoded hex |
| §6 Cross-cutting (Keyboard, i18n, a11y, Realtime) | ~85% | Realtime SR annoucement; i18n ayrı fayl yoxdur |
| §9 Security / §9.4 Monitoring | ~80% | console.log prod-da silinmir; parity testlər yoxdur |

---

## 2. Modul-by-Modul PRD Boşluqları

### MODULE 1 — Auth (PRD §5)
| # | Tələb | Status | Qeyd |
|---|-------|--------|------|
| 1.1 | REQ-AUTH-01: Login rate limit | ✅ | `api/auth/rate-check.ts` mövcuddur; `src/lib/auth.ts:68` çağırır |
| 1.2 | RLS hər cədvəldə | ✅ | Bütün migrasyonlarda `enable row level security` var |
| 1.3 | Email/password sign-in | ✅ | `supabase.auth.signInWithPassword` |
| 1.4 | Session hydration (Zustand) | ✅ | `src/lib/store.ts` + `src/lib/auth.ts` |

### MODULE 2 — Dashboard (PRD §4)
| # | Tələb | Status | Qeyd |
|---|-------|--------|------|
| 2.1 | MIRAI quick-launch (Cmd+/) | ✅ | `Layout.tsx` keyboard handler |
| 2.2 | Presence dots (online/away/offline) | ⚠️ | Hardcoded hex `#22C55E`/`#D97706`/`#94A3B8` — token yox (`Dashboard.tsx:82–86`) |
| 2.3 | Workload bar colors | ⚠️ | Hardcoded hex — `Dashboard.tsx:94–98` |
| 2.4 | Health label colors | ⚠️ | Hardcoded hex — `Dashboard.tsx:62–66` |
| 2.5 | "Bu gün" column dark card | ⚠️ | `#1F2925` / `#2D3833` hardcoded — `Dashboard.tsx:276–277` |
| 2.6 | OKR pct color | ⚠️ | `#16A34A`/`#D97706`/`#B91C1C` hardcoded — `Dashboard.tsx:607` |

### MODULE 3 — Tasks (PRD §10.2)
| # | Tələb | Status | Qeyd |
|---|-------|--------|------|
| 3.1 | 7-status Kanban | ✅ | |
| 3.2 | Keyboard select (j/k, Enter, Escape) | ✅ | a11y commit |
| 3.3 | Status deadline rəngləri | ⚠️ | `Tasks.tsx:35–37`, `450–452` hardcoded hex |
| 3.4 | Kanban "Bu gün" column dark bg | ⚠️ | `Tasks.tsx:319–320`, `356` hardcoded `#1F2925`/`#2D3833` |
| 3.5 | Cmd+N → yeni tapşırıq | ✅ | `Layout.tsx` + `UIState.taskCreateOpen` |

### MODULE 4 — Projects (PRD §11)
| # | Tələb | Status | Qeyd |
|---|-------|--------|------|
| 4.1 | Deadline banner rəngi | ⚠️ | `ProjectDetail.tsx:198` hardcoded `#B91C1C`/`#D97706`/`#16A34A` |
| 4.2 | Phase edit | ✅ | |
| 4.3 | MIRAI `summarize_project` tool | ✅ | PR #13-də əlavə edildi |

### MODULE 5 — Clients (PRD §12)
| # | Tələb | Status | Qeyd |
|---|-------|--------|------|
| 5.1 | CRUD + RLS | ✅ | |
| 5.2 | Client-linked projects | ✅ | |

### MODULE 6 — Finance (PRD §8.2)
| # | Tələb | Status | Qeyd |
|---|-------|--------|------|
| 6.1 | Salary table (admin vs user RLS) | ✅ | `src/pages/team/Salary.tsx` |
| 6.2 | finance_alert → Telegram admin-only | ✅ | `notify-fanout.ts:201` |
| 6.3 | Audit log `salary_created` | ✅ | `Salary.tsx:185` |

### MODULE 7 — MIRAI (PRD §7)
| # | Tələb | Status | Qeyd |
|---|-------|--------|------|
| 7.1 | 7 server tools | ✅ | PR #13-də `summarize_project` əlavə edildi |
| 7.2 | Budget guard per-user | ✅ | `mirai_usage_log` + RPC |
| 7.3 | §7.9 Per-persona usage tracking | ⚠️ | `mirai_usage_log` yalnız `user_id` + `period_yyyymm` saxlayır; `persona` sahəsi yoxdur |
| 7.4 | MIRAI hardcoded rənglər | ⚠️ | `Mirai.tsx:248`, `263`, `290`, `333`; `MiraiDrawer.tsx:112`, `156` |
| 7.5 | Cmd+/ toggle | ✅ | |

### MODULE 8 — Team HR (PRD §8)
| # | Tələb | Status | Qeyd |
|---|-------|--------|------|
| 8.1 | Roster skill level colors | ⚠️ | `Roster.tsx:15` — `rgba(217,119,6,0.12)` hardcoded |
| 8.2 | Leave status rənglər | ⚠️ | `Leave.tsx:34–35` hardcoded |
| 8.3 | Performance bar color | ⚠️ | `Performance.tsx:36` — `#F59E0B`/`#EF4444` hardcoded |
| 8.4 | DoneList green dot | ⚠️ | `DoneList.tsx:183` — `#22C55E` hardcoded |

### MODULE 9 — OKR (PRD §13)
| # | Tələb | Status | Qeyd |
|---|-------|--------|------|
| 9.1 | OKR health colors | ⚠️ | `Okr.tsx:46`, `105` hardcoded `#D97706`/`#B91C1C`/`#16A34A` |
| 9.2 | okr_nudge notification | ✅ | PR #13-də `notify-fanout.ts` KIND_TITLE-a əlavə edildi |

### MODULE 10 — Parametrlər / Settings (PRD §10)
| # | Tələb | Status | Qeyd |
|---|-------|--------|------|
| 10.1 | okr_nudge event toggle | ✅ | PR #13-də əlavə edildi |
| 10.2 | mirai_feed event toggle | ✅ | PR #13-də əlavə edildi |
| 10.3 | Error banner rəngi | ⚠️ | `Settings.tsx:270` — `#B91C1C` hardcoded |
| 10.4 | Firm name save | ✅ | |

### MODULE 11 — Telegram (PRD §8.1)
| # | Tələb | Status | Qeyd |
|---|-------|--------|------|
| 11.1 | 6-digit linking code | ✅ | |
| 11.2 | Authorization header | ✅ | PR #14-də düzəldildi |
| 11.3 | Deep link `VITE_TELEGRAM_BOT_USERNAME` | ✅ | PR #14-də əlavə edildi |
| 11.4 | mirai_feed KIND_TITLE | ✅ | PR #14-də əlavə edildi |

### MODULE 12 — Notifications (PRD §6.4)
| # | Tələb | Status | Qeyd |
|---|-------|--------|------|
| 12.1 | Fan-out (email + Telegram) | ✅ | `notify-fanout.ts` |
| 12.2 | Opt-out model (missing row = enabled) | ✅ | `notify-fanout.ts:105` |
| 12.3 | finance_alert admin-only | ✅ | `notify-fanout.ts:201` |
| 12.4 | salary_changed notification insert | ✅ | `Salary.tsx:191–196` |

---

## 3. §6–§9 Cross-Cutting Boşluqları

### §6 — Platform-wide UX
| # | Tələb | Status | Qeyd |
|---|-------|--------|------|
| §6.1 | Cmd+K command palette | ✅ | `CmdK.tsx` |
| §6.2 | Cmd+N → new task | ✅ | PR #14-də əlavə edildi |
| §6.3 | G+D/T/P/M/F navigation | ✅ | `Layout.tsx:23–30` |
| §6.4 | Cmd+/ MIRAI toggle | ✅ | `Layout.tsx:45–48` |
| §6.5 | i18n strings `locales/az.json` | ⚠️ | Ayrı fayl yoxdur; bütün stringlər inline Azərbaycancadır — PRD §6.5 ayrı lokalizasiya faylı tələb edir |
| §6.6 | Screen reader live region (realtime) | ⚠️ | `LiveAnnouncer` komponenti var, lakin realtime yeniləmələr üçün `announce()` çağırışları tam deyil |

### §9 — Security & Observability
| # | Tələb | Status | Qeyd |
|---|-------|--------|------|
| §9.1 | RLS hər cədvəldə | ✅ | |
| §9.1 | `console.log` prod-da strip | ⚠️ | `vite.config.ts`-də `drop: ['console']` yoxdur; dev loglar prod-a çıxa bilər |
| §9.3 | Pre-deploy parity tests | ⚠️ | CI konfiqurasiyanı görünməyir; test suite mövcud deyil |
| §9.4 | Sentry error tracking | ✅ | PR #13-də əlavə edildi (conditional `VITE_SENTRY_DSN`) |

---

## 4. designstyle4 Token Sistemi Audit

### 4.1 Mövcud Tokenlar (tokens.css) — Tam Siyahı
```css
/* BRAND */       --brand-action, --brand-action-hover, --brand-action-soft
                  --brand-text, --brand-deep, --brand-mid, --brand-soft, --brand-mist
/* NEUTRALS */    --canvas, --canvas-dots, --canvas-warm, --surface, --surface-mist
                  --line, --line-soft
/* TEXT */        --ink, --text, --text-soft, --text-muted, --text-faint
/* MIRAI */       --mirai-surface, --mirai-particle, --mirai-glow
/* MASCOT */      --mascot-body, --mascot-eye
/* FOCUS */       --focus-ring
/* MOTION */      --ease-out, --ease-in, --ease-spring, --dur-fast, --dur-base, --dur-slow
```

### 4.2 Eksik Tokenlar (tokens.css-ə əlavə olunmalı)
```css
/* Semantic — status */
--success:          #22C55E;   /* health green, presence online, done state */
--warning:          #D97706;   /* amber, away, at-risk */
--error:            #EF4444;   /* overdue, red health */
--error-deep:       #B91C1C;   /* dark error text/border */
--error-bg:         rgba(185, 28, 28, 0.10);
--error-border:     rgba(185, 28, 28, 0.40);
--info:             #94A3B8;   /* neutral/offline */
--success-deep:     #16A34A;   /* OKR on-track */

/* Dark context (Kanban "Bu gün" kolonu, realtime overlay) */
--card-dark-bg:     #1F2925;
--card-dark-border: #2D3833;

/* Presence */
--presence-online:  var(--success);
--presence-away:    var(--warning);
--presence-offline: var(--info);

/* MIRAI extended */
--mirai-warning:    #FFD9A8;   /* MIRAI assistant text warm */
--mirai-error-text: #F87171;   /* MIRAI error soft */
--mirai-error-bg:   rgba(185, 28, 28, 0.15);
```

### 4.3 Token İhlalları — Fayl × Sətir

| Fayl | Sətir(lər) | Hardcoded dəyər | Doğru token |
|------|-----------|-----------------|-------------|
| `src/pages/Dashboard.tsx` | 63 | `#22C55E` | `var(--success)` |
| `src/pages/Dashboard.tsx` | 64 | `#D97706` | `var(--warning)` |
| `src/pages/Dashboard.tsx` | 65 | `#EF4444` | `var(--error)` |
| `src/pages/Dashboard.tsx` | 66 | `#94A3B8` | `var(--info)` |
| `src/pages/Dashboard.tsx` | 83 | `#22C55E` | `var(--presence-online)` |
| `src/pages/Dashboard.tsx` | 84 | `#D97706` | `var(--presence-away)` |
| `src/pages/Dashboard.tsx` | 85 | `#94A3B8` | `var(--presence-offline)` |
| `src/pages/Dashboard.tsx` | 95 | `#22C55E` | `var(--success)` |
| `src/pages/Dashboard.tsx` | 96 | `#D97706` | `var(--warning)` |
| `src/pages/Dashboard.tsx` | 97 | `#EF4444` | `var(--error)` |
| `src/pages/Dashboard.tsx` | 276 | `#1F2925` | `var(--card-dark-bg)` |
| `src/pages/Dashboard.tsx` | 277 | `#2D3833` | `var(--card-dark-border)` |
| `src/pages/Dashboard.tsx` | 607 | `#16A34A`/`#D97706`/`#B91C1C` | `var(--success-deep)`/`var(--warning)`/`var(--error-deep)` |
| `src/pages/Tasks.tsx` | 35 | `#EF4444` | `var(--error)` |
| `src/pages/Tasks.tsx` | 36 | `#D97706` | `var(--warning)` |
| `src/pages/Tasks.tsx` | 37 | `#22C55E` | `var(--success)` |
| `src/pages/Tasks.tsx` | 319 | `#1F2925` | `var(--card-dark-bg)` |
| `src/pages/Tasks.tsx` | 320 | `#2D3833` | `var(--card-dark-border)` |
| `src/pages/Tasks.tsx` | 356 | `#2D3833` | `var(--card-dark-border)` |
| `src/pages/Tasks.tsx` | 450–452 | `#EF4444`/`#D97706`/`#22C55E` | `var(--error)`/`var(--warning)`/`var(--success)` |
| `src/pages/Mirai.tsx` | 248 | `#FFD9A8` | `var(--mirai-warning)` |
| `src/pages/Mirai.tsx` | 263 | `rgba(185,28,28,*)`, `#FCA5A5` | `var(--mirai-error-bg)`, `var(--mirai-error-text)` |
| `src/pages/Mirai.tsx` | 290 | `#FCA5A5` | `var(--mirai-error-text)` |
| `src/pages/Mirai.tsx` | 333 | `#F87171` | `var(--mirai-error-text)` |
| `src/components/MiraiDrawer.tsx` | 112 | `#FFD9A8` | `var(--mirai-warning)` |
| `src/components/MiraiDrawer.tsx` | 156 | `#F87171` | `var(--mirai-error-text)` |
| `src/pages/ProjectDetail.tsx` | 198 | `#B91C1C`/`#D97706`/`#16A34A` | `var(--error-deep)`/`var(--warning)`/`var(--success-deep)` |
| `src/pages/Settings.tsx` | 270 | `#B91C1C` | `var(--error-deep)` |
| `src/pages/company/Okr.tsx` | 46 | `#D97706` | `var(--warning)` |
| `src/pages/company/Okr.tsx` | 105 | `#16A34A`/`#D97706`/`#B91C1C` | `var(--success-deep)`/`var(--warning)`/`var(--error-deep)` |
| `src/pages/team/Performance.tsx` | 36 | `#F59E0B`/`#EF4444` | `var(--warning)`/`var(--error)` |
| `src/pages/team/Leave.tsx` | 34 | `#22C55E` | `var(--success)` |
| `src/pages/team/Leave.tsx` | 35 | `#EF4444` | `var(--error)` |
| `src/pages/team/Roster.tsx` | 15 | `#D97706`, `rgba(217,119,6,0.12)` | `var(--warning)`, `rgba(var(--warning-rgb), 0.12)` |
| `src/pages/DoneList.tsx` | 183 | `#22C55E` | `var(--success)` |

**Düzgün istifadə nümunəsi** (Avatar.tsx bu şəkildə edir):
```tsx
// ✅ Avatar.tsx:11 — fallback ilə var() — doğru pattern
online: 'var(--presence-online, #22C55E)',
```

---

## 5. Prioritetli Düzəliş Siyahısı

### 🔴 CRITICAL (bu sprint)

| # | İş | Fayl | Cəmi dəyişiklik |
|---|----|----|-----------------|
| C1 | `tokens.css`-ə semantic tokenlar əlavə et (§4.2 siyahısı) | `src/styles/tokens.css` | +16 sətir |
| C2 | `Dashboard.tsx` — HEALTH_COLOR, PRESENCE_DOT, workloadColor → CSS var() | `src/pages/Dashboard.tsx` | ~10 sətir |
| C3 | `Tasks.tsx` — STATUS_COLORS + `#1F2925`/`#2D3833` → CSS var() | `src/pages/Tasks.tsx` | ~8 sətir |
| C4 | `Mirai.tsx` + `MiraiDrawer.tsx` — hardcoded hex → MIRAI tokenlar | `src/pages/Mirai.tsx`, `src/components/MiraiDrawer.tsx` | ~6 sətir |

### 🟠 HIGH (bu sprint)

| # | İş | Fayl | Qeyd |
|---|----|----|------|
| H1 | `ProjectDetail.tsx:198` deadline banner → token | `src/pages/ProjectDetail.tsx` | 1 sətir |
| H2 | `Okr.tsx:46,105` pct rəngləri → token | `src/pages/company/Okr.tsx` | 2 sətir |
| H3 | `Roster.tsx:15` skill badge rəngi → token | `src/pages/team/Roster.tsx` | 1 sətir |
| H4 | `Settings.tsx:270` error → token | `src/pages/Settings.tsx` | 1 sətir |
| H5 | §7.9 — `mirai_usage_log`-a `persona` sütunu əlavə et | yeni miqrasyon | PRD §7.9 açıq tələb |

### 🟡 MEDIUM (növbəti sprint)

| # | İş | Qeyd |
|---|----|----|
| M1 | `vite.config.ts`-də `build.terserOptions.compress.drop = ['console']` | §9.1 |
| M2 | `Leave.tsx:34-35`, `Performance.tsx:36`, `DoneList.tsx:183` → token | Eyni pattern, toplu düzəliş |
| M3 | `LiveAnnouncer` — realtime task/project yeniləmələrini elan et | §6.6 SR coverage |

### 🟢 LOW (backlog)

| # | İş | Qeyd |
|---|----|----|
| L1 | `locales/az.json` yaradılması | §6.5 — inline strings işləyir, lakin PRD ayrı fayl tələb edir |
| L2 | CI-də smoke/parity test konfiqurasyonu | §9.3 |

---

## 6. Tokens.css — Tam Diff (C1 üçün)

Aşağıdakı bloku `src/styles/tokens.css`-in `:root {}` içinə əlavə et:

```css
  /* Semantic — status */
  --success:          #22C55E;
  --success-deep:     #16A34A;
  --warning:          #D97706;
  --error:            #EF4444;
  --error-deep:       #B91C1C;
  --error-bg:         rgba(185, 28, 28, 0.10);
  --error-border:     rgba(185, 28, 28, 0.40);
  --info:             #94A3B8;

  /* Dark context (Kanban today column) */
  --card-dark-bg:     #1F2925;
  --card-dark-border: #2D3833;

  /* Presence aliases */
  --presence-online:  #22C55E;
  --presence-away:    #D97706;
  --presence-offline: #94A3B8;

  /* MIRAI extended */
  --mirai-warning:    #FFD9A8;
  --mirai-error-text: #FCA5A5;
  --mirai-error-text-alt: #F87171;
  --mirai-error-bg:   rgba(185, 28, 28, 0.15);
  --mirai-error-border: rgba(185, 28, 28, 0.40);
```

---

## 7. Tamamlanan İşlər (Bu Sessiyadakı PR-lar)

| PR | Başlıq | Düzəlişlər |
|----|--------|-----------|
| #13 | Module 10+11: Settings & MIRAI gaps | `okr_nudge`+`mirai_feed` event toggles; `summarize_project` tool; Sentry init |
| #14 | Module 12 + cross-cutting gaps | TelegramLink auth header; `VITE_TELEGRAM_BOT_USERNAME` deep link; `notify-fanout` KIND_TITLE; `taskCreateOpen` UIState; `Cmd+N` shortcut; `.then(null)` TS fix |

---

*Audit üsulu: PRD.md tam oxundu; designstyle4.md Appendix A ilə tokens.css müqayisə edildi; hər modul faylları `Grep` + `Read` ilə yoxlandı.*
