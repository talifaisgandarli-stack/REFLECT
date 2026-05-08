/**
 * REQ-TASK-01 — quick create (title only). Inline form, no modal.
 * Defaults: status='queued', no assignees, no project. User can promote to
 * the full modal afterwards.
 */
import { FormEvent, useState } from 'react';
import { useCreateTask } from '@/lib/work';
import { ValidationError } from '@/lib/finance';

type Props = { defaultProjectId?: string; onCreated?: () => void };

export function TaskQuickCreate({ defaultProjectId, onCreated }: Props) {
  const m = useCreateTask();
  const [title, setTitle] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) return;
    setErr(null);
    try {
      await m.mutateAsync({
        title,
        project_id: defaultProjectId ?? null,
      });
      setTitle('');
      onCreated?.();
    } catch (e) {
      setErr(e instanceof ValidationError ? e.message : (e as Error).message);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2 items-start">
      <input
        type="text"
        className="input"
        placeholder="+ Tez tapşırıq…  (yalnız başlıq)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <button type="submit" className="btn-primary" disabled={m.isPending || !title.trim()}>
        Əlavə et
      </button>
      {err ? <p className="text-meta self-center" style={{ color: '#B91C1C' }}>{err}</p> : null}
    </form>
  );
}
