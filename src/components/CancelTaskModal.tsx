/**
 * REQ-TASK-04 — task cancellation requires a reason from a fixed list
 * (with "Digər" → free-text). The DB also enforces this in
 * tasks_cancel_reason_required (0006).
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { CANCEL_REASONS } from '@/lib/labels';
import { useT } from '@/lib/i18n';

type Props = {
  taskId: string;
  taskTitle?: string;
  onCancel: () => void;
  onCancelled: () => void;
};

export function CancelTaskModal({ taskId, taskTitle, onCancel, onCancelled }: Props) {
  const qc = useQueryClient();
  const t = useT();
  const [picked, setPicked] = useState<(typeof CANCEL_REASONS)[number] | null>(null);
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reason =
    picked === 'Digər' ? other.trim() : picked ?? '';
  const canSubmit = reason.length > 0 && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'cancelled', cancel_reason: reason })
      .eq('id', taskId);
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ['tasks'] });
    qc.invalidateQueries({ queryKey: ['done-list'] });
    qc.invalidateQueries({ queryKey: ['archive', 'tasks'] });
    onCancelled();
  }

  return (
    <div
      role="dialog"
      aria-label={t('task.cancel.title')}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onCancel}
    >
      <div
        className="card w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        style={{ padding: 24 }}
      >
        <h2 className="text-h2">{t('task.cancel.title')}</h2>
        {taskTitle ? (
          <p className="text-body mt-1" style={{ color: 'var(--text-soft)' }}>
            {taskTitle}
          </p>
        ) : null}
        <p className="text-meta mt-2" style={{ color: 'var(--text-muted)' }}>
          Səbəb arxivdə qalacaq və hesabatda görünəcək.
        </p>

        <fieldset className="mt-4 space-y-2">
          <legend className="sr-only">Ləğv səbəbi</legend>
          {CANCEL_REASONS.map((r) => (
            <label
              key={r}
              className="flex items-center gap-3 p-3 rounded-btn cursor-pointer"
              style={{
                border: `1px solid ${picked === r ? 'var(--brand-text)' : 'var(--line)'}`,
                background: picked === r ? 'var(--brand-mist)' : 'var(--surface)',
              }}
            >
              <input
                type="radio"
                name="cancel-reason"
                value={r}
                checked={picked === r}
                onChange={() => setPicked(r)}
                className="accent-current"
              />
              <span className="text-body">{r}</span>
            </label>
          ))}
        </fieldset>

        {picked === 'Digər' ? (
          <textarea
            className="input mt-3"
            placeholder="Səbəbi qısa yaz…"
            value={other}
            onChange={(e) => setOther(e.target.value)}
            style={{ minHeight: 88, padding: '12px 14px' }}
            autoFocus
          />
        ) : null}

        {err ? (
          <p className="text-meta mt-3" style={{ color: '#B91C1C' }}>
            {err}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 mt-6">
          <button className="btn-outline" onClick={onCancel} disabled={busy}>
            {t('common.back')}
          </button>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={!canSubmit}
            aria-disabled={!canSubmit}
          >
            {busy ? t('task.cancel.saving') : t('task.cancel.cta')}
          </button>
        </div>
      </div>
    </div>
  );
}
