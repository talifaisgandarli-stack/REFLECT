/**
 * Portfolio + award submission — REQ-PROJ-05.
 *
 * Pick from system_awards (5 seeded), per-award checklist, deadline indicator
 * with days remaining. portfolio_workflows.selected_awards stores the chosen
 * award ids; per-award application detail rides on portfolio_workflows.applications
 * (jsonb keyed by award id).
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

type Award = {
  id: string;
  name: string;
  organizer: string | null;
  deadline_month: number | null;
  url: string | null;
  criteria: string | null;
};

type Workflow = {
  id: string;
  project_id: string;
  selected_awards: string[];
  applications: Record<string, { checks: Record<string, boolean> }>;
  website_published_at: string | null;
  press_release_sent: boolean;
};

const PER_AWARD_CHECKS = [
  { key: 'photos', label: 'Foto seçimi' },
  { key: 'description', label: 'Layihə təsviri' },
  { key: 'team', label: 'Komanda siyahısı' },
  { key: 'submitted', label: 'Müraciət göndərildi' },
];

function daysToNextDeadline(month: number | null): number | null {
  if (!month) return null;
  const now = new Date();
  const y = now.getMonth() + 1 > month ? now.getFullYear() + 1 : now.getFullYear();
  // Deadline assumed end of stated month for "days remaining" guidance.
  const target = new Date(Date.UTC(y, month, 0));
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function PortfolioPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();

  const awardsQ = useQuery({
    queryKey: ['portfolio', 'awards'],
    queryFn: async () => {
      const { data } = await supabase.from('system_awards').select('*');
      return (data ?? []) as Award[];
    },
  });

  const workflowQ = useQuery({
    queryKey: ['portfolio', projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from('portfolio_workflows')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();
      return (data as Workflow) ?? null;
    },
  });

  const [selected, setSelected] = useState<string[]>([]);
  const [apps, setApps] = useState<Workflow['applications']>({});

  useEffect(() => {
    if (workflowQ.data) {
      setSelected(workflowQ.data.selected_awards ?? []);
      setApps((workflowQ.data.applications as Workflow['applications']) ?? {});
    }
  }, [workflowQ.data]);

  const upsertWorkflow = useMutation({
    mutationFn: async (next: Partial<Workflow>) => {
      const payload = {
        project_id: projectId,
        selected_awards: next.selected_awards ?? selected,
        applications: next.applications ?? apps,
      };
      const { error } = await supabase
        .from('portfolio_workflows')
        .upsert(payload, { onConflict: 'project_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolio', projectId] }),
  });

  const toggleAward = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setSelected(next);
    upsertWorkflow.mutate({ selected_awards: next });
  };

  const toggleCheck = (awardId: string, checkKey: string) => {
    const cur = apps[awardId]?.checks ?? {};
    const nextChecks = { ...cur, [checkKey]: !cur[checkKey] };
    const nextApps = { ...apps, [awardId]: { checks: nextChecks } };
    setApps(nextApps);
    upsertWorkflow.mutate({ applications: nextApps });
  };

  const sortedAwards = useMemo(
    () =>
      (awardsQ.data ?? []).slice().sort((a, b) => (a.deadline_month ?? 13) - (b.deadline_month ?? 13)),
    [awardsQ.data],
  );

  return (
    <div className="space-y-4">
      <div className="card">
        <h3 className="text-h3 mb-3">Mükafat seçimi</h3>
        {sortedAwards.length === 0 ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Sistemdə mükafat tapılmadı.
          </p>
        ) : (
          <ul className="space-y-2">
            {sortedAwards.map((a) => {
              const days = daysToNextDeadline(a.deadline_month);
              const isSel = selected.includes(a.id);
              const overdueClose = days != null && days < 14;
              return (
                <li
                  key={a.id}
                  className="flex items-center gap-3 p-3 rounded"
                  style={{ border: '1px solid var(--line-soft)' }}
                >
                  <input type="checkbox" checked={isSel} onChange={() => toggleAward(a.id)} />
                  <div className="flex-1 min-w-0">
                    <div className="text-body font-medium">{a.name}</div>
                    <div
                      className="text-meta"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {a.organizer ?? '—'}
                      {a.url ? (
                        <>
                          {' · '}
                          <a href={a.url} target="_blank" rel="noreferrer" style={{ color: 'var(--brand-text)' }}>
                            link
                          </a>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {days != null ? (
                    <span
                      className="text-meta"
                      style={{
                        color: overdueClose ? '#B91C1C' : 'var(--text-muted)',
                        fontWeight: overdueClose ? 600 : 400,
                      }}
                    >
                      {days} gün
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selected.length > 0 ? (
        <div className="space-y-3">
          {selected.map((id) => {
            const award = (awardsQ.data ?? []).find((a) => a.id === id);
            if (!award) return null;
            const checks = apps[id]?.checks ?? {};
            return (
              <div key={id} className="card">
                <h4 className="text-h3 mb-3">{award.name}</h4>
                <ul className="space-y-2">
                  {PER_AWARD_CHECKS.map((c) => (
                    <li key={c.key} className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id={`pf-${id}-${c.key}`}
                        checked={!!checks[c.key]}
                        onChange={() => toggleCheck(id, c.key)}
                      />
                      <label htmlFor={`pf-${id}-${c.key}`}>{c.label}</label>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
