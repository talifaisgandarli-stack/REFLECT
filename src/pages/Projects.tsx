import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useProjects } from '@/lib/hooks';
import { Mascot } from '@/components/Mascot';
import { PROJECT_STATUS_LABEL } from '@/lib/labels';
import { ProjectCreateModal } from '@/components/ProjectCreateModal';
import { SkeletonList } from '@/components/Skeleton';
import { AvatarGroup } from '@/components/AvatarGroup';
import { supabase } from '@/lib/supabase';

// ─── Constants ───────────────────────────────────────────────────────────────

const FOLDER_TONE = [
  'bg-grad-folder-sage',
  'bg-grad-folder-lime',
  'bg-grad-folder-forest',
  'bg-grad-folder-peach',
  'bg-grad-folder-lavender',
];

type StatusFilter = 'all' | 'active' | 'on_hold' | 'closed';

const STATUS_CHIPS: { label: string; value: StatusFilter }[] = [
  { label: 'Hamısı',   value: 'all' },
  { label: 'Aktiv',    value: 'active' },
  { label: 'Planlama', value: 'on_hold' },
  { label: 'Bağlı',   value: 'closed' },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function ProjectsPage() {
  const { data: projects = [], isLoading } = useProjects();

  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Task stats: project_id, status, assignee_ids
  const { data: taskStats = [] } = useQuery({
    queryKey: ['project-task-stats'],
    queryFn: async () => {
      const { data } = await supabase
        .from('tasks')
        .select('project_id, status, assignee_ids')
        .is('archived_at', null)
        .not('project_id', 'is', null);
      return data ?? [];
    },
  });

  // Profiles for avatar display
  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles', 'list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url');
      return data ?? [];
    },
  });

  const profileMap = Object.fromEntries(
    profiles.map((pr) => [pr.id, { full_name: pr.full_name, avatar_url: pr.avatar_url }]),
  );

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = projects.filter((p) => {
    const matchesSearch =
      search.trim() === '' ||
      p.name.toLowerCase().includes(search.trim().toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <>
      <PageHead
        meta={`${projects.length} layihə`}
        title="Layihələr"
        actions={
          <>
            <input
              className="input max-w-[240px]"
              placeholder="Axtar…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              + Yeni layihə
            </button>
          </>
        }
      />

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_CHIPS.map((chip) => (
          <button
            key={chip.value}
            className="chip"
            style={
              statusFilter === chip.value
                ? { background: 'var(--brand-action)', color: 'var(--canvas)' }
                : undefined
            }
            onClick={() => setStatusFilter(chip.value)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <SkeletonList rows={6} />
      ) : projects.length === 0 ? (
        <EmptyState
          title="Hələ layihə yoxdur"
          body="Yeni layihə yarat — fazaları və müştərini seç, MIRAI tapşırıqları təklif edəcək."
          cta={
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              + Yeni layihə
            </button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nəticə tapılmadı"
          body="Axtarış və ya filtri dəyişərək yenidən cəhd edin."
          cta={
            <button
              className="btn-secondary"
              onClick={() => { setSearch(''); setStatusFilter('all'); }}
            >
              Filtri sıfırla
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p, i) => {
            const tone = FOLDER_TONE[i % FOLDER_TONE.length];
            const dark = tone === 'bg-grad-folder-forest';

            // Progress bar — tasks for this project
            const projectTasks = taskStats.filter((t) => t.project_id === p.id);
            const total = projectTasks.length;
            const done  = projectTasks.filter((t) => t.status === 'done').length;
            const pct   = total > 0 ? Math.round((done / total) * 100) : null;

            // Team avatars — unique assignees across all project tasks
            const assigneeIds = [
              ...new Set(
                projectTasks.flatMap((t) => (t.assignee_ids as string[] | null) ?? []),
              ),
            ].slice(0, 5);

            const people = assigneeIds.map((id) => ({
              id,
              name: profileMap[id]?.full_name ?? null,
              avatar_url: profileMap[id]?.avatar_url ?? null,
            }));

            return (
              <Link
                key={p.id}
                to={`/layihelər/${p.id}`}
                className={`card-interactive rounded-card p-5 min-h-[180px] flex flex-col justify-between ${tone}`}
                style={{ color: dark ? 'var(--canvas)' : 'var(--ink)' }}
              >
                {/* Top: phase chip */}
                <div>
                  <span
                    className="chip"
                    style={{
                      background: dark
                        ? 'rgba(255,255,255,0.12)'
                        : 'rgba(14,22,17,0.06)',
                      color: dark ? 'var(--canvas)' : 'var(--ink)',
                    }}
                  >
                    {p.phases[0] ?? '—'}
                  </span>
                </div>

                {/* Middle: name + status/deadline */}
                <div>
                  <h3 className="text-h3 font-bold">{p.name}</h3>
                  <div className="text-meta mt-1 opacity-80">
                    {PROJECT_STATUS_LABEL[p.status]} · {p.deadline ?? 'tarixsiz'}
                  </div>
                </div>

                {/* Bottom: avatars + progress bar */}
                <div className="flex flex-col gap-2 mt-3">
                  {people.length > 0 && <AvatarGroup people={people} size={24} max={5} />}

                  {pct !== null && (
                    <div
                      style={{
                        height: 3,
                        background: 'rgba(255,255,255,0.2)',
                        borderRadius: 999,
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background:
                            pct === 100 ? 'var(--success)' : 'var(--brand-action)',
                          borderRadius: 999,
                        }}
                      />
                    </div>
                  )}
                </div>
              </Link>
            );
          })}

          {/* Add-new mascot card */}
          <button
            className="rounded-card p-5 min-h-[180px] flex flex-col items-center justify-center gap-2 card-interactive"
            style={{ background: 'transparent', border: '1px dashed var(--line)' }}
            onClick={() => setShowCreate(true)}
          >
            <Mascot size={48} />
            <span className="text-ui">+ Yeni layihə</span>
          </button>
        </div>
      )}

      {showCreate && <ProjectCreateModal onClose={() => setShowCreate(false)} />}
    </>
  );
}
