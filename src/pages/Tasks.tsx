import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { isOpenChildrenError, useTasks, useUpdateTaskStatus } from '@/lib/hooks';
import { TASK_STATUS_LABEL, TASK_STATUS_ORDER, TASK_STATUS_TONE } from '@/lib/labels';
import type { Task, TaskStatus } from '@/types/db';
import { useAuth } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { SubtaskBlockingModal } from '@/components/SubtaskBlockingModal';
import { TaskCreateModal } from '@/components/TaskCreateModal';
import { CancelTaskModal } from '@/components/CancelTaskModal';
import { TaskCommentsModal } from '@/components/TaskCommentsModal';

// US-TASK-06 — deadline-based groups for personal view
const todayStr = new Date().toISOString().slice(0, 10);
const endOfWeekStr = (() => {
  const d = new Date();
  const diff = 7 - (d.getDay() === 0 ? 7 : d.getDay());
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
})();

type TimeGroup = 'overdue' | 'today' | 'week' | 'later' | 'none';
const TIME_GROUP_LABEL: Record<TimeGroup, string> = {
  overdue: 'Gecikmiş',
  today: 'Bu gün',
  week: 'Bu həftə',
  later: 'Sonra',
  none: 'Deadline yoxdur',
};
const TIME_GROUP_COLOR: Record<TimeGroup, string> = {
  overdue: '#EF4444',
  today: '#D97706',
  week: '#22C55E',
  later: 'var(--text-muted)',
  none: 'var(--text-muted)',
};
function taskTimeGroup(t: Task): TimeGroup {
  if (!t.deadline) return 'none';
  if (t.deadline < todayStr) return 'overdue';
  if (t.deadline === todayStr) return 'today';
  if (t.deadline <= endOfWeekStr) return 'week';
  return 'later';
}
const TIME_GROUP_ORDER: TimeGroup[] = ['overdue', 'today', 'week', 'later', 'none'];

export function TasksPage() {
  const { profile, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [view, setView] = useState<'board' | 'table'>('board');
  const [mineOnly, setMineOnly] = useState(false);
  const { data: tasks = [], isLoading } = useTasks(
    mineOnly && profile?.id ? { assigneeId: profile.id } : undefined,
  );
  const update = useUpdateTaskStatus();
  const [blocker, setBlocker] = useState<{ id: string; from?: TaskStatus } | null>(null);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<{ id: string; title: string } | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [commenting, setCommenting] = useState<{ id: string; title: string } | null>(null);
  // Persist search filter in URL so refresh / share-link preserves it.
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (search) next.set('q', search);
    else next.delete('q');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const archivableCount = useMemo(
    () => tasks.filter((t) => t.status === 'done' || t.status === 'cancelled').length,
    [tasks],
  );

  const bulkArchive = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('tasks')
        .update({ archived_at: new Date().toISOString() })
        .in('status', ['done', 'cancelled'])
        .is('archived_at', null);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      setConfirmArchive(false);
    },
  });

  function moveTask(id: string, status: TaskStatus, from?: TaskStatus) {
    if (status === 'cancelled') {
      const t = tasks.find((x) => x.id === id);
      setCancelling({ id, title: t?.title ?? '' });
      return;
    }
    update.mutate(
      { id, status, from },
      {
        onError: (e) => {
          if (status === 'done' && isOpenChildrenError(e)) {
            setBlocker({ id, from });
          }
        },
      },
    );
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return tasks;
    const q = search.toLowerCase();
    return tasks.filter((t) => t.title.toLowerCase().includes(q));
  }, [tasks, search]);

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      idea: [], queued: [], active: [], review: [], expert: [], done: [], cancelled: [],
    };
    for (const t of filtered) map[t.status].push(t);
    return map;
  }, [filtered]);

  // US-TASK-06 — time-grouped personal view computed data
  const groupedByTime = useMemo(() => {
    const map = {} as Record<TimeGroup, Task[]>;
    for (const g of TIME_GROUP_ORDER) map[g] = [];
    for (const t of filtered) {
      if (t.status === 'done' || t.status === 'cancelled') continue;
      map[taskTimeGroup(t)].push(t);
    }
    return map;
  }, [filtered]);

  const meta = `${filtered.length} cəmi · ${grouped.active.length} icrada · ${grouped.review.length} yoxlamada`;

  return (
    <>
      <PageHead
        meta={meta}
        title="Tapşırıqlar"
        actions={
          <>
            <input
              className="input max-w-[240px]"
              placeholder="Axtar…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              className={`btn-outline ${mineOnly ? 'border-brand-text' : ''}`}
              onClick={() => setMineOnly((v) => !v)}
            >
              Mənim
            </button>
            {isAdmin && archivableCount > 0 ? (
              <button className="btn-outline" onClick={() => setConfirmArchive(true)}>
                Arxivlə ({archivableCount})
              </button>
            ) : null}
            <button className="btn-primary" onClick={() => setCreating(true)}>
              + Yeni
            </button>
          </>
        }
      />

      <div className="flex gap-2 mb-4">
        {(['board', 'table'] as const).map((v) => (
          <button
            key={v}
            className={`chip ${view === v ? 'chip-brand' : ''}`}
            onClick={() => setView(v)}
          >
            {v === 'board' ? 'Lövhə' : 'Cədvəl'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : tasks.length === 0 ? (
        <EmptyState
          title="Hələ tapşırıq yoxdur"
          body="İlk tapşırığı yarat və BU GÜN sütunu canlanacaq."
          cta={
            <button className="btn-primary" onClick={() => setCreating(true)}>
              + Yeni tapşırıq
            </button>
          }
        />
      ) : mineOnly ? (
        // US-TASK-06 — personal view: time-grouped list with inline actions
        <div className="space-y-6">
          {TIME_GROUP_ORDER.map((g) => {
            const items = groupedByTime[g];
            if (!items.length) return null;
            return (
              <section key={g}>
                <h3
                  className="text-tiny mb-3"
                  style={{ color: TIME_GROUP_COLOR[g], letterSpacing: '0.08em', textTransform: 'uppercase' }}
                >
                  {TIME_GROUP_LABEL[g]} · {items.length}
                </h3>
                <div className="space-y-1">
                  {items.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 py-2 px-3 rounded-card"
                      style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
                    >
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => moveTask(t.id, 'done', t.status)}
                        style={{ accentColor: 'var(--brand-action)', width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }}
                        aria-label={`${t.title} tamamlandı`}
                      />
                      <span
                        className="flex-1 text-body cursor-pointer"
                        onClick={() => setCommenting({ id: t.id, title: t.title })}
                      >
                        {t.title}
                      </span>
                      {t.deadline ? (
                        <span
                          className="text-meta"
                          style={{ color: TIME_GROUP_COLOR[g], fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}
                        >
                          {t.deadline}
                        </span>
                      ) : null}
                      <span
                        className="text-meta px-2 py-0.5 rounded"
                        style={{ background: 'var(--surface-raised)', color: TASK_STATUS_TONE[t.status].text, flexShrink: 0 }}
                      >
                        {TASK_STATUS_LABEL[t.status]}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCommenting({ id: t.id, title: t.title })}
                        className="opacity-60 hover:opacity-100"
                        style={{ color: 'var(--text-muted)', fontSize: 13, flexShrink: 0 }}
                        aria-label="Şərhlər"
                      >
                        💬
                      </button>
                      <button
                        type="button"
                        onClick={() => setCancelling({ id: t.id, title: t.title })}
                        className="text-meta opacity-60 hover:opacity-100"
                        style={{ color: 'var(--text-muted)', flexShrink: 0 }}
                        aria-label={`Tapşırığı ləğv et: ${t.title}`}
                      >
                        Ləğv et
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
          {TIME_GROUP_ORDER.every((g) => !groupedByTime[g].length) && (
            <p className="text-meta" style={{ color: 'var(--text-muted)' }}>Aktiv tapşırıq yoxdur.</p>
          )}
        </div>
      ) : view === 'board' ? (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {TASK_STATUS_ORDER.map((s) => {
            const isToday = s === 'active';
            const tone = TASK_STATUS_TONE[s];
            return (
              <div
                key={s}
                className="rounded-card p-3"
                style={{
                  background: isToday ? 'var(--ink)' : 'transparent',
                  color: isToday ? 'var(--canvas)' : 'inherit',
                  border: isToday ? 'none' : '1px dashed var(--line)',
                  minHeight: 320,
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const raw = e.dataTransfer.getData('text/plain');
                  if (!raw) return;
                  const { id, from } = JSON.parse(raw);
                  if (from !== s) moveTask(id, s, from);
                }}
              >
                <h3
                  className="text-tiny mb-3"
                  style={{
                    color: isToday ? 'var(--brand-action)' : tone.text,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {isToday ? 'BU GÜN' : TASK_STATUS_LABEL[s]} · {grouped[s].length}
                </h3>
                <div className="space-y-2">
                  {grouped[s].map((t) => (
                    <article
                      key={t.id}
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData(
                          'text/plain',
                          JSON.stringify({ id: t.id, from: t.status }),
                        )
                      }
                      className="rounded-card p-3 text-body"
                      style={{
                        background: isToday ? '#1F2925' : 'var(--surface)',
                        border: `1px solid ${isToday ? '#2D3833' : 'var(--line)'}`,
                      }}
                    >
                      <div
                        className="font-medium cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); setCommenting({ id: t.id, title: t.title }); }}
                      >
                        {t.title}
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        {t.deadline ? (
                          <span
                            className="text-meta"
                            style={{
                              color: isToday ? 'var(--text-faint)' : 'var(--text-muted)',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {t.deadline}
                          </span>
                        ) : (
                          <span />
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setCommenting({ id: t.id, title: t.title }); }}
                            className="text-meta opacity-60 hover:opacity-100"
                            style={{ color: isToday ? 'var(--text-faint)' : 'var(--text-muted)', fontSize: 13 }}
                            aria-label="Şərhlər"
                          >
                            💬
                          </button>
                          {t.status !== 'done' && t.status !== 'cancelled' ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCancelling({ id: t.id, title: t.title });
                              }}
                              className="text-meta opacity-60 hover:opacity-100"
                              style={{
                                color: isToday ? 'var(--text-faint)' : 'var(--text-muted)',
                              }}
                              aria-label={`Tapşırığı ləğv et: ${t.title}`}
                            >
                              Ləğv et
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <table className="w-full text-body">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              {['Tapşırıq', 'Status', 'İcraçı', 'Deadline'].map((h) => (
                <th
                  key={h}
                  className="text-meta text-left py-3 px-3"
                  style={{
                    color: 'var(--text-muted)',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                <td className="py-3 px-3">{t.title}</td>
                <td className="py-3 px-3">{TASK_STATUS_LABEL[t.status]}</td>
                <td className="py-3 px-3">{t.assignee_ids.length} nəfər</td>
                <td className="py-3 px-3">
                  {t.deadline ? (
                    <span
                      style={{
                        color:
                          taskTimeGroup(t) === 'overdue' ? '#EF4444'
                          : taskTimeGroup(t) === 'today' ? '#D97706'
                          : taskTimeGroup(t) === 'week' ? '#22C55E'
                          : 'var(--text)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {t.deadline}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {blocker ? (
        <SubtaskBlockingModal
          parentTaskId={blocker.id}
          onCancel={() => setBlocker(null)}
          onResolved={() => {
            const b = blocker;
            setBlocker(null);
            if (b) moveTask(b.id, 'done', b.from);
          }}
        />
      ) : null}

      {creating ? <TaskCreateModal onClose={() => setCreating(false)} /> : null}

      {cancelling ? (
        <CancelTaskModal
          taskId={cancelling.id}
          taskTitle={cancelling.title}
          onCancel={() => setCancelling(null)}
          onCancelled={() => {
            setCancelling(null);
            update.reset();
          }}
        />
      ) : null}

      {commenting ? (
        <TaskCommentsModal
          taskId={commenting.id}
          taskTitle={commenting.title}
          onClose={() => setCommenting(null)}
        />
      ) : null}

      {confirmArchive ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(14,22,17,0.55)' }}
          onClick={() => setConfirmArchive(false)}
        >
          <div
            className="bg-surface p-6 rounded-card w-[380px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-h2 mb-2">Toplu arxivləmə</h2>
            <p className="text-body mb-5" style={{ color: 'var(--text-muted)' }}>
              {archivableCount} ədəd <strong>Tamamlandı</strong> / <strong>Ləğv edildi</strong>{' '}
              tapşırığı arxivlənəcək. Tapşırıqlar lövhədən silinəcək; Arxiv bölməsindən bərpa edilə bilər.
            </p>
            {bulkArchive.error ? (
              <p className="text-meta mb-3" style={{ color: '#B91C1C' }}>
                {(bulkArchive.error as Error).message}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button className="btn-outline" onClick={() => setConfirmArchive(false)}>
                Ləğv et
              </button>
              <button
                className="btn-primary"
                disabled={bulkArchive.isPending}
                onClick={() => bulkArchive.mutate()}
              >
                {bulkArchive.isPending ? 'Arxivlənir…' : 'Arxivlə'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
