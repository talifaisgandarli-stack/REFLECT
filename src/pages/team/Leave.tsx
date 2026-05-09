/**
 * §8.4 Məzuniyyət — request → admin approve/deny.
 * leave_requests table (migration 0010).
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/store';
import { useDecideLeave, useLeaveRequests } from '@/lib/hooks';
import { formatDate } from '@/lib/format';

const KIND_LABEL: Record<string, string> = {
  annual: 'İllik',
  sick: 'Xəstəlik',
  unpaid: 'Ödənişsiz',
  other: 'Digər',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'Gözləyir',
  approved: 'Təsdiqləndi',
  denied: 'Rədd',
  cancelled: 'Ləğv',
};
const STATUS_COLOR: Record<string, string> = {
  pending: '#D97706',
  approved: '#22C55E',
  denied: '#EF4444',
  cancelled: 'var(--text-muted)',
};

type Leave = {
  id: string;
  employee_id: string;
  kind: 'annual' | 'sick' | 'unpaid' | 'other';
  starts_at: string;
  ends_at: string;
  days: number;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  approver_id: string | null;
  note: string | null;
};

function daysBetween(s: string, e: string) {
  const a = new Date(s).getTime();
  const b = new Date(e).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

export function LeavePage() {
  const { isAdmin, profile } = useAuth();
  const list = useLeaveRequests();
  const decide = useDecideLeave();
  const [showForm, setShowForm] = useState(false);

  const items = (list.data ?? []) as Leave[];

  return (
    <>
      <PageHead
        meta="Cari il"
        title="Məzuniyyət"
        actions={
          <button className="btn-primary" onClick={() => setShowForm((p) => !p)}>
            + Müraciət
          </button>
        }
      />
      {showForm ? <RequestForm onDone={() => setShowForm(false)} /> : null}
      {items.length === 0 ? (
        <EmptyState title="Açıq məzuniyyət müraciəti yoxdur" body="Yaxınlaşan istirahət — burada planlaşdır." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['İşçi', 'Növ', 'Tarix', 'Gün', 'Status', 'Qeyd', ''].map((h) => (
                  <th
                    key={h}
                    className="text-left py-3 px-3 text-meta"
                    style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  <td className="py-3 px-3">
                    {l.employee_id === profile?.id ? 'Mən' : l.employee_id.slice(0, 8)}
                  </td>
                  <td className="py-3 px-3">{KIND_LABEL[l.kind] ?? l.kind}</td>
                  <td className="py-3 px-3">
                    {formatDate(l.starts_at)} → {formatDate(l.ends_at)}
                  </td>
                  <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {l.days}
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className="chip"
                      style={{ color: STATUS_COLOR[l.status], borderColor: STATUS_COLOR[l.status] }}
                    >
                      {STATUS_LABEL[l.status]}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-meta" style={{ color: 'var(--text-muted)' }}>
                    {l.note ?? '—'}
                  </td>
                  <td className="py-3 px-3 text-right">
                    {isAdmin && l.status === 'pending' && profile?.id ? (
                      <div className="flex gap-1 justify-end">
                        <button
                          className="chip chip-brand"
                          onClick={() =>
                            decide.mutate({ id: l.id, status: 'approved', approverId: profile.id })
                          }
                        >
                          Təsdiq
                        </button>
                        <button
                          className="chip"
                          style={{ color: 'var(--danger, #c33)' }}
                          onClick={() =>
                            decide.mutate({ id: l.id, status: 'denied', approverId: profile.id })
                          }
                        >
                          Rədd
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function RequestForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [kind, setKind] = useState<Leave['kind']>('annual');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      if (!start || !end) throw new Error('Başlanğıc və bitmə tarixləri tələb olunur');
      if (new Date(end) < new Date(start)) throw new Error('Bitmə tarixi başlanğıcdan sonra olmalıdır');
      const days = daysBetween(start, end);
      const { error: e } = await supabase.from('leave_requests').insert({
        employee_id: profile?.id,
        kind,
        starts_at: start,
        ends_at: end,
        days,
        note: note.trim() || null,
        status: 'pending',
      });
      if (e) throw e;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-requests'] });
      onDone();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <form
      className="card mb-4 grid grid-cols-1 md:grid-cols-4 gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <select className="input" value={kind} onChange={(e) => setKind(e.target.value as Leave['kind'])}>
        <option value="annual">İllik</option>
        <option value="sick">Xəstəlik</option>
        <option value="unpaid">Ödənişsiz</option>
        <option value="other">Digər</option>
      </select>
      <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      <input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
      <input
        className="input"
        placeholder="Qeyd"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {error ? (
        <div className="md:col-span-4 text-meta" style={{ color: 'var(--danger, #c33)' }}>
          {error}
        </div>
      ) : null}
      <div className="md:col-span-4 flex gap-2">
        <button type="submit" className="btn-primary" disabled={create.isPending}>
          Müraciət et
        </button>
        <button type="button" className="btn-outline" onClick={onDone}>
          Ləğv
        </button>
      </div>
    </form>
  );
}
