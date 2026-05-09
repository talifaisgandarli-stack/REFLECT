/**
 * Project preview drawer — opened from Cmd+K project hits as a fast
 * peek alternative to a full route nav. Shows name, status, deadline,
 * phases, and the latest 5 tasks with a "Tam aç" CTA that navigates
 * to /layihelər/:id when the user wants the full surface.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { StatusChip } from './StatusChip';
import { formatDate, taskHealth } from '@/lib/format';
import { PROJECT_STATUS_LABEL } from '@/lib/labels';
import type { ProjectStatus, TaskStatus } from '@/types/db';

type Props = {
  projectId: string;
  onClose: () => void;
};

const HEALTH_COLOR: Record<ReturnType<typeof taskHealth>, string> = {
  green: '#22C55E',
  amber: 'var(--state-warn)',
  red: '#EF4444',
  none: '#94A3B8',
};

export function ProjectPreviewDrawer({ projectId, onClose }: Props) {
  const nav = useNavigate();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const project = useQuery({
    queryKey: ['cmdk-project', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, status, deadline, start_date, phases, requires_expertise')
        .eq('id', projectId)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        name: string;
        status: ProjectStatus;
        deadline: string | null;
        start_date: string | null;
        phases: string[];
        requires_expertise: boolean;
      } | null;
    },
  });

  const tasks = useQuery({
    queryKey: ['cmdk-project-tasks', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, status, deadline')
        .eq('project_id', projectId)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        title: string;
        status: TaskStatus;
        deadline: string | null;
      }>;
    },
  });

  const p = project.data;

  return (
    <div
      role="dialog"
      aria-label="Layihə önbaxışı"
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <aside
        className="w-[440px] max-w-[92vw] h-full bg-surface p-6 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--surface)' }}
      >
        {!p ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Yüklənir…
          </p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 mb-1">
              <h2 className="text-h2 break-words" style={{ minWidth: 0 }}>
                {p.name}
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

            <div className="text-meta mb-4" style={{ color: 'var(--text-muted)' }}>
              {PROJECT_STATUS_LABEL[p.status]}
              {p.deadline ? ` · ${formatDate(p.deadline)}` : ''}
            </div>

            {p.phases?.length ? (
              <div className="flex flex-wrap gap-1 mb-4">
                {p.phases.map((ph) => (
                  <span key={ph} className="chip">
                    {ph}
                  </span>
                ))}
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
              Son tapşırıqlar
            </h3>
            {tasks.isLoading ? (
              <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
                Yüklənir…
              </p>
            ) : (tasks.data ?? []).length === 0 ? (
              <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
                Bu layihədə tapşırıq yoxdur.
              </p>
            ) : (
              <ul className="card divide-y" style={{ borderColor: 'var(--line-soft)' }}>
                {(tasks.data ?? []).map((t) => {
                  const h = taskHealth(t.deadline);
                  return (
                    <li key={t.id} className="py-2 flex items-center gap-3">
                      <span
                        aria-hidden
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: HEALTH_COLOR[h] }}
                      />
                      <span className="flex-1 truncate text-body">{t.title}</span>
                      <StatusChip status={t.status} />
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex justify-end gap-2 mt-6">
              <button type="button" className="btn-outline" onClick={onClose}>
                Geri
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  onClose();
                  nav(`/layihelər/${p.id}`);
                }}
              >
                Tam aç
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
