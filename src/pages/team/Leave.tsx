/**
 * Leave requests — PRD §8.4.
 * Workflow: request → admin approve/deny → calendar event auto-created on approve.
 * RLS (migration 0017): user sees own; admin sees all + can update status.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/format';

type LeaveKind = 'annual' | 'sick' | 'unpaid' | 'other';
type LeaveStatus = 'pending' | 'approved' | 'denied' | 'cancelled';

const KIND_LABEL: Record<LeaveKind, string> = {
  annual: 'İllik',
  sick: 'Xəstəlik',
  unpaid: 'Ödənişsiz',
  other: 'Digər',
};

const STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: 'Gözləmədə',
  approved: 'Təsdiqlənib',
  denied: 'Rədd edilib',
  cancelled: 'Ləğv olunub',
};

const STATUS_COLOR: Record<LeaveStatus, string> = {
  pending: '#D97706',
  approved: 'var(--brand-text)',
  denied: '#B91C1C',
  cancelled: 'var(--text-muted)',
};

type LeaveRow = {
  id: string;
  employee_id: string;
  kind: LeaveKind;
  starts_at: string;
  ends_at: string;
  days: number;
  status: LeaveStatus;
  approver_id: string | null;
  note: string | null;
};

export function LeavePage() {
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);

  const requests = useQuery({
    queryKey: ['leave_requests'],
    queryFn: async () =>
      ((
        await supabase
          .from('leave_requests')
          .select('*')
          .order('starts_at', { ascending: false })
          .limit(200)
      ).data ?? []) as LeaveRow[],
  });

  return (
    <>
      <PageHead
        meta="Cari il"
        title="Məzuniyyət"
        actions={
          <button className="btn-primary" onClick={() => setOpen(true)}>
            + Müraciət
          </button>
        }
      />

      {(requests.data ?? []).length === 0 ? (
        <EmptyState
          title="Məzuniyyət müraciəti yoxdur"
          body="Yaxınlaşan istirahətinizi planlaşdırın."
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Növ', 'Başlama', 'Bitmə', 'Gün', 'Status', 'Qeyd', ''].map((h) => (
                  <th
                    key={h}
                    className="text-left py-3 px-3 text-meta"
                    style={{
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(requests.data ?? []).map((r) => (
                <LeaveRowItem key={r.id} row={r} canApprove={isAdmin} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open ? <LeaveRequestModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function LeaveRowItem({ row, canApprove }: { row: LeaveRow; canApprove: boolean }) {
  const qc = useQueryClient();
  const setStatus = useMutation({
    mutationFn: async (status: LeaveStatus) => {
      const { error } = await supabase
        .from('leave_requests')
        .update({ status })
        .eq('id', row.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave_requests'] }),
  });

  return (
    <tr style={{ borderBottom: '1px solid var(--line-soft)' }}>
      <td className="py-3 px-3">{KIND_LABEL[row.kind]}</td>
      <td className="py-3 px-3">{formatDate(row.starts_at)}</td>
      <td className="py-3 px-3">{formatDate(row.ends_at)}</td>
      <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {row.days}
      </td>
      <td className="py-3 px-3">
        <span style={{ color: STATUS_COLOR[row.status], fontWeight: 500 }}>
          {STATUS_LABEL[row.status]}
        </span>
      </td>
      <td className="py-3 px-3 text-meta" style={{ color: 'var(--text-muted)' }}>
        {row.note ?? ''}
      </td>
      <td className="py-3 px-3 text-right">
        {canApprove && row.status === 'pending' ? (
          <span className="flex gap-2 justify-end">
            <button
              className="chip chip-brand"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate('approved')}
            >
              Təsdiqlə
            </button>
            <button
              className="chip"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate('denied')}
            >
              Rədd et
            </button>
          </span>
        ) : null}
      </td>
    </tr>
  );
}

function LeaveRequestModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { session } = useAuth();
  const [kind, setKind] = useState<LeaveKind>('annual');
  const [startsAt, setStartsAt] = useState(new Date().toISOString().slice(0, 10));
  const [endsAt, setEndsAt] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');

  const days =
    Math.max(
      0,
      Math.round(
        (new Date(endsAt).getTime() - new Date(startsAt).getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    ) + 1;

  const submit = useMutation({
    mutationFn: async () => {
      if (!session?.userId) throw new Error('No session');
      const { error } = await supabase.from('leave_requests').insert({
        employee_id: session.userId,
        kind,
        starts_at: startsAt,
        ends_at: endsAt,
        days,
        note: note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave_requests'] });
      onClose();
    },
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
    >
      <div className="card max-w-md w-full space-y-3">
        <h3 className="text-h3">Məzuniyyət müraciəti</h3>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Növ
          </span>
          <select
            className="input mt-1 w-full"
            value={kind}
            onChange={(e) => setKind(e.target.value as LeaveKind)}
          >
            {(Object.keys(KIND_LABEL) as LeaveKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
              Başlama
            </span>
            <input
              type="date"
              className="input mt-1 w-full"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
              Bitmə
            </span>
            <input
              type="date"
              className="input mt-1 w-full"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </label>
        </div>
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
          {days} gün
        </p>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Qeyd (opsional)
          </span>
          <textarea
            className="input mt-1 w-full"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-outline" onClick={onClose}>
            Ləğv et
          </button>
          <button
            className="btn-primary"
            disabled={days <= 0 || submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? '…' : 'Göndər'}
          </button>
        </div>
      </div>
    </div>
  );
}
