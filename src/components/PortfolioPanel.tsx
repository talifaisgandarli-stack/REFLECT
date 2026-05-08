/**
 * Award/portfolio submission (REQ-PROJ-05).
 *
 * Gates on close_project running first (which seeds portfolio_workflows
 * for the project). Surfaces the 5 seeded system_awards with a per-award
 * checklist + "days remaining" indicator computed from system_awards.deadline_month
 * + the next occurrence year. Selected awards stored in
 * portfolio_workflows.selected_awards uuid[].
 */
import { useMemo } from 'react';
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
  website_published_at: string | null;
  press_release_sent: boolean;
  applications: Array<{ award_id: string; submitted_at: string | null; note?: string }>;
};

type Props = { projectId: string };

function nextDeadline(month: number | null): { date: Date; days: number } | null {
  if (!month) return null;
  const today = new Date();
  // Use 1st of the deadline month at end-of-day +04 (Asia/Baku) for AZ submissions.
  let year = today.getUTCFullYear();
  let target = new Date(Date.UTC(year, month - 1, 1, 20));
  if (target.getTime() < today.getTime()) {
    year += 1;
    target = new Date(Date.UTC(year, month - 1, 1, 20));
  }
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  return { date: target, days };
}

export function PortfolioPanel({ projectId }: Props) {
  const qc = useQueryClient();

  const awards = useQuery({
    queryKey: ['awards'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_awards')
        .select('*')
        .order('deadline_month');
      if (error) throw error;
      return (data ?? []) as Award[];
    },
  });

  const workflow = useQuery({
    queryKey: ['portfolio', projectId],
    queryFn: async (): Promise<Workflow | null> => {
      const { data, error } = await supabase
        .from('portfolio_workflows')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();
      if (error) throw error;
      return data as Workflow | null;
    },
  });

  const upsert = useMutation({
    mutationFn: async (input: Partial<Workflow>) => {
      if (workflow.data?.id) {
        const { error } = await supabase
          .from('portfolio_workflows')
          .update(input)
          .eq('id', workflow.data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('portfolio_workflows')
          .insert({ project_id: projectId, ...input });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolio', projectId] }),
  });

  const selected = new Set(workflow.data?.selected_awards ?? []);
  const apps = workflow.data?.applications ?? [];

  function toggleAward(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    upsert.mutate({ selected_awards: Array.from(next) });
  }

  function toggleSubmission(awardId: string, submitted: boolean) {
    const next = apps.filter((a) => a.award_id !== awardId);
    if (submitted) {
      next.push({ award_id: awardId, submitted_at: new Date().toISOString() });
    }
    upsert.mutate({ applications: next });
  }

  const checklistFor = (id: string) => {
    const sub = apps.find((a) => a.award_id === id);
    return {
      submitted: !!sub?.submitted_at,
      submittedAt: sub?.submitted_at ?? null,
    };
  };

  const sortedAwards = useMemo(() => {
    return (awards.data ?? []).slice().sort((a, b) => {
      const da = nextDeadline(a.deadline_month)?.days ?? 999;
      const db = nextDeadline(b.deadline_month)?.days ?? 999;
      return da - db;
    });
  }, [awards.data]);

  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap gap-4 items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="text-h3">Portfolio addımları</h3>
          <p className="text-meta mt-1" style={{ color: 'var(--text-muted)' }}>
            Layihə bağlanandan sonra bu axın açılır. Saytda yayım və press
            release ümumi addımlardır; mükafat müraciətləri hər mükafat üçün
            ayrıca izlənir.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-body cursor-pointer">
            <input
              type="checkbox"
              checked={!!workflow.data?.website_published_at}
              onChange={(e) =>
                upsert.mutate({
                  website_published_at: e.target.checked
                    ? new Date().toISOString()
                    : null,
                })
              }
            />
            Saytda yayımlandı
          </label>
          <label className="flex items-center gap-2 text-body cursor-pointer">
            <input
              type="checkbox"
              checked={!!workflow.data?.press_release_sent}
              onChange={(e) => upsert.mutate({ press_release_sent: e.target.checked })}
            />
            Press release göndərildi
          </label>
        </div>
      </div>

      <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sortedAwards.map((a) => {
          const dl = nextDeadline(a.deadline_month);
          const sel = selected.has(a.id);
          const cl = checklistFor(a.id);
          const tone =
            dl == null
              ? '#94A3B8'
              : dl.days <= 30
                ? '#EF4444'
                : dl.days <= 90
                  ? '#D97706'
                  : '#22C55E';

          return (
            <li
              key={a.id}
              className="card"
              style={{
                borderColor: sel ? 'var(--brand-text)' : 'var(--line)',
                borderWidth: sel ? 2 : 1,
              }}
            >
              <header className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h4 className="text-h4">{a.name}</h4>
                  {a.organizer ? (
                    <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                      {a.organizer}
                    </div>
                  ) : null}
                </div>
                {dl ? (
                  <span
                    className="chip shrink-0"
                    style={{ background: `${tone}1f`, color: tone }}
                  >
                    {dl.days < 0 ? 'Keçib' : `${dl.days} gün`}
                  </span>
                ) : null}
              </header>

              {a.criteria ? (
                <p className="text-body mt-2" style={{ color: 'var(--text-soft)' }}>
                  {a.criteria}
                </p>
              ) : null}

              <div className="mt-3 space-y-2">
                <label className="flex items-center gap-2 text-body cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sel}
                    onChange={() => toggleAward(a.id)}
                  />
                  Bu mükafat üçün hazırlığa başla
                </label>
                {sel ? (
                  <label className="flex items-center gap-2 text-body cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cl.submitted}
                      onChange={(e) => toggleSubmission(a.id, e.target.checked)}
                    />
                    Müraciət göndərildi
                    {cl.submittedAt ? (
                      <span className="text-meta ml-1" style={{ color: 'var(--text-muted)' }}>
                        {cl.submittedAt.slice(0, 10)}
                      </span>
                    ) : null}
                  </label>
                ) : null}
                {a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-meta"
                    style={{ color: 'var(--brand-text)' }}
                  >
                    Mükafat səhifəsi ↗
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
