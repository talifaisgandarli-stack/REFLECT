/**
 * REQ-TASK-05 — when parent task moves to Tamamlandı with open children,
 * surface blockers and offer "Hamısını tamamla" shortcut.
 *
 * The DB trigger tasks_block_done_with_open_children is the final guard;
 * this component is the UX layer that prevents the round-trip.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Task } from '@/types/db';
import { useT } from '@/lib/i18n';

type Props = {
  parentTaskId: string;
  onCancel: () => void;
  onResolved: () => void;
};

export function SubtaskBlockingModal({ parentTaskId, onCancel, onResolved }: Props) {
  const t = useT();
  const [children, setChildren] = useState<Task[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('tasks')
      .select('*')
      .eq('parent_task_id', parentTaskId)
      .is('archived_at', null)
      .not('status', 'in', '(done,cancelled)')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setErr(error.message);
        else setChildren((data ?? []) as Task[]);
      });
    return () => {
      cancelled = true;
    };
  }, [parentTaskId]);

  async function completeAll() {
    if (!children) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'done' })
      .in('id', children.map((c) => c.id));
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    onResolved();
  }

  return (
    <div
      role="dialog"
      aria-label={t('task.subtask.blocker.dialog_label')}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onCancel}
    >
      <div
        className="card w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        style={{ padding: 24 }}
      >
        <h2 className="text-h2">{t('task.subtask.blocker')}</h2>
        <p className="text-body mt-2" style={{ color: 'var(--text-soft)' }}>
          {t('task.subtask.blocker.intro')}
        </p>

        {children == null ? (
          <p className="text-meta mt-4" style={{ color: 'var(--text-muted)' }}>
            {t('common.loading')}
          </p>
        ) : children.length === 0 ? (
          <p className="text-meta mt-4" style={{ color: 'var(--text-muted)' }}>
            {t('task.subtask.blocker.empty')}
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line-soft">
            {children.map((c) => (
              <li key={c.id} className="py-2 flex justify-between text-body">
                <span className="truncate">{c.title}</span>
                <span className="text-meta ml-3 shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {t(`task.status.${c.status}`)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {err ? (
          <p className="text-meta mt-3" style={{ color: 'var(--state-error)' }}>
            {err}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 mt-6">
          <button className="btn-outline" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            className="btn-primary"
            onClick={completeAll}
            disabled={busy || !children || children.length === 0}
          >
            {busy ? t('task.subtask.blocker.running') : t('task.subtask.blocker.complete_all')}
          </button>
        </div>
      </div>
    </div>
  );
}
