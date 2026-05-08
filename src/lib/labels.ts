import type {
  ClientPipelineStage,
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
  idea: { dot: '#A78BFA', bg: '#F4F0FE', text: '#7C3AED' },
  queued: { dot: '#94A3B8', bg: '#F1F5F2', text: '#475569' },
  active: { dot: '#3B82F6', bg: '#EAF2FF', text: '#1D4ED8' },
  review: { dot: '#D97706', bg: '#FFF6E5', text: '#92400E' },
  expert: { dot: '#7C5CD9', bg: '#F0EBFB', text: '#5B3FB8' },
  done: { dot: '#22C55E', bg: '#ECF9EF', text: '#15803D' },
  cancelled: { dot: '#EF4444', bg: '#FEEEED', text: '#B91C1C' },
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

export const CANCEL_REASONS = [
  'Müştəri imtina etdi',
  'Layihə dəyişdi',
  'Texniki problem',
  'Yenidən planlaşdırılır',
  'Digər',
] as const;
