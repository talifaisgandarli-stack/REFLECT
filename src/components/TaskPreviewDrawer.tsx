/**
 * Task preview drawer — opened from Cmd+K task hits as a fast peek.
 * Shows title, status chip, deadline, project name, recent comments.
 * "Tam aç" navigates to /tapşırıqlar with the row deep-linked via hash
 * so the kanban scrolls + highlights the card.
 */
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { StatusChip } from './StatusChip';
import { TaskCommentInput } from './TaskCommentInput';
import { formatDate, relativeTime, taskHealth } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { renderCommentSegments } from '@/lib/commentMentions';
import type { TaskStatus } from '@/types/db';

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  deadline: string | null;
  project_id: string | null;
  assignee_ids: string[];
  workload: number | null;
  created_at: string;
};

type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
};

const HEALTH_COLOR: Record<ReturnType<typeof taskHealth>, string> = {
  green: '#22C55E',
  amber: 'var(--state-warn)',
  red: '#EF4444',
  none: '#94A3B8',
};

type Props = { taskId: string; onClose: () => void };

export function TaskPreviewDrawer({ taskId, onClose }: Props) {
  const tr = useT();
  const nav = useNavigate();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const task = useQuery({
    queryKey: ['cmdk-task', taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, description, status, deadline, project_id, assignee_ids, workload, created_at')
        .eq('id', taskId)
        .maybeSingle();
      if (error) throw error;
      return data as TaskRow | null;
    },
  });

  const comments = useQuery({
    queryKey: ['cmdk-task-comments', taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_comments')
        .select('id, body, created_at, user_id')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false })
        .limit(3);
      if (error) throw error;
      return (data ?? []) as CommentRow[];
    },
  });

  // Mentions render as @FullName chips — fetch every profile once and
  // pass an id→label map into renderCommentSegments. Loaded lazily so
  // the drawer renders fast when no comments exist.
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

  const project = useQuery({
    queryKey: ['cmdk-task-project', task.data?.project_id],
    enabled: !!task.data?.project_id,
    queryFn: async () => {
      if (!task.data?.project_id) return null;
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .eq('id', task.data.project_id)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; name: string } | null;
    },
  });

  const t = task.data;

  return (
    <div
      role="dialog"
      aria-label="Tapşırıq önbaxışı"
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <aside
        className="w-[440px] max-w-[92vw] h-full bg-surface p-6 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--surface)' }}
      >
        {!t ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Yüklənir…
          </p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 mb-2">
              <h2 className="text-h2 break-words" style={{ minWidth: 0 }}>
                {t.title}
              </h2>
              <button
                type="button"
                aria-label="Bağla"
                onClick={onClose}
                className="text-meta"
                style={{ color: 'var(--text-muted)', fontSize: 20, lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-4">
              <StatusChip status={t.status} />
              {t.deadline ? (
                <span
                  className="chip inline-flex items-center gap-1.5"
                  style={{
                    background: 'var(--surface-mist)',
                    color: HEALTH_COLOR[taskHealth(t.deadline)],
                  }}
                >
                  <span
                    aria-hidden
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: HEALTH_COLOR[taskHealth(t.deadline)] }}
                  />
                  {formatDate(t.deadline)}
                </span>
              ) : null}
              {project.data ? (
                <span className="chip">{project.data.name}</span>
              ) : null}
              {t.assignee_ids?.length ? (
                <span
                  className="chip"
                  style={{ background: 'var(--brand-mist)', color: 'var(--brand-text)' }}
                >
                  {t.assignee_ids.length} icraçı
                </span>
              ) : null}
            </div>

            {t.description ? (
              <div className="card" style={{ padding: 14, marginBottom: 16 }}>
                <p className="text-body whitespace-pre-wrap">{t.description}</p>
              </div>
            ) : null}

            {t.workload != null ? (
              <div className="text-meta mb-4" style={{ color: 'var(--text-muted)' }}>
                İş yükü: {t.workload}
              </div>
            ) : null}

            <h3
              className="text-tiny mb-2"
              style={{
                color: 'var(--text-muted)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {tr('task.comments.title')}
            </h3>
            {comments.isLoading ? (
              <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
                {tr('common.loading')}
              </p>
            ) : (comments.data ?? []).length === 0 ? (
              <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
                {tr('task.comments.empty')}
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

            <TaskCommentInput taskId={t.id} />

            <div className="flex justify-end gap-2 mt-6">
              <button type="button" className="btn-outline" onClick={onClose}>
                {tr('common.back')}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  onClose();
                  nav(`/tapşırıqlar#task-${t.id}`);
                }}
              >
                {tr('task.comments.open_full')}
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
