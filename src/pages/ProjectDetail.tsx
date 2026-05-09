import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import {
  useProject,
  useTasks,
  useCompleteProject,
  usePortfolioWorkflow,
  useSystemAwards,
  useToggleAward,
  useUpdateAwardApplications,
} from '@/lib/hooks';
import { StatusChip } from '@/components/StatusChip';
import { useState } from 'react';
import { useAuth } from '@/lib/store';
import { PROJECT_PHASES } from '@/lib/labels';
import { ProjectPnL } from '@/components/ProjectPnL';

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

      {tab === 'Closeout' && id ? (
        <CloseoutTab
          projectId={id}
          status={project.status}
          isAdmin={isAdmin}
        />
      ) : null}

      {tab === 'Documents' || tab === 'History' ? (
        <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
          {tab} bölməsi v1.5-də.
        </div>
      ) : null}
    </>
  );
}

const CHECKLIST = [
  { key: 'akt', label: 'Akt imzalandı' },
  { key: 'docs', label: 'Final sənədlər təhvil verildi' },
  { key: 'archive', label: 'Layihə arxivə köçürüldü' },
  { key: 'portfolio', label: 'Portfel materialları hazırdır' },
  { key: 'survey', label: 'Retrospektiv sorğu göndərildi' },
] as const;

function CloseoutTab({
  projectId,
  status,
  isAdmin,
}: {
  projectId: string;
  status: string;
  isAdmin: boolean;
}) {
  // REQ-PROJ-04: 5-item checklist, ephemeral until "Layihəni Tamamla" fires.
  // PRD does not define a persisted closeout-checklist column, so progress is
  // session-local; the portfolio_workflows row is created on completion.
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const allChecked = CHECKLIST.every((i) => checked[i.key]);
  const closed = status === 'closed';
  const complete = useCompleteProject();
  const portfolio = usePortfolioWorkflow(projectId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="card lg:col-span-2">
        <h3 className="text-h3 mb-3">Bağlanış sənədləri</h3>
        <ul className="space-y-2">
          {CHECKLIST.map((item) => (
            <li key={item.key} className="flex items-center gap-3">
              <input
                id={`cl-${item.key}`}
                type="checkbox"
                checked={!!checked[item.key] || closed}
                disabled={closed || !isAdmin}
                onChange={(e) =>
                  setChecked((prev) => ({ ...prev, [item.key]: e.target.checked }))
                }
              />
              <label htmlFor={`cl-${item.key}`} className="text-body">
                {item.label}
              </label>
            </li>
          ))}
        </ul>
        {complete.isError ? (
          <div className="text-meta mt-3" style={{ color: 'var(--danger, #c33)' }}>
            {(complete.error as Error)?.message ?? 'Xəta baş verdi'}
          </div>
        ) : null}
      </div>
      <div className="card">
        <h3 className="text-h3 mb-3">Status</h3>
        {closed ? (
          <>
            <p className="text-body" style={{ color: 'var(--brand-text)' }}>
              ✓ Layihə bağlanıb
            </p>
            <p className="text-meta mt-2" style={{ color: 'var(--text-muted)' }}>
              {portfolio.data
                ? 'Portfel iş axını yaradılıb.'
                : 'Portfel iş axını hələ yaradılmayıb.'}
            </p>
          </>
        ) : (
          <>
            <p className="text-meta mb-3" style={{ color: 'var(--text-muted)' }}>
              Bütün maddələri yoxla → "Layihəni Tamamla".
            </p>
            <button
              type="button"
              className="btn-primary w-full"
              disabled={!isAdmin || !allChecked || complete.isPending}
              onClick={() => complete.mutate(projectId)}
            >
              {complete.isPending ? 'Bağlanır…' : 'Layihəni Tamamla'}
            </button>
          </>
        )}
      </div>
      {/* REQ-PROJ-05: Awards panel — only shown once project is closed and workflow exists */}
      {closed && portfolio.data ? (
        <AwardsPanel workflow={portfolio.data} isAdmin={isAdmin} />
      ) : null}
      {/* REQ-CRM-07: Survey trigger — visible after closeout */}
      {closed && isAdmin ? <SurveyTrigger projectId={projectId} /> : null}
    </div>
  );
}

function SurveyTrigger({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const survey = useQuery({
    queryKey: ['survey', projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from('retrospective_surveys')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();
      return data;
    },
  });
  const send = useMutation({
    mutationFn: async () => {
      const token = crypto.randomUUID().replace(/-/g, '');
      const { error } = await supabase.from('retrospective_surveys').insert({
        project_id: projectId,
        share_token: token,
        sent_at: new Date().toISOString(),
      });
      if (error) throw error;
      return token;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['survey', projectId] }),
  });

  const surveyUrl = survey.data?.share_token
    ? `${window.location.origin}/survey/${survey.data.share_token}`
    : null;

  return (
    <div className="card col-span-full mt-4">
      <h3 className="text-h3 mb-2">Retrospektiv sorğu</h3>
      {survey.data ? (
        <>
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            {survey.data.responded_at
              ? `Cavablandı: NPS ${survey.data.nps_score ?? '—'}`
              : `Göndərildi: ${new Date(survey.data.sent_at).toLocaleDateString('az-AZ')}`}
          </p>
          {surveyUrl && !survey.data.responded_at ? (
            <div className="mt-2 flex items-center gap-2">
              <input className="input flex-1" readOnly value={surveyUrl} />
              <button
                type="button"
                className="chip"
                onClick={() => navigator.clipboard?.writeText(surveyUrl)}
              >
                Kopyala
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <button
          type="button"
          className="btn-primary"
          onClick={() => send.mutate()}
          disabled={send.isPending}
        >
          Sorğu yarat
        </button>
      )}
    </div>
  );
}

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
  applications: Record<string, { docs: boolean; submitted: boolean }>;
};

function daysUntilDeadlineMonth(month: number | null): number | null {
  if (!month) return null;
  const now = new Date();
  let target = new Date(now.getFullYear(), month - 1, 1);
  if (target.getTime() <= now.getTime()) {
    target = new Date(now.getFullYear() + 1, month - 1, 1);
  }
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

function AwardsPanel({
  workflow,
  isAdmin,
}: {
  workflow: PortfolioWorkflow;
  isAdmin: boolean;
}) {
  // REQ-PROJ-05: pick from system_awards, per-award checklist, deadline indicator.
  const { data: awards = [] } = useSystemAwards();
  const toggle = useToggleAward();
  const updateApps = useUpdateAwardApplications();
  const apps: Record<string, { docs: boolean; submitted: boolean }> =
    (workflow.applications as Record<string, { docs: boolean; submitted: boolean }>) ?? {};

  function setStep(awardId: string, key: 'docs' | 'submitted', val: boolean) {
    const next = { ...apps, [awardId]: { ...apps[awardId], [key]: val } };
    updateApps.mutate({ workflowId: workflow.id, applications: next });
  }

  return (
    <div className="col-span-full mt-4">
      <h3 className="text-h3 mb-3">Mükafat müraciətləri</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {(awards as SystemAward[]).map((award) => {
          const selected = workflow.selected_awards.includes(award.id);
          const days = daysUntilDeadlineMonth(award.deadline_month);
          const app = apps[award.id] ?? { docs: false, submitted: false };
          return (
            <div
              key={award.id}
              className="card"
              style={{ borderColor: selected ? 'var(--brand-action)' : 'var(--line)' }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-body font-medium truncate">{award.name}</div>
                  <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                    {award.organizer}
                  </div>
                </div>
                {isAdmin ? (
                  <input
                    type="checkbox"
                    title="Seç"
                    checked={selected}
                    onChange={() =>
                      toggle.mutate({
                        workflowId: workflow.id,
                        awardId: award.id,
                        selected_awards: workflow.selected_awards,
                      })
                    }
                  />
                ) : null}
              </div>
              {award.criteria ? (
                <div className="text-meta mt-1" style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                  {award.criteria}
                </div>
              ) : null}
              {days !== null ? (
                <div
                  className="text-meta mt-1"
                  style={{ color: days <= 30 ? 'var(--danger, #c33)' : 'var(--text-muted)' }}
                >
                  {days} gün qaldı
                </div>
              ) : null}
              {selected ? (
                <ul className="mt-2 space-y-1">
                  {([['docs', 'Portfel sənədləri hazırdır'], ['submitted', 'Ərizə göndərildi']] as const).map(
                    ([key, label]) => (
                      <li key={key} className="flex items-center gap-2 text-meta">
                        <input
                          type="checkbox"
                          checked={!!app[key]}
                          disabled={!isAdmin}
                          onChange={(e) => setStep(award.id, key, e.target.checked)}
                        />
                        {label}
                      </li>
                    ),
                  )}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
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
