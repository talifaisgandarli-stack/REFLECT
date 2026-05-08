import { useMemo } from 'react';
import { PageHead } from '@/components/PageHead';
import { useAuth } from '@/lib/store';
import { useSalaries } from '@/lib/hooks';
import { formatAZN, formatDate } from '@/lib/format';
import type { Salary } from '@/types/db';
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
  return (
    <>
      <PageHead
        meta={`${rows.length} qeyd`}
        title="Əmək Haqqı"
        actions={<button className="btn-primary">+ Maaş cədvəli</button>}
      />
      {isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Hələ maaş qeyd edilməyib"
          body="İlk işçinin maaşını qur — tarixçə avtomatik saxlanılır."
        />
      ) : (
        <SalaryTable rows={rows} showEmployee />
      )}
    </>
  );
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
