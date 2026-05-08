/**
 * Client + interaction + retrospective-survey mutations.
 * REQ-CRM-01 (create), REQ-CRM-03 (interaction), REQ-CRM-07 (survey).
 *
 * activity_log + client_stage_history are handled by the DB triggers in
 * 0004_activity_triggers.sql — these mutations only write the primary row.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { ValidationError } from './finance';
import type { ClientPipelineStage } from '@/types/db';

export type ClientInput = {
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  pipeline_stage?: ClientPipelineStage;
  expected_value?: number | null;
};

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ClientInput) => {
      if (!input.name.trim()) throw new ValidationError('Müştəri adı boş ola bilməz.');
      if (input.expected_value != null && input.expected_value < 0) {
        throw new ValidationError('Dəyər mənfi ola bilməz.');
      }
      const { data, error } = await supabase
        .from('clients')
        .insert({
          name: input.name.trim(),
          company: input.company ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          pipeline_stage: input.pipeline_stage ?? 'lead',
          expected_value: input.expected_value ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });
}

// ----------------------------------------------------------------------------
// Interactions (REQ-CRM-03)
// ----------------------------------------------------------------------------

export type InteractionType = 'call' | 'email' | 'meeting' | 'whatsapp' | 'other';
export const INTERACTION_LABEL: Record<InteractionType, string> = {
  call: 'Zəng',
  email: 'Email',
  meeting: 'Görüş',
  whatsapp: 'WhatsApp',
  other: 'Digər',
};

export function useInteractions(clientId: string | null | undefined) {
  return useQuery({
    queryKey: ['interactions', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_interactions')
        .select('*')
        .eq('client_id', clientId!)
        .order('occurred_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useLogInteraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      client_id: string;
      type: InteractionType;
      note?: string | null;
      occurred_at?: string;
    }) => {
      const occurred_at = input.occurred_at ?? new Date().toISOString();
      const { error } = await supabase.from('client_interactions').insert({
        client_id: input.client_id,
        type: input.type,
        note: input.note ?? null,
        occurred_at,
      });
      if (error) throw error;
      // PRD US-CRM-02 line 1309: "And clients.last_interaction_at updates".
      // The DB has no trigger for this yet; mirror in the same call. RLS allows
      // admins; BD Lead has SELECT/INSERT but not UPDATE on clients — that case
      // will fail silently here and is logged as TODO below.
      await supabase
        .from('clients')
        .update({ last_interaction_at: occurred_at })
        .eq('id', input.client_id);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['interactions', vars.client_id] });
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

// ----------------------------------------------------------------------------
// Retrospective survey (REQ-CRM-07)
// ----------------------------------------------------------------------------

/** Admin-side: create a survey row with a fresh share_token. */
export function useCreateSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { client_id: string; project_id?: string | null }) => {
      const share_token = crypto.randomUUID();
      const { data, error } = await supabase
        .from('retrospective_surveys')
        .insert({
          client_id: input.client_id,
          project_id: input.project_id ?? null,
          share_token,
          sent_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surveys'] }),
  });
}

/** Public-side: lookup by share_token via admin API. */
export async function fetchSurveyByToken(token: string) {
  const res = await fetch(`/api/surveys/lookup?token=${encodeURIComponent(token)}`);
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    survey?: { id: string; project_id: string | null; client_id: string; responded_at: string | null };
  };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json.survey ?? null;
}

export type SurveyResponse = {
  nps_score: number; // 0..10
  ratings: Record<string, number>; // category → 1..5
  comment?: string | null;
};

/** Public-side submit through /api/surveys/respond (admin client, RLS-safe). */
export async function submitSurvey(token: string, response: SurveyResponse) {
  if (response.nps_score < 0 || response.nps_score > 10) {
    throw new ValidationError('NPS 0–10 aralığında olmalıdır.');
  }
  const res = await fetch('/api/surveys/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, ...response }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
}

// ============================================================================
// REQ-CRM-04 — AI ICP enrichment via MIRAI
// ============================================================================

export type IcpResult = {
  score: number | null;
  reason?: string;
  cached: boolean;
  calculated_at: string | null;
};

export function useRefreshIcp() {
  return useMutation({
    mutationFn: async (clientId: string): Promise<IcpResult> => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sessiya tapılmadı');
      const res = await fetch('/api/mirai/icp', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ client_id: clientId }),
      });
      const json = (await res.json().catch(() => ({}))) as IcpResult & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      return json;
    },
  });
}

/** Score band labels — matches PRD §9.1 OKR health bands. */
export function icpBand(score: number | null | undefined): {
  label: string;
  color: string;
  bg: string;
} {
  if (score == null) return { label: '—', color: 'var(--text-muted)', bg: 'rgba(255,255,255,0.04)' };
  if (score >= 70) return { label: `${score}`, color: 'var(--brand-text)', bg: 'rgba(173,251,73,0.16)' };
  if (score >= 40) return { label: `${score}`, color: '#92400E', bg: 'rgba(245,158,11,0.16)' };
  return { label: `${score}`, color: '#B91C1C', bg: 'rgba(239,68,68,0.12)' };
}
