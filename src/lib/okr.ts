/**
 * Module 9 OKR — PRD §9.1.
 *
 * Schema (0001):
 *   okrs        (id, scope enum company|personal, employee_id, period,
 *                objective, owner_id, created_at)
 *   key_results (id, okr_id, title, metric_type, current_value,
 *                target_value, unit, updated_at)
 *
 * RLS (0002) handles access:
 *   - SELECT: admin OR company-scope OR owner/employee
 *   - WRITE:  admin OR (personal AND employee_id = uid) for okrs
 *             admin OR (parent.employee_id = uid)        for key_results
 *
 * Health bands per PRD: ≥70 On Track · 40–69 At Risk · <40 Off Track.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from './store';
import { ValidationError } from './finance';

export type OkrScope = 'company' | 'personal';

export type OkrRow = {
  id: string;
  scope: OkrScope;
  employee_id: string | null;
  period: string;
  objective: string;
  owner_id: string | null;
  created_at: string;
};

export type KeyResultRow = {
  id: string;
  okr_id: string;
  title: string;
  metric_type: string | null;
  current_value: number;
  target_value: number;
  unit: string | null;
  updated_at: string;
};

export type OkrWithKRs = OkrRow & { key_results: KeyResultRow[] };

/** Compute progress 0-100 for a KR. `current` clamped to [0, target]. */
export function krProgressPct(kr: KeyResultRow): number {
  const t = Number(kr.target_value);
  if (!Number.isFinite(t) || t <= 0) return 0;
  const c = Math.max(0, Math.min(Number(kr.current_value), t));
  return Math.round((c / t) * 100);
}

/** Average progress across an OKR's KRs (0-100). 0 KRs → 0. */
export function okrProgressPct(okr: OkrWithKRs): number {
  if (okr.key_results.length === 0) return 0;
  const sum = okr.key_results.reduce((a, k) => a + krProgressPct(k), 0);
  return Math.round(sum / okr.key_results.length);
}

/** Health band per PRD §9.1 — same visual contract as REQ-CRM-04 ICP. */
export function okrBand(pct: number): {
  label: string;
  color: string;
  bg: string;
} {
  if (pct >= 70) return { label: 'On Track', color: 'var(--brand-text)', bg: 'rgba(173,251,73,0.16)' };
  if (pct >= 40) return { label: 'At Risk', color: '#92400E', bg: 'rgba(245,158,11,0.16)' };
  return { label: 'Off Track', color: '#B91C1C', bg: 'rgba(239,68,68,0.12)' };
}

export function useOkrs(scope: OkrScope) {
  return useQuery({
    queryKey: ['okrs', scope],
    queryFn: async (): Promise<OkrWithKRs[]> => {
      const { data, error } = await supabase
        .from('okrs')
        .select('id, scope, employee_id, period, objective, owner_id, created_at, key_results(*)')
        .eq('scope', scope)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as OkrWithKRs[]).map((o) => ({
        ...o,
        key_results: (o.key_results ?? []).slice().sort((a, b) =>
          a.title.localeCompare(b.title),
        ),
      }));
    },
  });
}

export type OkrInput = {
  scope: OkrScope;
  period: string;
  objective: string;
  employee_id?: string | null;
  key_results: Array<{
    title: string;
    target_value: number;
    current_value?: number;
    metric_type?: string | null;
    unit?: string | null;
  }>;
};

export function useCreateOkr() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (input: OkrInput) => {
      if (!profile?.id) throw new ValidationError('No profile');
      if (!input.objective.trim()) throw new ValidationError('Obyektiv mətni boş ola bilməz.');
      if (!input.period.trim()) throw new ValidationError('Period (məsələn "2026 Q2") tələb olunur.');
      if (input.key_results.length === 0) {
        throw new ValidationError('Ən azı bir Key Result əlavə et.');
      }
      for (const kr of input.key_results) {
        if (!kr.title.trim()) throw new ValidationError('KR başlığı boş ola bilməz.');
        if (!Number.isFinite(kr.target_value) || kr.target_value <= 0) {
          throw new ValidationError('Hədəf dəyər müsbət rəqəm olmalıdır.');
        }
      }

      // Personal OKRs are owned by the caller (RLS guards this anyway).
      const employeeId =
        input.scope === 'personal' ? profile.id : input.employee_id ?? null;

      const { data: created, error: okrErr } = await supabase
        .from('okrs')
        .insert({
          scope: input.scope,
          period: input.period.trim(),
          objective: input.objective.trim(),
          employee_id: employeeId,
          owner_id: profile.id,
        })
        .select('id')
        .single();
      if (okrErr) throw okrErr;
      const okrId = created.id;

      const { error: krErr } = await supabase.from('key_results').insert(
        input.key_results.map((k) => ({
          okr_id: okrId,
          title: k.title.trim(),
          metric_type: k.metric_type ?? null,
          target_value: k.target_value,
          current_value: k.current_value ?? 0,
          unit: k.unit ?? null,
        })),
      );
      if (krErr) throw krErr;

      return { id: okrId };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['okrs'] }),
  });
}

export function useUpdateKr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; current_value: number }) => {
      if (!Number.isFinite(input.current_value) || input.current_value < 0) {
        throw new ValidationError('Cari dəyər mənfi ola bilməz.');
      }
      const { error } = await supabase
        .from('key_results')
        .update({
          current_value: input.current_value,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['okrs'] }),
  });
}

export function useDeleteOkr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('okrs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['okrs'] }),
  });
}
