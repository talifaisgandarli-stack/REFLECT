import { useParams, Link } from 'react-router-dom';
import { PageHead } from '@/components/PageHead';
import { useProject, useTasks } from '@/lib/hooks';
import { StatusChip } from '@/components/StatusChip';
import { useState } from 'react';
import { useAuth } from '@/lib/store';
import { PROJECT_PHASES } from '@/lib/labels';
import { ProjectPnL } from '@/components/ProjectPnL';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { relativeTime } from '@/lib/format';

const TABS = ['Overview', 'Tasks', 'Documents', 'Closeout', 'History'] as const;

export function ProjectDetailPage() {
  const { id } = useParams();
  const { data: project } = useProject(id);
  const { data: tasks = [] } = useTasks({ projectId: id });
  const { isAdmin } = useAuth();
  type Tab = (typeof TABS)[number] | 'Finance';
  const [tab, setTab] = useState<Tab>('Overview');
  const tabs: Tab[] = isAdmin
    ? [...TABS.slice(0, 3), 'Finance', ...TABS.slice(3)]
    : [...TABS];

  if (!project) {
    return (
      <div className="card text-meta">
        Layihə tapılmadı. <Link to="/layihelər">geri</Link>
      </div>
    );
  }

  return (
    <>
      <PageHead
        meta={(project.phases ?? []).join(' → ') || '—'}
        title={project.name}
        actions={<button className="btn-primary">+ Sənəd əlavə et</button>}
      />

      <nav className="flex gap-2 mb-6 border-b border-line-soft">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 text-ui"
            style={{
              color: tab === t ? 'var(--text)' : 'var(--text-muted)',
              borderBottom: tab === t ? '2px solid var(--brand-text)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === 'Overview' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="card lg:col-span-2">
            <h3 className="text-h3 mb-3">Mərhələlər</h3>
            <ol className="space-y-2">
              {PROJECT_PHASES.map((p) => {
                const active = project.phases?.includes(p);
                return (
                  <li key={p} className="flex items-center gap-3">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: active ? 'var(--brand-action)' : 'var(--line)' }}
                    />
                    <span style={{ color: active ? 'var(--text)' : 'var(--text-muted)' }}>{p}</span>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="card">
            <h3 className="text-h3 mb-3">Əsas məlumat</h3>
            <dl className="text-body space-y-2">
              <Row k="Status" v={project.status} />
              <Row k="Başlama" v={project.start_date ?? '—'} />
              <Row k="Deadline" v={project.deadline ?? '—'} />
              <Row k="Ekspertiza" v={project.requires_expertise ? 'Lazımdır' : 'Yox'} />
            </dl>
          </div>
        </div>
      ) : null}

      {tab === 'Tasks' ? (
        <div className="card">
          {tasks.length === 0 ? (
            <p className="text-meta">Bu layihədə tapşırıq yoxdur.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {tasks.map((t) => (
                <li key={t.id} className="py-3 flex items-center justify-between">
                  <span>{t.title}</span>
                  <StatusChip status={t.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === 'Finance' && id ? <ProjectPnL projectId={id} /> : null}

      {tab === 'Documents' || tab === 'History' ? (
        <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
          {tab} bölməsi v1.5-də.
        </div>
      ) : null}

      {tab === 'Closeout' && id ? <CloseoutTab projectId={id} project={project} /> : null}
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt style={{ color: 'var(--text-muted)' }}>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

// ── Closeout tab — REQ-PROJ-04 + REQ-PROJ-05 ─────────────────────────────────

const CLOSEOUT_ITEMS = [
  { key: 'akt', label: 'Akt imzalandı' },
  { key: 'final_docs', label: 'Final sənədlər təhvil verildi' },
  { key: 'archive', label: 'Arxivə əlavə edildi' },
  { key: 'portfolio', label: 'Portfolio hazırlandı' },
  { key: 'survey', label: 'Retrospektiv sorğu göndərildi' },
];

type ChecklistItems = Record<string, boolean>;

type SystemAward = {
  id: string;
  name: string;
  organizer: string | null;
  deadline_month: number | null;
  url: string | null;
  criteria: string | null;
};

type PortfolioWorkflow = {
  id: string;
  project_id: string;
  selected_awards: string[];
  website_published_at: string | null;
  press_release_sent: boolean;
  applications: Array<{ award_id: string; checklist: Record<string, boolean> }>;
};

const MONTH_NAMES = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'İyn', 'İyl', 'Avq', 'Sen', 'Okt', 'Noy', 'Dek'];

function CloseoutTab({ projectId, project }: { projectId: string; project: { status: string; name: string } }) {
  const qc = useQueryClient();

  // Fetch or create closeout checklist
  const checklistQ = useQuery({
    queryKey: ['closeout', projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from('closeout_checklists')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();
      return data as { id: string; items: ChecklistItems; completed_at: string | null } | null;
    },
  });

  const portfolioQ = useQuery({
    queryKey: ['portfolio', projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from('portfolio_workflows')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();
      return data as PortfolioWorkflow | null;
    },
  });

  const awardsQ = useQuery({
    queryKey: ['system_awards'],
    queryFn: async () => {
      const { data } = await supabase.from('system_awards').select('*').order('deadline_month');
      return (data ?? []) as SystemAward[];
    },
  });

  const items: ChecklistItems = (checklistQ.data?.items as ChecklistItems) ?? {};
  const allChecked = CLOSEOUT_ITEMS.every((i) => items[i.key]);

  const toggleItem = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: boolean }) => {
      const newItems = { ...items, [key]: value };
      if (checklistQ.data?.id) {
        await supabase.from('closeout_checklists').update({ items: newItems }).eq('id', checklistQ.data.id);
      } else {
        await supabase.from('closeout_checklists').insert({ project_id: projectId, items: newItems });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['closeout', projectId] }),
  });

  const closeProject = useMutation({
    mutationFn: async () => {
      await supabase.from('projects').update({ status: 'closed' }).eq('id', projectId);
      await supabase.from('closeout_checklists').update({ completed_at: new Date().toISOString() }).eq('project_id', projectId);
      // Create portfolio_workflows row if not exists (PRD REQ-PROJ-04)
      const { data: existing } = await supabase.from('portfolio_workflows').select('id').eq('project_id', projectId).maybeSingle();
      if (!existing) {
        await supabase.from('portfolio_workflows').insert({ project_id: projectId });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      qc.invalidateQueries({ queryKey: ['portfolio', projectId] });
      qc.invalidateQueries({ queryKey: ['closeout', projectId] });
    },
  });

  const toggleAward = useMutation({
    mutationFn: async (awardId: string) => {
      const pw = portfolioQ.data;
      if (!pw) return;
      const current = pw.selected_awards ?? [];
      const updated = current.includes(awardId) ? current.filter((id) => id !== awardId) : [...current, awardId];
      await supabase.from('portfolio_workflows').update({ selected_awards: updated }).eq('id', pw.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolio', projectId] }),
  });

  const toggleAwardChecklist = useMutation({
    mutationFn: async ({ awardId, itemKey, value }: { awardId: string; itemKey: string; value: boolean }) => {
      const pw = portfolioQ.data;
      if (!pw) return;
      const apps = [...(pw.applications ?? [])];
      const idx = apps.findIndex((a) => a.award_id === awardId);
      if (idx >= 0) {
        apps[idx] = { ...apps[idx], checklist: { ...apps[idx].checklist, [itemKey]: value } };
      } else {
        apps.push({ award_id: awardId, checklist: { [itemKey]: value } });
      }
      await supabase.from('portfolio_workflows').update({ applications: apps }).eq('id', pw.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolio', projectId] }),
  });

  const isClosed = project.status === 'closed';

  return (
    <div className="space-y-6">
      {/* REQ-PROJ-04 closeout checklist */}
      <section className="card">
        <h3 className="text-h3 mb-4">Bağlanış siyahısı</h3>
        <ul className="space-y-3">
          {CLOSEOUT_ITEMS.map((item) => (
            <li key={item.key} className="flex items-center gap-3">
              <input
                type="checkbox"
                id={`cc-${item.key}`}
                checked={!!items[item.key]}
                disabled={isClosed || toggleItem.isPending}
                onChange={(e) => toggleItem.mutate({ key: item.key, value: e.target.checked })}
                className="w-4 h-4 accent-brand"
              />
              <label
                htmlFor={`cc-${item.key}`}
                className="text-body"
                style={{ color: items[item.key] ? 'var(--text-muted)' : 'var(--text)', textDecoration: items[item.key] ? 'line-through' : 'none' }}
              >
                {item.label}
              </label>
            </li>
          ))}
        </ul>

        {!isClosed ? (
          <button
            className="btn-primary mt-5 w-full"
            disabled={!allChecked || closeProject.isPending}
            onClick={() => closeProject.mutate()}
            title={!allChecked ? 'Bütün maddələri tamamlayın' : undefined}
          >
            {closeProject.isPending ? 'Bağlanır…' : 'Layihəni Tamamla'}
          </button>
        ) : (
          <div className="mt-4 text-meta" style={{ color: 'var(--brand-action)' }}>
            Layihə tamamlandı ✓{checklistQ.data?.completed_at ? ` — ${relativeTime(checklistQ.data.completed_at)}` : ''}
          </div>
        )}
      </section>

      {/* REQ-PROJ-05 award/portfolio submission */}
      {portfolioQ.data ? (
        <section className="card">
          <h3 className="text-h3 mb-4">Mükafat müraciətləri</h3>
          {(awardsQ.data ?? []).length === 0 ? (
            <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
              Sistem mükafatları yüklənir…
            </div>
          ) : (
            <div className="space-y-4">
              {(awardsQ.data ?? []).map((award) => {
                const selected = portfolioQ.data!.selected_awards.includes(award.id);
                const appEntry = portfolioQ.data!.applications.find((a) => a.award_id === award.id);
                const daysToDeadline = award.deadline_month
                  ? (() => {
                      const now = new Date();
                      const target = new Date(now.getFullYear(), award.deadline_month - 1, 1);
                      if (target < now) target.setFullYear(target.getFullYear() + 1);
                      return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
                    })()
                  : null;

                return (
                  <div
                    key={award.id}
                    className="rounded-card p-4"
                    style={{ border: `1px solid ${selected ? 'var(--brand-action)' : 'var(--line-soft)'}` }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="text-body font-medium">{award.name}</div>
                        {award.organizer ? (
                          <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                            {award.organizer}
                          </div>
                        ) : null}
                        {daysToDeadline !== null ? (
                          <div
                            className="text-meta mt-1"
                            style={{ color: daysToDeadline < 30 ? '#EF4444' : daysToDeadline < 90 ? '#D97706' : 'var(--text-muted)' }}
                          >
                            Deadline: {MONTH_NAMES[(award.deadline_month ?? 1) - 1]} · {daysToDeadline} gün qalıb
                          </div>
                        ) : null}
                      </div>
                      <button
                        className={`chip ${selected ? 'chip-brand' : ''}`}
                        onClick={() => toggleAward.mutate(award.id)}
                        disabled={toggleAward.isPending}
                      >
                        {selected ? 'Seçildi ✓' : 'Seç'}
                      </button>
                    </div>

                    {/* Per-award checklist when selected */}
                    {selected && award.criteria ? (
                      <div className="mt-3 space-y-2">
                        {award.criteria.split('\n').filter(Boolean).map((criterion, ci) => {
                          const itemKey = `criterion_${ci}`;
                          const checked = !!(appEntry?.checklist?.[itemKey]);
                          return (
                            <label key={ci} className="flex items-center gap-2 text-meta cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  toggleAwardChecklist.mutate({ awardId: award.id, itemKey, value: e.target.checked })
                                }
                                className="w-4 h-4 accent-brand"
                              />
                              <span style={{ textDecoration: checked ? 'line-through' : 'none', color: checked ? 'var(--text-muted)' : 'var(--text)' }}>
                                {criterion}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    ) : null}

                    {award.url && selected ? (
                      <a
                        href={award.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-meta mt-2 inline-block"
                        style={{ color: 'var(--brand-text)' }}
                      >
                        Müraciət saytı →
                      </a>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : isClosed ? null : (
        <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
          Mükafat müraciətləri layihə bağlandıqdan sonra açılır.
        </div>
      )}
    </div>
  );
}
