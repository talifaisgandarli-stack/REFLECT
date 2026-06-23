# CRM Pipeline / Müştərilər — Spec (PRD-adapted)

**Source:** `PIPELINE_KANBAN_SPEC.md` (uploaded design spec), re-grounded onto the
canonical `docs/PRD.md` (Module 6, REQ-CRM-01..09 / §3.2) and `docs/designstyle4.md`.
**Rule:** PRD is canonical. This document keeps the spec's UX/interaction intent
but replaces every data-model, stack, security and design detail that conflicts
with the PRD. Nothing here changes "main logic", schema, or tokens.

> Where the original spec and the PRD disagree, **the PRD wins** and the reason is
> cited inline. The original spec stays untouched as a design reference.

---

## 0. Adaptation decisions (spec → PRD)

| # | Spec proposed | Adapted to (PRD) | Authority |
|---|---|---|---|
| 1 | 5 stages (Lead→Proposal→Discussion→Active→Portfolio) | **8 stages**, AZ labels (board shows 7, `archived` is the merge sink) | PRD §441, REQ-CRM-01 |
| 2 | Tier **A / B / C** | **VIP / Gold / Silver / Bronze / none** enum | PRD §3.2:139, REQ-CRM-09 |
| 3 | New `organization` column | existing **`company`**, displayed as **"Təşkilat"** | PRD §3.2:139 (no schema change) |
| 4 | `status` **computed** from projects | **stored `pipeline_stage`**, changed by drag | REQ-CRM-01 (main logic kept) |
| 5 | Card-detail **modal** | **slide-in detail panel** (no full-page nav) | REQ-CRM-05 |
| 6 | `₼` glyph, Tailwind hex palette (`#EEEDFE`…) | **AZN** via `formatAZN`, **designstyle4 tokens** | designstyle4 §2, §57/§75 |
| 7 | `@dnd-kit/core` | existing **native HTML5 drag** (admin-gated) | PRD §3.1 (not listed) |
| 8 | New `Activity` table | existing **`activity_log`** (DB trigger) + `client_interactions` + `client_stage_history` | PRD §3.2:141-142, §"activity_log" |
| 9 | `project.estimatedValue / progress` on cards | **not stored** — show project **status dot + phase**, no value/progress bars | PRD §3.2:133 (projects have `phases[]`, `status`, no value/progress) |
| 10 | "Anthropic Sans" | **Satoshi** | designstyle4 §3.1 |
| 11 | Zustand **or** React Context | **React Query** (server state) + **Zustand** (UI state) | PRD §3.1 |
| 12 | Plain value visible to all | **`expected_value` masked** from BD Lead via `clients_view` + RLS | PRD §464, REQ-CRM (0073) |

---

## 1. Data model (as it already exists — no migration)

### 1.1 `clients` (PRD §3.2)
```
id              uuid
name            text        -- contact person ("Elturan bəy")
company         text        -- organisation, shown as "Təşkilat" ("Dövlət Gömrük Komitəsi")
email           text
phone           text
pipeline_stage  enum(8)     -- lead|proposal|negotiation|signed|in_progress|portfolio|lost|archived
confidence_pct  int         -- 0–100, defaults per stage (REQ-CRM-02)
expected_value  numeric     -- AZN, ADMIN-ONLY (masked to null in clients_view, §464)
last_interaction_at  timestamptz
ai_icp_fit           int    -- MIRAI ICP score, cached (REQ-CRM-04)
ai_icp_calculated_at timestamptz
industry        text        -- migration 0050
tier            enum        -- vip|gold|silver|bronze|none (migration 0074), admin-set
created_by      uuid
created_at      timestamptz
```
Read through **`clients_view`** (masks `expected_value` for non-admins, 0073/0074).
There is **no** `organization`, `notes`, `primaryContact`, `totalPipelineValue`, or
`status` column — those spec fields are either renamed (`company`) or computed.

### 1.2 Computed / derived (not stored)
- **Pipeline value per stage** = `Σ(expected_value × confidence_pct/100)` (REQ-CRM-02), admin-only.
- **Project activity** (`active / total`) per client comes from the
  **`client_project_stats`** aggregate view (migration 0074) — single query, **no N+1**.
- **Last interaction** is the stored `last_interaction_at`, bumped on every
  `client_interactions` insert (REQ-CRM-03).

### 1.3 `projects` (PRD §3.2) — what the card may show
```
id, name, client_id, phases[] text[], status enum(active|on_hold|closed|cancelled),
deadline, start_date, requires_expertise, ...
```
Projects have **no `value`, `type`, or `progress`** columns. So the card's project
list shows **name + status dot + phase chip** — never a money figure or % bar
(those would be invented schema, forbidden by prd-guard §5).

### 1.4 Related tables (reuse — do not invent)
- `client_interactions` (type, note, occurred_at, logged_by) — REQ-CRM-03
- `client_stage_history` (from_stage, to_stage, changed_by, lost_reason) — REQ-CRM-01
- `activity_log` — written by DB trigger on every client mutation (no app-level Activity table)
- `project_documents` with `category='price_protocol'` = proposals (REQ-CRM-06)

---

## 2. Pipeline stages (8, AZ) — replaces the spec's 5

| Stage (enum) | Label | Confidence | On board? |
|---|---|---|---|
| `lead` | Lead | 10% | ✅ |
| `proposal` | Təklif | 30% | ✅ |
| `negotiation` | Müzakirə | 50% | ✅ |
| `signed` | İmzalanıb | 75% | ✅ |
| `in_progress` | İcrada | 95% | ✅ |
| `portfolio` | Portfolio | 100% | ✅ |
| `lost` | Udulan | 0% | ✅ (drop target; requires `lost_reason`) |
| `archived` | Arxiv | — | ❌ merge soft-archive sink, excluded from the board |

Board renders the 7 non-archived stages (`BOARD_STAGES`). Dragging to **Udulan**
opens an inline reason picker (`LOST_REASONS`) before the `client_stage_history`
row is written (REQ-CRM-01).

---

## 3. Component architecture (adapted)

```
<ClientsPage>                         (src/pages/Clients.tsx)
 ├─ <PageHead>                        designstyle4 §4.6 topbar
 ├─ <ClientsKpiStrip>                 summary numbers (replaces spec SummaryBar charts)
 ├─ View toggle  [ Pipeline | Cədvəl ]   REQ-CRM-09 (same page, URL-persisted)
 │
 ├─ Pipeline view (native-drag kanban)
 │   └─ Column ×7  →  <ClientKanbanCard>
 │        ├─ name + <TierBadge>
 │        ├─ Təşkilat (company)
 │        ├─ inline expected_value edit   (admin only, mask-aware)  ← shipped
 │        ├─ last-contact meta + active/total chip
 │        ├─ ▸ Layihələr (N)  expandable list  (lazy, status dot + phase)
 │        └─ industry chip
 │
 ├─ Table view  <ClientsTable>        (src/pages/clients/AccountsTable.tsx)
 │   └─ sortable + group-by (None/Tier/Stage/Industry) + projects popover
 │
 └─ <ClientPanel>  slide-in (REQ-CRM-05) — overview · interactions · proposals · projects · documents
```

State: **React Query** owns server data (`['clients']`, `['client-project-stats']`,
`['client-projects-pop', id]`); **Zustand** (`useAuth`) owns session/role. No
custom context, no Redux. Optimistic edits = mutate Supabase → `invalidateQueries`.

---

## 4. Key interactions (adapted)

### 4.1 Drag & drop — native, admin-only
`draggable` cards + column `onDrop`; payload `{id, from}`. On drop →
`useUpdateClientStage` writes the row, appends `client_stage_history`, and sets
`confidence_pct` to the stage default. Optimistic; rolls back + toast on error.
Non-admins get a read-only board (drag disabled) and an accessible
`<select>` stage changer in the panel (keyboard/touch path).
**No `@dnd-kit`** — it isn't in PRD §3.1.

### 4.2 Inline editing (the spec's "click → edit → Enter" pattern, kept)
Reuse `ClientFieldEditor` / `CardValueEditor`: click → input → **Enter** saves,
**Esc** cancels, `✓/×` affordances, error surfaced inline. Editable on card/panel:
`expected_value` (admin, mask-aware), `tier` (admin), `company`, `email`, `phone`,
`confidence_pct`, `industry`. All gated by role; financial fields never reach BD Lead.

### 4.3 Status indicators
- **Tier badge** — `CLIENT_TIER_STYLE` tokens (VIP=brand-soft, Gold=warning,
  Silver/Bronze=surface-mist). Never raw hex.
- **Project status dot** — designstyle4 §2.4 status tones:
  `active`→Active blue `#3B82F6`, `on_hold`→Review amber `#D97706`,
  `closed`→Done green `#22C55E`, `cancelled`→Cancel red `#EF4444`.
- **Overdue** ("N gündür əlaqə yoxdur") — **NOT a PRD requirement.** Omit unless a
  `REQ-CRM` line is added first (prd-guard §3). Earlier decision: skip.

### 4.4 Filtering & sorting
- View: `Pipeline | Cədvəl` (REQ-CRM-09).
- Table: group-by None/Tier/Stage/Industry + per-column sort (incl. project count).
- Pipeline: card sort. A **service-type** filter is dropped — projects use
  `phases[]`, there is no Tikinti/Dizayn/… enum to filter on (would be invented schema).

---

## 5. Data access (Supabase, not raw SQL endpoints)

The spec's REST/SQL section is replaced by the existing typed Supabase hooks
(`src/lib/hooks.ts`): `useClients`, `useClientInteractions`, `useClientStageHistory`,
`useLogInteraction`, `useUpdateClientStage`. Reads go through `clients_view`
(masking) and `client_project_stats` (counts). No bespoke `/api/clients` Express
layer — PRD §3.1 is Supabase + RLS, with server `/api/*` reserved for AI/secrets.

**Pipeline value (REQ-CRM-02):** computed client-side from the loaded rows,
admin-only; `confidence_pct` comes from the stage default but stays editable.

---

## 6. Security & RLS (non-negotiable)

- `clients` **admin-only** by default; **BD Lead** (level 3) gets SELECT/INSERT but
  **never** `expected_value` (PRD §464). Enforced by `clients_view` masking + RLS,
  not the client.
- Hard delete = admin danger-zone, typed-name confirm (REQ-CRM-08); merge
  (soft-archive) is preferred for duplicates.
- Every create/update/delete → `activity_log` via DB trigger (audit trail).
- `expected_value` inline edit renders **only under `isAdmin`** and writes the real
  column; non-admin payloads can't reach it (RLS).

---

## 7. Design tokens (designstyle4 — replaces the spec's hex palette)

| Spec used | designstyle4 token |
|---|---|
| `#6366F1`-style primary | `--brand-action` `#ADFB49` (bg only, ink text) / `--brand-text` `#1A5140` (text) |
| card bg `#FFFFFF` | `--surface` (cards) on `--canvas` `#FAFAF7` body (dot grid) |
| borders | `--line` / `--line-soft` |
| muted text | `--text-soft` / `--text-muted` |
| status purple/blue/amber/green/red | §2.4 status set (Ideas/Active/Review/Done/Cancel) |
| "Anthropic Sans" | **Satoshi**, scale §3.2, numbers `tabular-nums` (§247) |

Currency is **AZN** (`formatAZN`), Asia/Baku timezone — unchanged vocabulary
(designstyle4 §57). No new colour, font, or radius is introduced.

---

## 8. Accessibility (designstyle4 §6)

- Keyboard: cards are `role="button"` + `tabIndex=0` (Enter/Space opens panel);
  stage `<select>` is the non-drag path. Focus ring = `--brand-action` 2px (§194).
- Colour never alone: status = dot **+** label; tier = chip **+** text.
- WCAG AA contrast (§6.3); honour `prefers-reduced-motion` for drag/transitions (§6.2).

---

## 9. Build status vs this spec

| Capability | State |
|---|---|
| 8-stage drag kanban + stage history + lost-reason | ✅ shipped (REQ-CRM-01) |
| Slide-in panel (overview/interactions/proposals/projects/documents) | ✅ shipped (REQ-CRM-05) |
| `Pipeline | Cədvəl` toggle, sortable table, group-by, projects popover | ✅ shipped (REQ-CRM-09) |
| Tiers (VIP/Gold/Silver/Bronze) inline-editable by admin | ✅ shipped |
| KPI strip | ✅ shipped |
| Inline `expected_value` edit on card (admin, mask-aware) | ✅ shipped (this session) |
| **Expandable project list on the card** (status dot + phase) | ⬜ spec idea, PRD-safe, not built |
| **Last-contact + active/total meta on card** | ⬜ spec idea, PRD-safe, not built |
| Overdue alert | ❌ not in PRD — intentionally skipped |
| 5 stages / A-B-C tiers / organization col / modal / @dnd-kit / ₼ | ❌ rejected (conflict with PRD) |

The only **net-new, PRD-compatible** work the spec implies is the two ⬜ rows
(richer card face). Everything else is either shipped or rejected as a PRD conflict.

---

*Adapted 2026-06-23. Reference only — `docs/PRD.md` remains the single source of truth.*
