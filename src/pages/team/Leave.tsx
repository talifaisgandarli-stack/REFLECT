/**
 * PRD §8.4 — US-LEAVE-01/02
 * leave_requests (id, employee_id, kind, starts_at, ends_at, days, status, approver_id, note)
 * User requests leave; admin approves/denies → calendar_events row auto-created on approve.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { Avatar } from '@/components/Avatar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { relativeTime } from '@/lib/format';

type LeaveStatus = 'pending' | 'approved' | 'denied';

type LeaveRequest = {
  id: string;
  employee_id: string;
  kind: string;
  starts_at: string;
  ends_at: string;
  days: number;
  status: LeaveStatus;
  approver_id: string | null;
  note: string | null;
  created_at: string;
  profiles?: { full_name: string | null; avatar_url: string | null } | null;
};

const LEAVE_KINDS = ['Məzuniyyət', 'Xəstəlik', 'Ailə məsələsi', 'Şəxsi', 'Digər'];

const STATUS_COLOR: Record<LeaveStatus, string> = {
  pending: 'var(--warning)',
  approved: 'var(--success)',
  denied: 'var(--error)',
};

const STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: 'Gözləyir',
  approved: 'Təsdiqləndi',
  denied: 'Rədd edildi',
};

export function LeavePage() {
  const { profile, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['leave_requests', isAdmin ? 'all' : profile?.id],
    queryFn: async () => {
      let q = supabase
        .from('leave_requests')
        .select('*, profiles(full_name, avatar_url)')
        .order('created_at', { ascending: false });
      if (!isAdmin) q = q.eq('employee_id', profile!.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LeaveRequest[];
    },
    enabled: !!profile,
  });

  const approve = useMutation({
    mutationFn: async ({
      id, employeeId, kind, startsAt, endsAt,
    }: { id: string; employeeId: string; kind: string; startsAt: string; endsAt: string }) => {
      const { error } = await supabase
        .from('leave_requests')
        .update({ status: 'approved', approver_id: profile?.id })
        .eq('id', id);
      if (error) throw error;
      await supabase.from('calendar_events').insert({
        title: `Məzuniyyət — ${kind}`,
        starts_at: startsAt,
        ends_at: endsAt,
        all_day: true,
        organizer_id: profile?.id,
        attendees: [employeeId],
      });
      await supabase.from('notifications').insert({
        user_id: employeeId,
        kind: 'leave_approved',
        payload: { kind, starts_at: startsAt },
        dispatched_channels: {},
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave_requests'] }),
  });

  const deny = useMutation({
    mutationFn: async ({ id, employeeId }: { id: string; employeeId: string }) => {
      const { error } = await supabase
        .from('leave_requests')
        .update({ status: 'denied', approver_id: profile?.id })
        .eq('id', id);
      if (error) throw error;
      await supabase.from('notifications').insert({
        user_id: employeeId,
        kind: 'leave_denied',
        payload: {},
        dispatched_channels: {},
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave_requests'] }),
  });

  const pending = requests.filter((r) => r.status === 'pending');
  const past = requests.filter((r) => r.status !== 'pending');

  return (
    <>
      <PageHead
        meta="Cari il"
        title="Məzuniyyət"
        actions={
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + Müraciət
          </button>
        }
      />

      {isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : requests.length === 0 ? (
        <div className="card">
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Açıq məzuniyyət müraciəti yoxdur. "+ Müraciət" düyməsinə basın.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {pending.length > 0 ? (
            <section>
              <h3 className="text-h3 mb-3">Gözləyən müraciətlər</h3>
              <div className="space-y-3">
                {pending.map((r) => (
                  <LeaveCard
                    key={r.id}
                    request={r}
                    showEmployee={!!isAdmin}
                    onApprove={
                      isAdmin
                        ? () =>
                            approve.mutate({
                              id: r.id,
                              employeeId: r.employee_id,
                              kind: r.kind,
                              startsAt: r.starts_at,
                              endsAt: r.ends_at,
                            })
                        : undefined
                    }
                    onDeny={
                      isAdmin
                        ? () => deny.mutate({ id: r.id, employeeId: r.employee_id })
                        : undefined
                    }
                    isActing={approve.isPending || deny.isPending}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {past.length > 0 ? (
            <section>
              <h3 className="text-h3 mb-3">Keçmiş müraciətlər</h3>
              <div className="space-y-3">
                {past.map((r) => (
                  <LeaveCard key={r.id} request={r} showEmployee={!!isAdmin} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      {showForm ? (
        <LeaveRequestForm
          onClose={() => setShowForm(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['leave_requests'] });
            setShowForm(false);
          }}
        />
      ) : null}
    </>
  );
}

function LeaveCard({
  request: r,
  showEmployee,
  onApprove,
  onDeny,
  isActing,
}: {
  request: LeaveRequest;
  showEmployee: boolean;
  onApprove?: () => void;
  onDeny?: () => void;
  isActing?: boolean;
}) {
  return (
    <div className="card flex items-start gap-4">
      {showEmployee && r.profiles ? (
        <Avatar name={r.profiles.full_name ?? 'İşçi'} size={36} />
      ) : null}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {showEmployee && r.profiles ? (
            <span className="text-body font-medium">{r.profiles.full_name ?? 'İşçi'}</span>
          ) : null}
          <span className="chip text-meta" style={{ padding: '2px 8px' }}>{r.kind}</span>
          <span
            className="chip text-meta"
            style={{ padding: '2px 8px', color: STATUS_COLOR[r.status] }}
          >
            {STATUS_LABEL[r.status]}
          </span>
        </div>
        <div className="text-meta mt-1" style={{ color: 'var(--text-muted)' }}>
          {new Date(r.starts_at).toLocaleDateString('az-AZ')} –{' '}
          {new Date(r.ends_at).toLocaleDateString('az-AZ')} · {r.days} gün
        </div>
        {r.note ? <p className="text-meta mt-1">{r.note}</p> : null}
        <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
          {relativeTime(r.created_at)}
        </div>
      </div>
      {onApprove && onDeny ? (
        <div className="flex gap-2 shrink-0">
          <button
            className="btn-primary"
            style={{ padding: '4px 12px', fontSize: 13 }}
            disabled={isActing}
            onClick={onApprove}
          >
            Təsdiqlə
          </button>
          <button
            className="btn-outline"
            style={{ padding: '4px 12px', fontSize: 13 }}
            disabled={isActing}
            onClick={onDeny}
          >
            Rədd et
          </button>
        </div>
      ) : null}
    </div>
  );
}

function LeaveRequestForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [kind, setKind] = useState(LEAVE_KINDS[0]);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [note, setNote] = useState('');

  const days =
    startsAt && endsAt
      ? Math.max(
          1,
          Math.round(
            (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 86400000,
          ) + 1,
        )
      : 0;

  const save = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Sessiya yoxdur');
      if (!startsAt || !endsAt) throw new Error('Tarixi doldurun');
      const { error } = await supabase.from('leave_requests').insert({
        employee_id: profile.id,
        kind,
        starts_at: startsAt,
        ends_at: endsAt,
        days,
        status: 'pending',
        note: note.trim() || null,
      });
      if (error) throw error;
      const { data: roleRows } = await supabase
        .from('roles')
        .select('id')
        .eq('is_admin', true);
      const adminRoleIds = (roleRows ?? []).map((r: { id: string }) => r.id);
      if (adminRoleIds.length > 0) {
        const { data: admins } = await supabase
          .from('profiles')
          .select('id')
          .in('role_id', adminRoleIds);
        for (const admin of admins ?? []) {
          await supabase.from('notifications').insert({
            user_id: admin.id,
            kind: 'leave_request',
            payload: { employee_id: profile.id, kind, starts_at: startsAt },
            dispatched_channels: {},
          });
        }
      }
    },
    onSuccess: onSaved,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(14,22,17,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-surface p-6 rounded-card w-[440px]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-h2 mb-4">Məzuniyyət müraciəti</h2>

        <label className="block mb-3">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Növ</span>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {LEAVE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Başlanğıc</span>
            <input
              type="date" className="input"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Son</span>
            <input
              type="date" className="input"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </label>
        </div>

        {days > 0 ? (
          <p className="text-meta mb-3" style={{ color: 'var(--text-muted)' }}>{days} gün</p>
        ) : null}

        <label className="block mb-4">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Qeyd</span>
          <textarea
            className="input" rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        {save.error ? (
          <p className="text-meta mb-3" style={{ color: 'var(--error-deep)' }}>
            {(save.error as Error).message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button className="btn-outline" onClick={onClose}>Ləğv et</button>
          <button
            className="btn-primary"
            disabled={save.isPending || !startsAt || !endsAt}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Göndərilir…' : 'Göndər'}
          </button>
        </div>
      </div>
    </div>
  );
}
