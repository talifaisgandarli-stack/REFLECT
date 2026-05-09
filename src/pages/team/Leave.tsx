/**
 * Məzuniyyət — PRD §8.4 / Module 8.4
 * leave_requests (id, employee_id, kind, starts_at, ends_at, days, status, approver_id, note)
 * Workflow: request → admin approve/deny → calendar event auto-created on approve (DB trigger).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import type { LeaveKind, LeaveRequest, LeaveStatus, Profile } from '@/types/db';

type LeaveRow = LeaveRequest & { employee?: Pick<Profile, 'id' | 'full_name' | 'email'> };

const KIND_LABEL: Record<LeaveKind, string> = {
  annual: 'İllik',
  sick: 'Xəstəlik',
  unpaid: 'Ödənişsiz',
  parental: 'Analıq / Atalıq',
  other: 'Digər',
};

const STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: 'Gözlənilir',
  approved: 'Təsdiqləndi',
  denied: 'Rədd edildi',
};

const STATUS_COLOR: Record<LeaveStatus, string> = {
  pending: 'var(--text-muted)',
  approved: 'var(--brand-action)',
  denied: '#B91C1C',
};

export function LeavePage() {
  const { isAdmin, profile } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const requests = useQuery({
    queryKey: ['leave-requests', isAdmin],
    queryFn: async (): Promise<LeaveRow[]> => {
      if (isAdmin) {
        const { data, error } = await supabase
          .from('leave_requests')
          .select('*, employee:profiles(id, full_name, email)')
          .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []) as LeaveRow[];
      }
      const { data, error } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('employee_id', profile!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as LeaveRow[];
    },
    enabled: !!profile?.id,
  });

  const decide = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'approved' | 'denied' }) => {
      const { error } = await supabase
        .from('leave_requests')
        .update({ status, approver_id: profile!.id })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave-requests'] }),
  });

  const pending = (requests.data ?? []).filter((r) => r.status === 'pending');
  const others = (requests.data ?? []).filter((r) => r.status !== 'pending');

  return (
    <>
      <PageHead
        meta="Cari il"
        title="Məzuniyyət"
        actions={<button className="btn-primary" onClick={() => setShowForm(true)}>+ Müraciət</button>}
      />

      {requests.isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : (requests.data ?? []).length === 0 ? (
        <EmptyState
          title="Açıq məzuniyyət müraciəti yoxdur"
          body="Yaxınlaşan istirahət — burada planlaşdır."
          cta={<button className="btn-primary" onClick={() => setShowForm(true)}>+ Müraciət</button>}
        />
      ) : (
        <div className="space-y-6">
          {isAdmin && pending.length > 0 && (
            <section>
              <h3 className="text-h3 mb-3">Gözləyən müraciətlər ({pending.length})</h3>
              <div className="space-y-2">
                {pending.map((r) => (
                  <LeaveCard
                    key={r.id}
                    request={r}
                    isAdmin={isAdmin}
                    onApprove={() => decide.mutate({ id: r.id, status: 'approved' })}
                    onDeny={() => decide.mutate({ id: r.id, status: 'denied' })}
                    deciding={decide.isPending}
                  />
                ))}
              </div>
            </section>
          )}
          {!isAdmin && pending.length > 0 && (
            <section>
              <h3 className="text-h3 mb-3">Gözlənilən</h3>
              <div className="space-y-2">
                {pending.map((r) => (
                  <LeaveCard key={r.id} request={r} isAdmin={false} deciding={false} />
                ))}
              </div>
            </section>
          )}
          {others.length > 0 && (
            <section>
              <h3 className="text-h3 mb-3">Tarixçə</h3>
              <div className="space-y-2">
                {others.map((r) => (
                  <LeaveCard key={r.id} request={r} isAdmin={false} deciding={false} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {showForm && (
        <RequestLeaveModal
          employeeId={profile!.id}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['leave-requests'] });
            setShowForm(false);
          }}
        />
      )}
    </>
  );
}

type CardProps = {
  request: LeaveRow;
  isAdmin: boolean;
  onApprove?: () => void;
  onDeny?: () => void;
  deciding: boolean;
};

function LeaveCard({ request: r, isAdmin, onApprove, onDeny, deciding }: CardProps) {
  return (
    <div className="card flex items-start justify-between gap-4" style={{ padding: 14 }}>
      <div className="flex-1 min-w-0">
        {isAdmin && r.employee && (
          <div className="font-medium text-body">
            {r.employee.full_name ?? r.employee.email}
          </div>
        )}
        <div className="text-body">
          {KIND_LABEL[r.kind]} · {r.starts_at} → {r.ends_at}
          <span className="text-meta ml-2" style={{ color: 'var(--text-muted)' }}>
            ({r.days} gün)
          </span>
        </div>
        {r.note && (
          <div className="text-meta mt-1" style={{ color: 'var(--text-muted)' }}>
            {r.note}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-2 flex-shrink-0">
        <span className="chip text-meta" style={{ color: STATUS_COLOR[r.status] }}>
          {STATUS_LABEL[r.status]}
        </span>
        {isAdmin && r.status === 'pending' && (
          <div className="flex gap-1">
            <button
              className="btn-primary text-meta"
              style={{ padding: '2px 10px' }}
              onClick={onApprove}
              disabled={deciding}
            >
              Təsdiqlə
            </button>
            <button
              className="btn-outline text-meta"
              style={{ padding: '2px 10px', color: '#B91C1C' }}
              onClick={onDeny}
              disabled={deciding}
            >
              Rədd
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RequestLeaveModal({ employeeId, onClose, onSaved }: {
  employeeId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<LeaveKind>('annual');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [note, setNote] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      if (!startsAt || !endsAt) throw new Error('Tarixlər tələb olunur');
      if (endsAt < startsAt) throw new Error('Bitmə tarixi başlama tarixindən əvvəl ola bilməz');
      const { error } = await supabase.from('leave_requests').insert({
        employee_id: employeeId,
        kind,
        starts_at: startsAt,
        ends_at: endsAt,
        note: note.trim() || null,
        status: 'pending',
      });
      if (error) throw error;
    },
    onSuccess: onSaved,
  });

  const days = startsAt && endsAt && endsAt >= startsAt
    ? Math.floor((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 86400000) + 1
    : null;

  return (
    <div
      role="dialog"
      aria-label="Məzuniyyət müraciəti"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
        className="card w-full max-w-md"
        style={{ padding: 24 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
      >
        <h2 className="text-h2 mb-4">Məzuniyyət müraciəti</h2>
        <div className="space-y-3">
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Növ</span>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as LeaveKind)}>
              {(Object.entries(KIND_LABEL) as [LeaveKind, string][]).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Başlama *</span>
              <input type="date" className="input" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Bitmə *</span>
              <input type="date" className="input" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} min={startsAt || undefined} required />
            </label>
          </div>
          {days != null && (
            <div className="text-meta px-3 py-2 rounded-btn" style={{ background: 'var(--brand-mist)', color: 'var(--brand-text)' }}>
              {days} iş günü
            </div>
          )}
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Qeyd (könüllü)</span>
            <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 64 }} />
          </label>
        </div>

        {save.error ? <p className="text-meta mt-3" style={{ color: '#B91C1C' }}>{(save.error as Error).message}</p> : null}

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn-outline" onClick={onClose} disabled={save.isPending}>Geri</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Göndərilir…' : 'Müraciət et'}
          </button>
        </div>
      </form>
    </div>
  );
}
