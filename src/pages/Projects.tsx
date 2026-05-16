import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useProjects } from '@/lib/hooks';
import { Mascot } from '@/components/Mascot';
import { PROJECT_STATUS_LABEL } from '@/lib/labels';
import { ProjectCreateModal } from '@/components/ProjectCreateModal';
import { SkeletonList } from '@/components/Skeleton';
import { AvatarGroup } from '@/components/AvatarGroup';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';

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
  const { isAdmin, profile } = useAuth();
  const qc = useQueryClient();
  const { data: projects = [], isLoading } = useProjects();

  // PRD §UX — per-user project favorites
  const favorites = useQuery({
    queryKey: ['project-favorites', profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('project_favorites')
        .select('project_id')
        .eq('user_id', profile!.id);
      return new Set((data ?? []).map((r) => r.project_id as string));
    },
  });

  const toggleFavorite = useMutation({
    mutationFn: async (projectId: string) => {
      if (!profile?.id) return;
      const isFav = favorites.data?.has(projectId);
      if (isFav) {
        await supabase
          .from('project_favorites')
          .delete()
          .eq('user_id', profile.id)
          .eq('project_id', projectId);
      } else {
        await supabase
          .from('project_favorites')
          .insert({ user_id: profile.id, project_id: projectId });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-favorites'] }),
  });

  const [showCreate, setShowCreate] = useState(false);
  // PRD §UX — persist search filter in URL so refresh/share-link preserves it
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const initStatus = searchParams.get('status') as StatusFilter | null;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    initStatus && ['all', 'active', 'on_hold', 'closed'].includes(initStatus) ? initStatus : 'all',
  );
  // PRD §UX — favorites-only filter chip
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  // PRD §6.x — project tag filter (migration 0053)
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const p of projects) for (const t of ((p as { tags?: string[] }).tags ?? [])) s.add(t);
    return Array.from(s).sort();
  }, [projects]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (search) next.set('q', search);
    else next.delete('q');
    if (statusFilter !== 'all') next.set('status', statusFilter);
    else next.delete('status');
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);
  // PRD §6.x — bulk archive (admin only). Selection mode is opt-in to keep
  // single-card click-to-open behaviour the default.
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function exitBulkMode() {
    setBulkMode(false);
    setSelectedIds(new Set());
  }

  const bulkArchive = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      const { error } = await supabase
        .from('projects')
        .update({ status: 'closed', archived_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      exitBulkMode();
    },
  });

  // PRD §6.x — admin clones an existing project (name + phases + client +
  // expertise/buffer/deadline metadata). Tasks are NOT copied — start fresh.
  const cloneProject = useMutation({
    mutationFn: async (sourceId: string) => {
      const src = projects.find((p) => p.id === sourceId);
      if (!src) throw new Error('Layihə tapılmadı');
      const { error } = await supabase.from('projects').insert({
        name: `${src.name} (kopya)`,
        client_id: src.client_id,
        phases: src.phases,
        requires_expertise: src.requires_expertise,
        expertise_deadline: src.expertise_deadline,
        payment_buffer_days: src.payment_buffer_days,
        deadline: src.deadline,
        start_date: src.start_date,
        status: 'on_hold',
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });

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
    const matchesTag =
      !tagFilter || ((p as { tags?: string[] }).tags ?? []).includes(tagFilter);
    const matchesFav = !favoritesOnly || favorites.data?.has(p.id);
    return matchesSearch && matchesStatus && matchesTag && matchesFav;
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
            {isAdmin ? (
              <button
                className={`btn-outline ${bulkMode ? 'border-brand-text' : ''}`}
                onClick={() => bulkMode ? exitBulkMode() : setBulkMode(true)}
                style={bulkMode ? { background: 'var(--brand-action)', color: 'var(--ink)' } : undefined}
              >
                {bulkMode ? `✓ Seçim (${selectedIds.size})` : 'Seç'}
              </button>
            ) : null}
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              + Yeni layihə
            </button>
          </>
        }
      />

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {/* PRD §UX — favorites-only quick filter */}
        {favorites.data && favorites.data.size > 0 ? (
          <button
            className="chip"
            style={
              favoritesOnly
                ? { background: 'var(--brand-action)', color: 'var(--canvas)' }
                : undefined
            }
            onClick={() => setFavoritesOnly((v) => !v)}
            title="Yalnız sevimliləri göstər"
          >
            {favoritesOnly ? '★' : '☆'} Sevimlilər ({favorites.data.size})
          </button>
        ) : null}
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

      {/* PRD §6.x — tag filter row (migration 0053) */}
      {allTags.length > 0 ? (
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-meta self-center" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
            Etiketlər:
          </span>
          {allTags.map((tag) => (
            <button
              key={tag}
              className="chip"
              style={
                tagFilter === tag
                  ? { background: 'var(--brand-action)', color: 'var(--canvas)' }
                  : undefined
              }
              onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
            >
              #{tag}
            </button>
          ))}
        </div>
      ) : null}

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

            const isSelected = selectedIds.has(p.id);
            const cardStyle: React.CSSProperties = {
              color: dark ? 'var(--canvas)' : 'var(--ink)',
              ...(bulkMode && isSelected
                ? { outline: '3px solid var(--brand-action)', outlineOffset: 2 }
                : {}),
              ...(bulkMode ? { cursor: 'pointer' } : {}),
            };

            const cardInner = (
              <>
                {/* Top: phase chip + completion % badge + selection indicator */}
                <div className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-2">
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
                    {/* PRD §UX — completion % badge when ≥1 task */}
                    {pct !== null ? (
                      <span
                        className="chip"
                        style={{
                          background: 'transparent',
                          color: dark ? 'var(--canvas)' : 'var(--ink)',
                          fontVariantNumeric: 'tabular-nums',
                          fontSize: 10,
                          opacity: 0.7,
                        }}
                      >
                        {pct}%
                      </span>
                    ) : null}
                  </span>
                  {bulkMode ? (
                    <span
                      aria-label={isSelected ? 'Seçildi' : 'Seçilməyib'}
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        border: `2px solid ${isSelected ? 'var(--brand-action)' : (dark ? 'rgba(255,255,255,0.5)' : 'rgba(14,22,17,0.3)')}`,
                        background: isSelected ? 'var(--brand-action)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--ink)',
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {isSelected ? '✓' : ''}
                    </span>
                  ) : null}
                </div>

                {/* Middle: name + status/deadline + tag chips */}
                <div>
                  <h3 className="text-h3 font-bold">{p.name}</h3>
                  <div className="text-meta mt-1 opacity-80">
                    {PROJECT_STATUS_LABEL[p.status]} · {p.deadline ?? 'tarixsiz'}
                  </div>
                  {((p as { tags?: string[] }).tags ?? []).length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {((p as { tags?: string[] }).tags ?? []).slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="chip"
                          style={{
                            background: dark ? 'rgba(255,255,255,0.10)' : 'rgba(14,22,17,0.06)',
                            color: dark ? 'var(--canvas)' : 'var(--ink)',
                            fontSize: 9,
                            padding: '1px 5px',
                            opacity: 0.85,
                          }}
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
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
              </>
            );

            // Bulk mode swaps Link → button so clicks toggle selection
            return bulkMode ? (
              <button
                key={p.id}
                type="button"
                className={`card-interactive rounded-card p-5 min-h-[180px] flex flex-col justify-between text-left ${tone}`}
                style={cardStyle}
                onClick={() => toggleSelected(p.id)}
              >
                {cardInner}
              </button>
            ) : (
              <div key={p.id} className="relative">
                <Link
                  to={`/layihelər/${p.id}`}
                  className={`card-interactive rounded-card p-5 min-h-[180px] flex flex-col justify-between ${tone}`}
                  style={cardStyle}
                >
                  {cardInner}
                </Link>
                {/* PRD §UX — favorite star (everyone) + admin clone (admin only) */}
                <div className="absolute top-2 right-2 flex items-center gap-1">
                  <button
                    type="button"
                    className="chip text-tiny opacity-60 hover:opacity-100"
                    style={{
                      background: dark ? 'rgba(255,255,255,0.12)' : 'rgba(14,22,17,0.06)',
                      color: favorites.data?.has(p.id) ? 'var(--brand-action)' : (dark ? 'var(--canvas)' : 'var(--ink)'),
                      fontSize: 10,
                      padding: '2px 6px',
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleFavorite.mutate(p.id);
                    }}
                    title={favorites.data?.has(p.id) ? 'Sevimlilərdən çıxar' : 'Sevimlilərə əlavə et'}
                    disabled={toggleFavorite.isPending}
                  >
                    {favorites.data?.has(p.id) ? '★' : '☆'}
                  </button>
                  {isAdmin ? (
                    <button
                      type="button"
                      className="chip text-tiny opacity-60 hover:opacity-100"
                      style={{
                        background: dark ? 'rgba(255,255,255,0.12)' : 'rgba(14,22,17,0.06)',
                        color: dark ? 'var(--canvas)' : 'var(--ink)',
                        fontSize: 10,
                        padding: '2px 6px',
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        cloneProject.mutate(p.id);
                      }}
                      title="Layihəni klonla"
                      disabled={cloneProject.isPending}
                    >
                      ⎘ Klonla
                    </button>
                  ) : null}
                </div>
              </div>
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

      {/* PRD §6.x — bulk action floating bar (admin only) */}
      {bulkMode && selectedIds.size > 0 ? (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-capsule px-4 py-3 flex items-center gap-3 shadow-xl z-40"
          style={{
            background: 'var(--ink)',
            color: 'var(--canvas)',
            border: '1px solid rgba(255,255,255,0.1)',
            minWidth: 320,
          }}
        >
          <span className="text-body font-medium">{selectedIds.size} layihə seçili</span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="chip"
            style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--canvas)' }}
            disabled={bulkArchive.isPending}
            onClick={() => bulkArchive.mutate()}
          >
            {bulkArchive.isPending ? 'Arxivlənir…' : 'Arxivlə (Bağla)'}
          </button>
          <button
            type="button"
            className="chip"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--canvas)' }}
            onClick={exitBulkMode}
            aria-label="Seçim rejimini bağla"
          >
            ×
          </button>
        </div>
      ) : null}

      {showCreate && <ProjectCreateModal onClose={() => setShowCreate(false)} />}
    </>
  );
}
