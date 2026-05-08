import { useMemo, useState } from 'react';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { isOpenChildrenError, useTasks, useUpdateTaskStatus } from '@/lib/hooks';
import { TASK_STATUS_LABEL, TASK_STATUS_ORDER, TASK_STATUS_TONE } from '@/lib/labels';
import type { Task, TaskStatus } from '@/types/db';
import { useAuth } from '@/lib/store';
import { SubtaskBlockingModal } from '@/components/SubtaskBlockingModal';
import { TaskModal } from '@/components/TaskModal';
import { TaskQuickCreate } from '@/components/TaskQuickCreate';
import { CancelTaskModal } from '@/components/CancelTaskModal';

export function TasksPage() {
  const { profile } = useAuth();
  const [view, setView] = useState<'board' | 'table'>('board');
  const [mineOnly, setMineOnly] = useState(false);
  const { data: tasks = [], isLoading } = useTasks(
    mineOnly && profile?.id ? { assigneeId: profile.id } : undefined,
  );
  const update = useUpdateTaskStatus();
  const [blocker, setBlocker] = useState<{ id: string; from?: TaskStatus } | null>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  function moveTask(id: string, status: TaskStatus, from?: TaskStatus) {
    if (status === 'cancelled' && from !== 'cancelled') {
      // REQ-TASK-04 — never cancel without a reason. Open the modal instead.
      setCancelling(id);
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
    <>
      <PageHead
        meta={meta}
        title="Tapşırıqlar"
        actions={
          <>
            <input className="input max-w-[240px]" placeholder="Axtar…" />
            <button
              className={`btn-outline ${mineOnly ? 'border-brand-text' : ''}`}
              onClick={() => setMineOnly((v) => !v)}
            >
              Mənim
            </button>
            <button className="btn-primary" onClick={() => setOpenCreate(true)}>+ Yeni</button>
          </>
        }
      />

      <div className="flex gap-3 items-start mb-4 flex-wrap">
        <div className="flex gap-2">
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
        <div className="flex-1 min-w-[260px] max-w-md">
          <TaskQuickCreate />
        </div>
      </div>

      {isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : tasks.length === 0 ? (
        <EmptyState
          title="Hələ tapşırıq yoxdur"
          body="İlk tapşırığı yarat və BU GÜN sütunu canlanacaq."
          cta={<button className="btn-primary">+ Yeni tapşırıq</button>}
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
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', JSON.stringify({ id: t.id, from: t.status }))}
                      onDragOver={(e) => e.preventDefault()}
                      className="rounded-card p-3 text-body group relative"
                      style={{
                        background: isToday ? '#1F2925' : 'var(--surface)',
                        border: `1px solid ${isToday ? '#2D3833' : 'var(--line)'}`,
                      }}
                    >
                      <div className="font-medium pr-6">{t.title}</div>
                      {t.deadline ? (
                        <div className="text-meta opacity-70 mt-1">{t.deadline}</div>
                      ) : null}
                      {t.status !== 'done' && t.status !== 'cancelled' ? (
                        <button
                          type="button"
                          onClick={() => setCancelling(t.id)}
                          className="absolute top-2 right-2 text-meta opacity-0 group-hover:opacity-80 hover:opacity-100 transition-opacity"
                          aria-label="Ləğv et"
                          style={{ color: isToday ? 'var(--canvas)' : 'var(--text-muted)' }}
                        >
                          ✕
                        </button>
                      ) : null}
                    </article>
                  ))}
                </div>
                <div
                  className="mt-3 text-meta opacity-60 text-center"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const { id, from } = JSON.parse(e.dataTransfer.getData('text/plain'));
                    if (from !== s) moveTask(id, s, from);
                  }}
                  style={{ minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  buraya at
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

      {openCreate ? <TaskModal onClose={() => setOpenCreate(false)} /> : null}
      {cancelling ? (
        <CancelTaskModal taskId={cancelling} onClose={() => setCancelling(null)} />
      ) : null}
    </>
  );
}
