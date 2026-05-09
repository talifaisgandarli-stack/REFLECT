import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import {
  isOpenChildrenError,
  useTasks,
  useTeamPresence,
  useUpdateTaskStatus,
} from '@/lib/hooks';
import { TASK_STATUS_LABEL, TASK_STATUS_ORDER, TASK_STATUS_TONE } from '@/lib/labels';
import type { Task, TaskStatus } from '@/types/db';
import { useAuth } from '@/lib/store';
import { SubtaskBlockingModal } from '@/components/SubtaskBlockingModal';
import { TaskCreateModal } from '@/components/TaskCreateModal';
import { CancelTaskModal } from '@/components/CancelTaskModal';
import { useT } from '@/lib/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { usePullToRefresh } from '@/lib/usePullToRefresh';

export function TasksPage() {
  const t = useT();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { hash } = useLocation();
  const [view, setView] = useState<'board' | 'table'>('board');
  const [mineOnly, setMineOnly] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const ptr = usePullToRefresh(async () => {
    await qc.invalidateQueries({ queryKey: ['tasks'] });
  });
  const { data: presenceRows = [] } = useTeamPresence();
  const presenceById = useMemo(() => {
    const m = new Map<string, 'online' | 'away' | 'offline'>();
    for (const p of presenceRows) m.set(p.user_id, p.status);
    return m;
  }, [presenceRows]);
  function aggregatePresence(uids: string[]): 'online' | 'away' | null {
    if (!uids?.length) return null;
    let any = false;
    for (const id of uids) {
      const s = presenceById.get(id);
      if (s === 'online') return 'online';
      if (s === 'away') any = true;
    }
    return any ? 'away' : null;
  }

  useEffect(() => {
    const m = hash.match(/^#task-([0-9a-f-]+)/i);
    if (!m) return;
    const id = m[1];
    setHighlightId(id);
    // Defer until cards render
    const t = setTimeout(() => {
      const el = document.getElementById(`task-${id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
    const clear = setTimeout(() => setHighlightId(null), 4000);
    return () => {
      clearTimeout(t);
      clearTimeout(clear);
    };
  }, [hash]);
  const { data: tasks = [], isLoading } = useTasks(
    mineOnly && profile?.id ? { assigneeId: profile.id } : undefined,
  );
  const update = useUpdateTaskStatus();
  const [blocker, setBlocker] = useState<{ id: string; from?: TaskStatus } | null>(null);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<{ id: string; title: string } | null>(null);

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

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      idea: [], queued: [], active: [], review: [], expert: [], done: [], cancelled: [],
    };
    for (const t of tasks) map[t.status].push(t);
    return map;
  }, [tasks]);

  const meta = `${tasks.length} cəmi · ${grouped.active.length} icrada · ${grouped.review.length} yoxlamada`;

  return (
    <div {...ptr.bind} style={{ touchAction: 'pan-y' }}>
      {ptr.offset > 0 || ptr.refreshing ? (
        <div
          aria-hidden
          className="lg:hidden flex justify-center"
          style={{
            height: ptr.refreshing ? 30 : Math.max(0, ptr.offset),
            transition: ptr.offset === 0 ? 'height 220ms var(--ease-out)' : undefined,
          }}
        >
          <span
            className="text-tiny font-medium"
            style={{
              color: ptr.offset >= 70 || ptr.refreshing ? 'var(--brand-text)' : 'var(--text-muted)',
              padding: '6px 12px',
              borderRadius: 999,
              background: 'var(--surface-mist)',
              alignSelf: 'flex-end',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {ptr.refreshing
              ? 'Yenilənir…'
              : ptr.offset >= 70
                ? 'Buraxın və yeniləyin'
                : 'Aşağı çəkin'}
          </span>
        </div>
      ) : null}
      <PageHead
        meta={meta}
        title={t('tasks.title')}
        actions={
          <>
            <input className="input max-w-[240px]" placeholder={t('common.search')} />
            <button
              className={`btn-outline ${mineOnly ? 'border-brand-text' : ''}`}
              onClick={() => setMineOnly((v) => !v)}
            >
              {t('common.mine')}
            </button>
            <button className="btn-primary" onClick={() => setCreating(true)}>
              {t('task.create.cta')}
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
            {v === 'board' ? t('tasks.view.board') : t('tasks.view.table')}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : tasks.length === 0 ? (
        <EmptyState
          title={t('tasks.empty.title')}
          body={t('tasks.empty.body')}
          cta={
            <button className="btn-primary" onClick={() => setCreating(true)}>
              {t('task.create.cta_first')}
            </button>
          }
        />
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
                      id={`task-${t.id}`}
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
                        border:
                          highlightId === t.id
                            ? '2px solid var(--brand-action)'
                            : `1px solid ${isToday ? '#2D3833' : 'var(--line)'}`,
                        boxShadow:
                          highlightId === t.id
                            ? '0 0 0 4px rgba(173,251,73,0.18)'
                            : undefined,
                        transition: 'border-color var(--dur-base), box-shadow var(--dur-base)',
                      }}
                    >
                      <div className="font-medium flex items-center gap-2">
                        {(() => {
                          const live = aggregatePresence(t.assignee_ids);
                          if (!live) return null;
                          return (
                            <span
                              aria-label={
                                live === 'online' ? 'İcraçı onlayn' : 'İcraçı uzaqda'
                              }
                              title={live === 'online' ? 'İcraçı onlayn' : 'İcraçı uzaqda'}
                              className="inline-block rounded-full shrink-0"
                              style={{
                                width: 7,
                                height: 7,
                                background: live === 'online' ? '#22C55E' : '#F59E0B',
                                boxShadow: '0 0 0 2px var(--surface)',
                              }}
                            />
                          );
                        })()}
                        <span className="truncate">{t.title}</span>
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
                <td className="py-3 px-3">{t.deadline ?? '—'}</td>
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
    </div>
  );
}
