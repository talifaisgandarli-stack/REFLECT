/**
 * Məzuniyyət (PRD §M8.4). Workflow:
 *   user submits → status='pending' →
 *   admin calls leave_decide(id, 'approved'|'denied') →
 *   on approval, calendar_events row auto-inserted by the RPC.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { formatDate } from '@/lib/format';

type LeaveKind = 'annual' | 'sick' | 'unpaid' | 'parental' | 'other';
type LeaveStatus = 'pending' | 'approved' | 'denied' | 'cancelled';

const KIND_LABEL: Record<LeaveKind, string> = {
  annual: 'İllik',
  sick: 'Xəstəlik',
  unpaid: 'Məvacibsiz',
  parental: 'Valideyn',
  other: 'Digər',
};

const STATUS_TONE: Record<LeaveStatus, { bg: string; text: string }> = {
  pending: { bg: '#FFF6E5', text: '#92400E' },
  approved: { bg: '#ECF9EF', text: '#15803D' },
  denied: { bg: '#FEEEED', text: '#B91C1C' },
  cancelled: { bg: '#F1F5F2', text: '#475569' },
};

const STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: 'Gözləmədə',
  approved: 'Təsdiq olundu',
  denied: 'Rədd edildi',
  cancelled: 'Ləğv edildi',
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
  decided_at: string | null;
  note: string | null;
  created_at: string;
};

export function LeavePage() {
  const { isAdmin, profile } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const requests = useQuery({
    queryKey: ['leave', isAdmin ? 'all' : profile?.id],
    queryFn: async (): Promise<LeaveRow[]> => {
      let q = supabase.from('leave_requests').select('*').order('starts_at', { ascending: false });
      if (!isAdmin && profile?.id) q = q.eq('employee_id', profile.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LeaveRow[];
    },
  });

  const decide = useMutation({
    mutationFn: async (input: { id: string; status: 'approved' | 'denied'; note?: string }) => {
      const { error } = await supabase.rpc('leave_decide', {
        p_id: input.id,
        p_status: input.status,
        p_note: input.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave'] }),
  });

  const cancelOwn = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('leave_requests')
        .update({ status: 'cancelled' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave'] }),
  });

  const empty = (requests.data ?? []).length === 0;

  return (
    <>
      <PageHead
        meta={isAdmin ? 'Bütün heyət' : 'Yalnız sizin müraciətlər'}
        title="Məzuniyyət"
        actions={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            + Müraciət
          </button>
        }
      />

      {empty ? (
        <EmptyState
          title="Açıq məzuniyyət müraciəti yoxdur"
          body="Yaxınlaşan istirahət — burada planlaşdır."
          cta={
            <button className="btn-primary" onClick={() => setCreating(true)}>
              + Müraciət
            </button>
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {[
                  ...(isAdmin ? ['İşçi'] : []),
                  'Növü',
                  'Başlama',
                  'Bitiş',
                  'Gün',
                  'Status',
                  '',
                ].map((h, i) => (
                  <th
                    key={`${h}-${i}`}
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
              {(requests.data ?? []).map((r) => {
                const tone = STATUS_TONE[r.status];
                const isOwn = r.employee_id === profile?.id;
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    {isAdmin ? (
                      <td className="py-3 px-3 text-meta" style={{ color: 'var(--text-muted)' }}>
                        {r.employee_id.slice(0, 8)}
                      </td>
                    ) : null}
                    <td className="py-3 px-3">{KIND_LABEL[r.kind]}</td>
                    <td className="py-3 px-3">{formatDate(r.starts_at)}</td>
                    <td className="py-3 px-3">{formatDate(r.ends_at)}</td>
                    <td
                      className="py-3 px-3"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {r.days}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className="chip"
                        style={{ background: tone.bg, color: tone.text }}
                      >
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      {isAdmin && r.status === 'pending' ? (
                        <span className="flex gap-1 justify-end">
                          <button
                            type="button"
                            className="chip chip-brand"
                            onClick={() => decide.mutate({ id: r.id, status: 'approved' })}
                          >
                            Təsdiqlə
                          </button>
                          <button
                            type="button"
                            className="chip"
                            style={{ background: '#FEEEED', color: '#B91C1C' }}
                            onClick={() => decide.mutate({ id: r.id, status: 'denied' })}
                          >
                            Rədd
                          </button>
                        </span>
                      ) : isOwn && r.status === 'pending' ? (
                        <button
                          type="button"
                          className="text-meta hover:underline"
                          style={{ color: 'var(--text-muted)' }}
                          onClick={() => cancelOwn.mutate(r.id)}
                        >
                          Ləğv et
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating ? (
        <LeaveRequestModal
          onClose={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ['leave'] });
          }}
        />
      ) : null}

      {decide.error ? (
        <p className="text-meta mt-3" style={{ color: '#B91C1C' }}>
          {(decide.error as Error).message}
        </p>
      ) : null}
    </>
  );
}

function LeaveRequestModal({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const [kind, setKind] = useState<LeaveKind>('annual');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error('Profil hazır deyil');
      if (!from || !to) throw new Error('Tarixləri doldurun');
      if (new Date(to) < new Date(from)) throw new Error('Bitiş başlanğıcdan əvvəl ola bilməz');
      const { error } = await supabase.from('leave_requests').insert({
        employee_id: profile.id,
        kind,
        starts_at: from,
        ends_at: to,
        note: note || null,
      });
      if (error) throw error;
    },
    onSuccess: onClose,
  });

  return (
    <div
      role="dialog"
      aria-label="Yeni məzuniyyət müraciəti"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
        className="card w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        style={{ padding: 24 }}
      >
        <h2 className="text-h2">+ Məzuniyyət müraciəti</h2>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Növü
            </span>
            <select
              className="input"
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
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Başlama
              </span>
              <input
                type="date"
                className="input"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Bitiş
              </span>
              <input
                type="date"
                className="input"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                min={from}
                required
              />
            </label>
          </div>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Qeyd
            </span>
            <textarea
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ minHeight: 72, padding: '12px 14px' }}
            />
          </label>
        </div>

        {save.error ? (
          <p className="text-meta mt-3" style={{ color: '#B91C1C' }}>
            {(save.error as Error).message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn-outline" onClick={onClose} disabled={save.isPending}>
            Geri
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={save.isPending || !from || !to}
          >
            {save.isPending ? 'Göndərilir…' : 'Müraciət et'}
          </button>
        </div>
      </form>
    </div>
  );
}
