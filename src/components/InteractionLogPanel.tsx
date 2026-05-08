/**
 * REQ-CRM-03 — quick interaction log (≤30s).
 * Type chips + free-text + date; defaults to "today, now". Lives inside the
 * Müştərilər drawer (REQ-CRM-05 — slide-in detail panel).
 */
import { FormEvent, useState } from 'react';
import {
  INTERACTION_LABEL,
  InteractionType,
  useInteractions,
  useLogInteraction,
} from '@/lib/crm';
import { formatDate, relativeTime } from '@/lib/format';
import { ValidationError } from '@/lib/finance';

type Interaction = {
  id: string;
  type: InteractionType;
  note: string | null;
  occurred_at: string;
};

const TYPES: InteractionType[] = ['call', 'email', 'meeting', 'whatsapp', 'other'];

export function InteractionLogPanel({ clientId }: { clientId: string }) {
  const list = useInteractions(clientId);
  const log = useLogInteraction();

  const [type, setType] = useState<InteractionType>('call');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await log.mutateAsync({
        client_id: clientId,
        type,
        note: note.trim() || null,
        occurred_at: new Date(date + 'T' + new Date().toISOString().slice(11, 19) + 'Z').toISOString(),
      });
      setNote('');
    } catch (e) {
      setErr(e instanceof ValidationError ? e.message : (e as Error).message);
    }
  }

  return (
    <div>
      <h3 className="text-h3 mb-2">Əlaqə tarixçəsi</h3>

      <form onSubmit={onSubmit} className="card mb-3" style={{ padding: 12 }}>
        <div className="flex flex-wrap gap-1 mb-2">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={`chip ${type === t ? 'chip-brand' : ''}`}
              onClick={() => setType(t)}
            >
              {INTERACTION_LABEL[t]}
            </button>
          ))}
        </div>
        <textarea
          className="input"
          style={{ height: 60, padding: 10 }}
          placeholder="Qeyd…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex gap-2 items-center mt-2">
          <input
            type="date"
            className="input"
            style={{ width: 160 }}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button type="submit" className="btn-primary ml-auto" disabled={log.isPending}>
            {log.isPending ? 'Saxlanılır…' : 'Əlavə et'}
          </button>
        </div>
        {err ? <p className="text-meta mt-2" style={{ color: '#B91C1C' }}>{err}</p> : null}
      </form>

      {(list.data ?? []).length === 0 ? (
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>Əlaqə qeydi yoxdur.</p>
      ) : (
        <ul className="space-y-2">
          {((list.data ?? []) as Interaction[]).map((i) => (
            <li
              key={i.id}
              className="rounded-card p-3"
              style={{ border: '1px solid var(--line-soft)', background: 'var(--surface)' }}
            >
              <div className="flex justify-between items-baseline">
                <span className="text-ui font-medium">{INTERACTION_LABEL[i.type]}</span>
                <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
                  {formatDate(i.occurred_at)} · {relativeTime(i.occurred_at)}
                </span>
              </div>
              {i.note ? (
                <p className="text-body mt-1" style={{ color: 'var(--text-soft)' }}>{i.note}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
