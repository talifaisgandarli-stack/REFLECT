import { useMemo, useState } from 'react';
import { PageHead } from '@/components/PageHead';
import { useAuth } from '@/lib/store';
import { useActiveProfiles, useSalaries, useSetSalary } from '@/lib/hooks';
import { formatAZN, formatDate } from '@/lib/format';
import type { Profile, Salary } from '@/types/db';
import { EmptyState } from '@/components/EmptyState';

/**
 * REQ-Komanda 8.2 / US-SAL-01.
 * RLS allows admin OR auth.uid() = employee_id (decision 2026-05-08, §8.2 wins).
 * Non-admin queries automatically scope to their own rows; admin sees the full
 * ledger.
 */
export function SalaryPage() {
  const { isAdmin, profile } = useAuth();

  if (!isAdmin) return <SelfSalaryView selfId={profile?.id} />;
  return <AdminSalaryView />;
}

function SelfSalaryView({ selfId }: { selfId?: string }) {
  const { data: rows = [], isLoading } = useSalaries(selfId);

  const current = useMemo(
    () => rows.find((r) => isCurrent(r)) ?? rows[0] ?? null,
    [rows],
  );

  return (
    <>
      <PageHead meta="Yalnız sizin" title="Əmək Haqqı" />
      {isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : current == null ? (
        <EmptyState
          title="Maaş qeydi yoxdur"
          body="Admin maaş cədvəlini quranda burada görünəcək."
        />
      ) : (
        <>
          <div className="card mb-4">
            <div className="text-tiny uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Cari
            </div>
            <div className="text-h1 mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatAZN(current.amount)}{' '}
              <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
                {current.currency}
              </span>
            </div>
            <div className="text-meta mt-1" style={{ color: 'var(--text-muted)' }}>
              {formatDate(current.effective_from)} —{' '}
              {current.effective_to ? formatDate(current.effective_to) : 'davam edir'}
            </div>
          </div>
          <h3 className="text-h3 mb-2">Tarixçə</h3>
          <SalaryTable rows={rows} showEmployee={false} />
        </>
      )}
    </>
  );
}

function AdminSalaryView() {
  const { data: rows = [], isLoading } = useSalaries();
  const { data: people = [] } = useActiveProfiles();
  const [editing, setEditing] = useState(false);

  const peopleById = useMemo(
    () => new Map(people.map((p) => [p.id, p])),
    [people],
  );

  return (
    <>
      <PageHead
        meta={`${rows.length} qeyd`}
        title="Əmək Haqqı"
        actions={
          <button className="btn-primary" onClick={() => setEditing(true)}>
            + Maaş cədvəli
          </button>
        }
      />
      {isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Hələ maaş qeyd edilməyib"
          body="İlk işçinin maaşını qur — tarixçə avtomatik saxlanılır."
          cta={
            <button className="btn-primary" onClick={() => setEditing(true)}>
              + Maaş cədvəli
            </button>
          }
        />
      ) : (
        <AdminSalaryTable rows={rows} peopleById={peopleById} />
      )}

      {editing ? (
        <SalaryModal people={people} onClose={() => setEditing(false)} />
      ) : null}
    </>
  );
}

function AdminSalaryTable({
  rows,
  peopleById,
}: {
  rows: Salary[];
  peopleById: Map<string, Profile>;
}) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-body">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--line)' }}>
            {['İşçi', 'Məbləğ', 'Valyuta', 'Başlanğıc', 'Bitiş'].map((h) => (
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
          {rows.map((r) => {
            const p = peopleById.get(r.employee_id);
            return (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                <td className="py-3 px-3">
                  {p?.full_name ?? p?.email ?? r.employee_id.slice(0, 8)}
                </td>
                <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatAZN(r.amount)}
                </td>
                <td className="py-3 px-3">{r.currency}</td>
                <td className="py-3 px-3">{formatDate(r.effective_from)}</td>
                <td className="py-3 px-3">
                  {r.effective_to ? formatDate(r.effective_to) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SalaryModal({ people, onClose }: { people: Profile[]; onClose: () => void }) {
  const set = useSetSalary();
  const [employeeId, setEmployeeId] = useState<string>(people[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('AZN');
  const [effectiveFrom, setEffectiveFrom] = useState(nextMonthFirst());
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    setErr(null);
    const n = Number(amount);
    if (!employeeId) return setErr('İşçi seç.');
    if (!Number.isFinite(n) || n <= 0) return setErr('Məbləğ 0-dan böyük olmalıdır.');
    if (!effectiveFrom) return setErr('Başlanğıc tarix lazımdır.');
    set.mutate(
      { employee_id: employeeId, amount: n, currency, effective_from: effectiveFrom },
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
        <h2 className="text-h2 mb-1">+ Maaş cədvəli</h2>
        <p className="text-meta mb-4" style={{ color: 'var(--text-muted)' }}>
          Yeni qeyd əlavə olunacaq; əvvəlki qeydin bitiş tarixi avtomatik təyin edilir.
        </p>
        <Field label="İşçi">
          <select
            className="input w-full"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name ?? p.email}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Məbləğ">
          <input
            className="input w-full"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Valyuta">
          <input
            className="input w-full"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          />
        </Field>
        <Field label="Qüvvədə (başlanğıc)">
          <input
            className="input w-full"
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
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
          <button className="btn-primary" disabled={set.isPending} onClick={submit}>
            {set.isPending ? 'Yazılır…' : 'Yadda saxla'}
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

function nextMonthFirst(): string {
  const d = new Date();
  const y = d.getFullYear() + (d.getMonth() === 11 ? 1 : 0);
  const m = (d.getMonth() + 1) % 12;
  return `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

function SalaryTable({ rows, showEmployee }: { rows: Salary[]; showEmployee: boolean }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-body">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--line)' }}>
            {(showEmployee
              ? ['İşçi', 'Məbləğ', 'Valyuta', 'Başlanğıc', 'Bitiş']
              : ['Məbləğ', 'Valyuta', 'Başlanğıc', 'Bitiş']
            ).map((h) => (
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
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
              {showEmployee ? (
                <td className="py-3 px-3 font-mono text-meta">{r.employee_id.slice(0, 8)}</td>
              ) : null}
              <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatAZN(r.amount)}
              </td>
              <td className="py-3 px-3">{r.currency}</td>
              <td className="py-3 px-3">{formatDate(r.effective_from)}</td>
              <td className="py-3 px-3">
                {r.effective_to ? formatDate(r.effective_to) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function isCurrent(s: Salary): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (s.effective_from > today) return false;
  if (s.effective_to && s.effective_to < today) return false;
  return true;
}
