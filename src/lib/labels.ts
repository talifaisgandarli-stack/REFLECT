import type {
  ClientPipelineStage,
  ClientTier,
  InteractionType,
  PresenceStatus,
  ProjectStatus,
  TaskStatus,
} from '@/types/db';

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  idea: 'İdeyalar',
  queued: 'Başlanmayıb',
  active: 'İcrada',
  review: 'Yoxlamada',
  expert: 'Ekspertizada',
  done: 'Tamamlandı',
  cancelled: 'Ləğv edilmiş',
};

export const TASK_STATUS_ORDER: TaskStatus[] = [
  'idea',
  'queued',
  'active',
  'review',
  'expert',
  'done',
];

export const TASK_STATUS_TONE: Record<TaskStatus, { dot: string; bg: string; text: string }> = {
  idea:      { dot: 'var(--chip-idea-dot)',   bg: 'var(--chip-idea-bg)',      text: 'var(--chip-idea-text)' },
  queued:    { dot: 'var(--info)',            bg: 'var(--chip-queued-bg)',    text: 'var(--chip-queued-text)' },
  active:    { dot: 'var(--chip-active-dot)', bg: 'var(--chip-active-bg)',    text: 'var(--chip-active-text)' },
  review:    { dot: 'var(--warning)',         bg: 'var(--chip-review-bg)',    text: 'var(--chip-review-text)' },
  expert:    { dot: 'var(--chip-expert-dot)', bg: 'var(--chip-expert-bg)',    text: 'var(--chip-expert-text)' },
  done:      { dot: 'var(--success)',         bg: 'var(--chip-done-bg)',      text: 'var(--chip-done-text)' },
  cancelled: { dot: 'var(--error)',           bg: 'var(--chip-cancelled-bg)', text: 'var(--error-deep)' },
};

/**
 * Duration unit options used by TaskCreateModal / TaskCommentsModal. Schema
 * stores `duration_unit` loosely as text; canonical values are plural
 * ('hours', 'days') to match what those modals write. Tasks.tsx
 * normalises via normalizeDurationUnit() for legacy / singular rows.
 */
export const DURATION_UNITS = ['hours', 'days'] as const;
export type DurationUnit = (typeof DURATION_UNITS)[number];
export const DURATION_UNIT_LABEL: Record<DurationUnit, string> = {
  hours: 'saat',
  days: 'gün',
};

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Aktiv',
  on_hold: 'Pauzada',
  closed: 'Bağlanıb',
  cancelled: 'Ləğv edilib',
};

// Status dot colour for the client-base mini project list (designstyle tokens).
export const PROJECT_STATUS_DOT: Record<ProjectStatus, string> = {
  active: 'var(--success)',
  on_hold: 'var(--warning)',
  closed: 'var(--text-muted)',
  cancelled: 'var(--error)',
};

export const CLIENT_STAGE_LABEL: Record<ClientPipelineStage, string> = {
  lead: 'Lead',
  proposal: 'Təklif',
  negotiation: 'Müzakirə',
  signed: 'İmzalanıb',
  in_progress: 'İcrada',
  portfolio: 'Portfolio',
  lost: 'Ləğv edilib',
  archived: 'Arxiv',
};

export const CLIENT_STAGE_CONFIDENCE: Record<ClientPipelineStage, number> = {
  lead: 10,
  proposal: 30,
  negotiation: 50,
  signed: 75,
  in_progress: 95,
  portfolio: 100,
  lost: 0,
  archived: 0,
};

// Canonical phase values stored in projects.phases[] (PRD REQ-PROJ-01). These
// strings are the source of truth in the DB — DO NOT change them (existing rows
// store them literally). For display, map through PHASE_LABEL below.
export const PROJECT_PHASES = [
  'Konsepsiya',
  'SD',
  'DD',
  'CD',
  'Tender',
  'İcra nəzarəti',
] as const;

// Full Azerbaijani display names for the canonical phase values. The stored
// value stays as PROJECT_PHASES (PRD REQ-PROJ-01); only the shown text differs.
export const PHASE_LABEL: Record<string, string> = {
  Konsepsiya: 'Konsepsiya',
  SD: 'Şəhərsalma Əsaslandırılması',
  DD: 'Eskiz Layihə (ilkin həllər, planlar)',
  CD: 'İşçi Layihə',
  Tender: 'Qiymət Təklifi',
  'İcra nəzarəti': 'Müəllif Nəzarəti',
};

// Display helper — falls back to the raw value for any custom/unknown phase.
export function phaseLabel(phase: string): string {
  return PHASE_LABEL[phase] ?? phase;
}

export const PRESENCE_LABEL: Record<PresenceStatus, string> = {
  online: 'Online',
  away: 'Uzaqda',
  offline: 'Offline',
};

export const CLIENT_STAGE_ORDER: ClientPipelineStage[] = [
  'lead',
  'proposal',
  'negotiation',
  'signed',
  'in_progress',
  'portfolio',
  'lost',
  'archived',
];

// Client relationship tier (CRM redesign, migration 0075): A=strateji,
// B=orta, C=kiçik. `null` = unassigned. Colours come from the CRM token scale
// (tokens.css), so no scattered raw hex.
export const CLIENT_TIER_LABEL: Record<ClientTier, string> = {
  A: 'A',
  B: 'B',
  C: 'C',
};

// Longer descriptive label (used in dropdowns / detail).
export const CLIENT_TIER_DESC: Record<ClientTier, string> = {
  A: 'A — Strateji',
  B: 'B — Orta',
  C: 'C — Kiçik',
};

export const CLIENT_TIER_ORDER: ClientTier[] = ['A', 'B', 'C'];

// Rank for sorting (lower = higher tier); unassigned (null) sorts last.
export const CLIENT_TIER_RANK: Record<ClientTier, number> = { A: 0, B: 1, C: 2 };

export function clientTierRank(tier: ClientTier | null): number {
  return tier ? CLIENT_TIER_RANK[tier] : 3;
}

// Token-only badge styling: { text/dot colour, background }.
export const CLIENT_TIER_STYLE: Record<ClientTier, { color: string; bg: string }> = {
  A: { color: 'var(--tier-a-fg)', bg: 'var(--tier-a-bg)' },
  B: { color: 'var(--tier-b-fg)', bg: 'var(--tier-b-bg)' },
  C: { color: 'var(--tier-c-fg)', bg: 'var(--tier-c-bg)' },
};

// ── CRM pipeline columns (client-based, PRD Module 6) ────────────────────────
// The board shows the active spec stages plus a terminal `lost` (Ləğv edilib)
// column so lost/cancelled deals stay visible and draggable; `signed` folds
// into İcrada, portfolio/archived are terminal (off-board). Colours reuse the
// CRM stage token scale (tokens.css).
export const PIPELINE_COLUMNS: ClientPipelineStage[] = [
  'lead',
  'proposal',
  'negotiation',
  'in_progress',
  'lost',
];

export const CLIENT_STAGE_STYLE: Partial<Record<ClientPipelineStage, { color: string; bg: string }>> = {
  lead:        { color: 'var(--stage-lead-fg)',      bg: 'var(--stage-lead-bg)' },
  proposal:    { color: 'var(--stage-teklif-fg)',    bg: 'var(--stage-teklif-bg)' },
  negotiation: { color: 'var(--stage-muzakire-fg)',  bg: 'var(--stage-muzakire-bg)' },
  signed:      { color: 'var(--stage-icrada-fg)',    bg: 'var(--stage-icrada-bg)' },
  in_progress: { color: 'var(--stage-icrada-fg)',    bg: 'var(--stage-icrada-bg)' },
  portfolio:   { color: 'var(--stage-portfolio-fg)', bg: 'var(--stage-portfolio-bg)' },
  lost:        { color: 'var(--stage-udulan-fg)',    bg: 'var(--stage-udulan-bg)' },
};

export function clientStageStyle(stage: ClientPipelineStage): { color: string; bg: string } {
  return CLIENT_STAGE_STYLE[stage] ?? { color: 'var(--text-muted)', bg: 'var(--surface-mist)' };
}

// The deal value means different things by stage (owner note 2026-06-25): a
// forecast early, a signed amount mid-deal, a final amount once delivered.
// Same `expected_value` column — only the label adapts so the prompt isn't
// "illogical" on already-agreed clients.
export function clientValueLabel(stage: ClientPipelineStage): string {
  if (stage === 'portfolio') return 'Yekun dəyər';
  if (stage === 'in_progress' || stage === 'signed') return 'Müqavilə dəyəri';
  if (stage === 'lost') return 'İtirilmiş dəyər';
  return 'Gözlənilən dəyər';
}

export const INTERACTION_LABEL: Record<InteractionType, string> = {
  call: 'Zəng',
  email: 'Email',
  meeting: 'Görüş',
  whatsapp: 'WhatsApp',
  other: 'Digər',
};

export const LOST_REASONS = [
  'Qiymət uyğun gəlmədi',
  'Rəqib seçildi',
  'Layihə təxirə salındı',
  'Əlaqə kəsildi',
  'Digər',
] as const;

export const CANCEL_REASONS = [
  'Müştəri imtina etdi',
  'Layihə dəyişdi',
  'Texniki problem',
  'Yenidən planlaşdırılır',
  'Digər',
] as const;
