import type {
  ClientPipelineStage,
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

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Aktiv',
  on_hold: 'Pauzada',
  closed: 'Bağlanıb',
  cancelled: 'Ləğv edilib',
};

export const CLIENT_STAGE_LABEL: Record<ClientPipelineStage, string> = {
  lead: 'Lead',
  proposal: 'Təklif',
  negotiation: 'Müzakirə',
  signed: 'İmzalanıb',
  in_progress: 'İcrada',
  portfolio: 'Portfolio',
  lost: 'Udulan',
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

export const PROJECT_PHASES = [
  'Konsepsiya',
  'SD',
  'DD',
  'CD',
  'Tender',
  'İcra nəzarəti',
] as const;

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
