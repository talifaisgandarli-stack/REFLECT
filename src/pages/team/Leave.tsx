import { useMemo, useState } from 'react';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/store';
import {
  useActiveProfiles,
  useCancelLeave,
  useCreateLeaveRequest,
  useDecideLeave,
  useLeaveRequests,
} from '@/lib/hooks';
import type { LeaveKind, LeaveRequest, LeaveStatus, Profile } from '@/types/db';
import { formatDate } from '@/lib/format';

const KIND_LABEL: Record<LeaveKind, string> = {
  annual: 'İllik',
  sick: 'Xəstəlik',
  unpaid: 'Ödənişsiz',
  parental: 'Valideyn',
  other: 'Digər',
};

const STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: 'Gözləmədə',
  approved: 'Təsdiqlənib',
  denied: 'Rədd',
  cancelled: 'Ləğv',
};

const STATUS_COLOR: Record<LeaveStatus, string> = {
  pending: '#D97706',
  approved: 'var(--brand-text)',
  denied: '#B91C1C',
  cancelled: 'var(--text-muted)',
};

export function LeavePage() {
  const { isAdmin, profile } = useAuth();
  const { data: rows = [], isLoading } = useLeaveRequests(
    isAdmin ? undefined : profile?.id,
  );
  const [creating, setCreating] = useState(false);

  const pending = useMemo(() => rows.filter((r) => r.status === 'pending'), [rows]);
  const decided = useMemo(() => rows.filter((r) => r.status !== 'pending'), [rows]);

  return (
    <>
      <PageHead
        meta={isAdmin ? `${pending.length} gözləmədə` : 'Cari il'}
        title="Məzuniyyət"
        actions={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            + Müraciət
          </button>
        }
      />

      {isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : rows.length === 0 ? (
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
        <div className="space-y-5">
          {pending.length > 0 ? (
            <Section title="Gözləmədə" rows={pending} isAdmin={isAdmin} selfId={profile?.id} />
          ) : null}
          {decided.length > 0 ? (
            <Section title="Tarixçə" rows={decided} isAdmin={isAdmin} selfId={profile?.id} />
          ) : null}
        </div>
      )}

      {creating ? <RequestModal onClose={() => setCreating(false)} /> : null}
    </>
  );
}

function Section({
  title,
  rows,
  isAdmin,
  selfId,
}: {
  title: string;
  rows: LeaveRequest[];
  isAdmin: boolean;
  selfId: string | undefined;
}) {
  const { data: people = [] } = useActiveProfiles();
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  return (
    <div>
      <h3 className="text-h3 mb-2">{title}</h3>
      <ul className="space-y-2">
        {rows.map((r) => (
          <LeaveRow
            key={r.id}
            row={r}
            person={peopleById.get(r.employee_id)}
            isAdmin={isAdmin}
            isSelf={r.employee_id === selfId}
          />
        ))}
      </ul>
    </div>
  );
}

function LeaveRow({
  row,
  person,
  isAdmin,
  isSelf,
}: {
  row: LeaveRequest;
  person: Profile | undefined;
  isAdmin: boolean;
  isSelf: boolean;
}) {
  const decide = useDecideLeave();
  const cancel = useCancelLeave();
  return (
    <li
      className="rounded-card p-3 flex flex-wrap items-center gap-3"
      style={{ border: '1px solid var(--line-soft)' }}
    >
      <div className="min-w-0 flex-1">
        <div className="text-body font-medium">
          {KIND_LABEL[row.kind]} · {formatDate(row.starts_at)} – {formatDate(row.ends_at)}
        </div>
        <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
          {person?.full_name ?? person?.email ?? row.employee_id.slice(0, 8)} ·{' '}
          {row.days} gün
          {row.note ? ` · ${row.note}` : ''}
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        <span
          className="chip"
          style={{ color: STATUS_COLOR[row.status], borderColor: 'var(--line)' }}
        >
          {STATUS_LABEL[row.status]}
        </span>
        {isAdmin && row.status === 'pending' ? (
          <>
            <button
              className="btn-outline"
              disabled={decide.isPending}
              onClick={() => decide.mutate({ id: row.id, decision: 'denied' })}
            >
              Rədd
            </button>
            <button
              className="btn-primary"
              disabled={decide.isPending}
              onClick={() => decide.mutate({ id: row.id, decision: 'approved' })}
            >
              Təsdiqlə
            </button>
          </>
        ) : null}
        {!isAdmin && isSelf && row.status === 'pending' ? (
          <button
            className="btn-outline"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(row.id)}
          >
            Geri çək
          </button>
        ) : null}
      </div>
    </li>
  );
}

function RequestModal({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const create = useCreateLeaveRequest();
  const [kind, setKind] = useState<LeaveKind>('annual');
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(today());
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const days = useMemo(() => businessDaysInclusive(start, end), [start, end]);

  function submit() {
    setErr(null);
    if (!profile?.id) return;
    if (!start || !end) return setErr('Tarix lazımdır.');
    if (end < start) return setErr('Bitiş tarixi başlanğıcdan əvvəl ola bilməz.');
    create.mutate(
      {
        employee_id: profile.id,
        kind,
        starts_at: start,
        ends_at: end,
        days,
        note: note.trim() || null,
      },
      { onSuccess: onClose, onError: (e) => setErr((e as Error).message) },
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(14,22,17,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-surface p-6 rounded-card w-[460px]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-h2 mb-4">+ Məzuniyyət müraciəti</h2>
        <Field label="Növ">
          <select
            className="input w-full"
            value={kind}
            onChange={(e) => setKind(e.target.value as LeaveKind)}
          >
            {(Object.keys(KIND_LABEL) as LeaveKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Başlanğıc">
            <input
              className="input w-full"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="Bitiş">
            <input
              className="input w-full"
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        </div>
        <p className="text-meta mb-3" style={{ color: 'var(--text-muted)' }}>
          Hesablanmış: <strong>{days}</strong> iş günü
        </p>
        <Field label="Qeyd">
          <textarea
            className="input w-full"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        {err ? (
          <div className="text-meta" style={{ color: 'var(--danger, #B91C1C)' }}>
            {err}
          </div>
        ) : null}
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-outline" onClick={onClose}>
            Ləğv et
          </button>
          <button
            className="btn-primary"
            disabled={create.isPending || days <= 0}
            onClick={submit}
          >
            {create.isPending ? 'Göndərilir…' : 'Göndər'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <div
        className="text-meta uppercase tracking-wider mb-1"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function businessDaysInclusive(startISO: string, endISO: string): number {
  if (!startISO || !endISO) return 0;
  const s = new Date(startISO);
  const e = new Date(endISO);
  if (e < s) return 0;
  let count = 0;
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count += 1;
  }
  return count;
}
