/**
 * Task detail page (slice 132) — full route at /tapşırıqlar/:id.
 *
 * Until this slice the only "task detail" surface was the Cmd+K
 * preview drawer + a kanban hash anchor. /tapşırıqlar#task-<id>
 * works for highlighting a card but doesn't deep-link from email or
 * Telegram. This route is bookmarkable, screen-reader-friendly, and
 * shows the same data the drawer does plus subtasks (slice 133).
 *
 * Reuses StatusChip + TaskCommentInput so the surface is consistent
 * with the drawer; comments render with the mention chip from slice
 * 131. RLS restricts what the user can see at the DB layer.
 */
import { Link, useParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { StatusChip } from '@/components/StatusChip';
import { TaskCommentInput } from '@/components/TaskCommentInput';
import { renderCommentSegments } from '@/lib/commentMentions';
import { formatDate, relativeTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useAuth } from '@/lib/store';
import { isOpenChildrenError, useUpdateTaskStatus } from '@/lib/hooks';
import { CancelTaskModal } from '@/components/CancelTaskModal';
import { SubtaskBlockingModal } from '@/components/SubtaskBlockingModal';
import { TASK_STATUS_ORDER } from '@/lib/labels';
import type { Task, TaskStatus } from '@/types/db';

type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
};

export function TaskDetailPage() {
  const t = useT();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { id = '' } = useParams();
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [blocker, setBlocker] = useState(false);
  const updateStatus = useUpdateTaskStatus();

  const task = useQuery({
    queryKey: ['task-detail', id],
    enabled: !!id,
    queryFn: async (): Promise<Task | null> => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data as Task | null) ?? null;
    },
  });

  const project = useQuery({
    queryKey: ['task-detail', id, 'project'],
    enabled: !!task.data?.project_id,
    queryFn: async () => {
      if (!task.data?.project_id) return null;
      const { data } = await supabase
        .from('projects')
        .select('id, name')
        .eq('id', task.data.project_id)
        .maybeSingle();
      return data as { id: string; name: string } | null;
    },
  });

  const subtasks = useQuery({
    queryKey: ['task-detail', id, 'subtasks'],
    enabled: !!id,
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('parent_task_id', id)
        .is('archived_at', null)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });

  const addSubtask = useMutation({
    mutationFn: async () => {
      const trimmed = newSubtaskTitle.trim();
      if (!trimmed || !task.data) return;
      const { error } = await supabase.from('tasks').insert({
        title: trimmed,
        status: 'queued' as TaskStatus,
        project_id: task.data.project_id,
        parent_task_id: task.data.id,
        task_level: (task.data.task_level ?? 0) + 1,
        is_expertise_subtask: false,
        assignee_ids: [],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewSubtaskTitle('');
      qc.invalidateQueries({ queryKey: ['task-detail', id, 'subtasks'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const comments = useQuery({
    queryKey: ['task-comments', id],
    enabled: !!id,
    queryFn: async (): Promise<CommentRow[]> => {
      const { data, error } = await supabase
        .from('task_comments')
        .select('id, body, created_at, user_id')
        .eq('task_id', id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CommentRow[];
    },
  });

  const profiles = useQuery({
    queryKey: ['comment-mention-profiles'],
    enabled: (comments.data ?? []).some((c) => c.body.includes('@')),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email');
      if (error) throw error;
      return data as Array<{ id: string; full_name: string | null; email: string }>;
    },
  });

  const mentionLookup = useMemo(() => {
    const byId = new Map<string, string>();
    for (const p of profiles.data ?? []) {
      byId.set(p.id, p.full_name ?? p.email);
    }
    return { byId };
  }, [profiles.data]);

  if (task.isLoading) {
    return <div className="card text-meta">{t('common.loading')}</div>;
  }
  if (!task.data) {
    return (
      <div className="card text-meta">
        {t('task.detail.not_found')}{' '}
        <Link to="/tapşırıqlar">{t('common.back')}</Link>
      </div>
    );
  }

  const tk = task.data;

  return (
    <>
      <PageHead
        meta={project.data?.name ?? tk.project_id ?? ''}
        title={tk.title}
        actions={
          <span className="flex items-center gap-2 flex-wrap">
            <StatusChip status={tk.status} />
            {tk.status !== 'done' && tk.status !== 'cancelled' ? (
              <>
                <select
                  className="input"
                  value={tk.status}
                  onChange={(e) => {
                    const next = e.target.value as TaskStatus;
                    if (next === tk.status) return;
                    updateStatus.mutate(
                      { id: tk.id, status: next, from: tk.status },
                      {
                        onError: (err) => {
                          if (next === 'done' && isOpenChildrenError(err)) {
                            setBlocker(true);
                          }
                        },
                      },
                    );
                  }}
                  aria-label={t('task.detail.status_change_aria')}
                  style={{ height: 32, paddingTop: 0, paddingBottom: 0 }}
                  disabled={updateStatus.isPending}
                >
                  {TASK_STATUS_ORDER.filter(
                    (s) => s !== 'done' || tk.status === 'review' || tk.status === 'expert',
                  ).map((s) => (
                    <option key={s} value={s}>
                      {t(`task.status.${s}`)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setCancelling(true)}
                  disabled={updateStatus.isPending}
                >
                  {t('task.cancel.cta')}
                </button>
              </>
            ) : null}
          </span>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="card lg:col-span-2">
          {tk.description ? (
            <p className="text-body whitespace-pre-wrap">{tk.description}</p>
          ) : (
            <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
              {t('task.detail.no_description')}
            </p>
          )}
        </section>

        <aside className="card">
          <h3 className="text-h4 mb-3">{t('task.detail.facts_title')}</h3>
          <dl className="text-body space-y-2">
            <Row k={t('tasks.col.deadline')} v={tk.deadline ? formatDate(tk.deadline) : '—'} />
            <Row
              k={t('task.create.start_field')}
              v={tk.start_date ? formatDate(tk.start_date) : '—'}
            />
            <Row
              k={t('task.create.duration_field')}
              v={
                tk.estimated_duration != null
                  ? `${tk.estimated_duration} ${tk.duration_unit}`
                  : '—'
              }
            />
            <Row
              k={t('task.create.risk_label', { pct: tk.risk_buffer_pct ?? 0 })}
              v={tk.workload != null ? String(tk.workload) : '—'}
            />
            <Row
              k={t('tasks.col.assignee')}
              v={
                (tk.assignee_ids?.length ?? 0) > 0
                  ? t('tasks.assignees_count', { count: tk.assignee_ids?.length ?? 0 })
                  : '—'
              }
            />
          </dl>
        </aside>
      </div>

      <section className="mt-6">
        <h3
          className="text-meta mb-2"
          style={{
            color: 'var(--text-muted)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          {t('task.detail.subtasks_title', { count: subtasks.data?.length ?? 0 })}
        </h3>
        {(subtasks.data ?? []).length === 0 ? (
          <p className="text-meta mb-2" style={{ color: 'var(--text-muted)' }}>
            {t('task.detail.subtasks_empty')}
          </p>
        ) : (
          <ul className="card divide-y mb-2" style={{ borderColor: 'var(--line-soft)' }}>
            {(subtasks.data ?? []).map((sub) => (
              <li key={sub.id} className="py-3 flex items-center justify-between gap-3">
                <Link
                  to={`/tapşırıqlar/${sub.id}`}
                  className="flex-1 min-w-0 truncate"
                  style={{ color: 'var(--text)' }}
                >
                  {sub.is_expertise_subtask ? (
                    <span
                      aria-hidden
                      className="text-tiny mr-2"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      ◇
                    </span>
                  ) : null}
                  {sub.title}
                </Link>
                <StatusChip status={sub.status} />
              </li>
            ))}
          </ul>
        )}
        {profile?.id ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addSubtask.mutate();
            }}
          >
            <input
              className="input flex-1"
              value={newSubtaskTitle}
              onChange={(e) => setNewSubtaskTitle(e.target.value)}
              placeholder={t('task.detail.subtasks_placeholder')}
            />
            <button
              type="submit"
              className="btn-outline"
              disabled={addSubtask.isPending || !newSubtaskTitle.trim()}
            >
              {addSubtask.isPending
                ? t('common.loading')
                : t('task.detail.subtasks_add')}
            </button>
          </form>
        ) : null}
        {addSubtask.error ? (
          <p className="text-meta mt-2" style={{ color: 'var(--state-error)' }}>
            {(addSubtask.error as Error).message}
          </p>
        ) : null}
      </section>

      <section className="mt-6">
        <h3
          className="text-meta mb-2"
          style={{
            color: 'var(--text-muted)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          {t('task.comments.title')}
        </h3>
        {comments.isLoading ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            {t('common.loading')}
          </p>
        ) : (comments.data ?? []).length === 0 ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            {t('task.comments.empty')}
          </p>
        ) : (
          <ul className="card divide-y" style={{ borderColor: 'var(--line-soft)' }}>
            {(comments.data ?? []).map((c) => {
              const segments = renderCommentSegments(c.body, mentionLookup);
              return (
                <li key={c.id} className="py-2">
                  <p className="text-body whitespace-pre-wrap">
                    {segments.map((seg, i) =>
                      seg.kind === 'text' ? (
                        <span key={i}>{seg.text}</span>
                      ) : (
                        <span
                          key={i}
                          className="chip"
                          style={{
                            background: 'var(--brand-mist)',
                            color: 'var(--brand-text)',
                            padding: '1px 6px',
                            marginRight: 2,
                            fontSize: 'inherit',
                            lineHeight: 'inherit',
                          }}
                        >
                          @{seg.label}
                        </span>
                      ),
                    )}
                  </p>
                  <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
                    {relativeTime(c.created_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <TaskCommentInput taskId={tk.id} />
      </section>

      {cancelling ? (
        <CancelTaskModal
          taskId={tk.id}
          taskTitle={tk.title}
          onCancel={() => setCancelling(false)}
          onCancelled={() => {
            setCancelling(false);
            qc.invalidateQueries({ queryKey: ['task-detail', id] });
          }}
        />
      ) : null}

      {blocker ? (
        <SubtaskBlockingModal
          parentTaskId={tk.id}
          onCancel={() => setBlocker(false)}
          onResolved={() => {
            setBlocker(false);
            updateStatus.mutate({ id: tk.id, status: 'done', from: tk.status });
          }}
        />
      ) : null}
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
