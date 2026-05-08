/**
 * REQ-TASK-04 — cancellation requires reason from a fixed list.
 * "Digər" requires free-text detail; everything else is preset.
 */
import { FormEvent, useState } from 'react';
import { Modal } from './Modal';
import { useCancelTask } from '@/lib/work';
import { ValidationError } from '@/lib/finance';
import { CANCEL_REASONS } from '@/lib/labels';

type Props = { taskId: string; onClose: () => void };

export function CancelTaskModal({ taskId, onClose }: Props) {
  const m = useCancelTask();
  const [reason, setReason] = useState<(typeof CANCEL_REASONS)[number]>('Müştəri imtina etdi');
  const [detail, setDetail] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    try {
      await m.mutateAsync({ id: taskId, reason, detail });
      onClose();
    } catch (e) {
      setErr(e instanceof ValidationError ? e.message : (e as Error).message);
    }
  }

  return (
    <Modal title="Tapşırığı ləğv et" onClose={onClose} width={460}>
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-body" style={{ color: 'var(--text-soft)' }}>
          Səbəbi seç. Bu məlumat statistikada saxlanılır və layihə retrosunda görünür.
        </p>

        <div className="space-y-2">
          {CANCEL_REASONS.map((r) => (
            <label key={r} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="reason"
                checked={reason === r}
                onChange={() => setReason(r)}
              />
              <span className="text-body">{r}</span>
            </label>
          ))}
        </div>

        {reason === 'Digər' ? (
          <label className="block">
            <span className="text-meta" style={{ color: 'var(--text-muted)' }}>İzahat *</span>
            <textarea
              required
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              className="input mt-1"
              style={{ height: 80, padding: 12 }}
            />
          </label>
        ) : null}

        {err ? <p className="text-meta" style={{ color: '#B91C1C' }}>{err}</p> : null}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-outline" onClick={onClose} disabled={m.isPending}>
            Geri
          </button>
          {/*
            designstyle4 §4.1: no "destructive" button variant; the action lives on
            .btn-primary and the destructiveness is communicated by red helper text
            inside the modal.
          */}
          <button type="submit" className="btn-primary" disabled={m.isPending}>
            {m.isPending ? 'Ləğv olunur…' : 'Təsdiq et'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
