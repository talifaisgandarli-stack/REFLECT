import { Avatar } from './Avatar';
import { useTeamWorkload, type TeamWorkloadRow } from '@/lib/hooks';

/**
 * US-DASH-05: avatar + name + open task count; bar green 1–5 / amber 6–9 /
 * red 10+. Click filters Tapşırıqlar to that user via ?assignee=<id>.
 * Admin-only on the dashboard (parent gates).
 */
export function WorkloadWidget({ className }: { className?: string }) {
  const { data: rows = [], isLoading } = useTeamWorkload();

  return (
    <section className={`card ${className ?? ''}`}>
      <h3 className="text-h3 mb-3">Komanda yükü</h3>
      {isLoading ? (
        <div className="text-meta">Yüklənir…</div>
      ) : rows.length === 0 ? (
        <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Komanda hələ formalaşmayıb.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.slice(0, 8).map((r) => (
            <WorkloadRow key={r.user_id} row={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

function WorkloadRow({ row }: { row: TeamWorkloadRow }) {
  const tone = row.open_count >= 10 ? 'red' : row.open_count >= 6 ? 'amber' : 'green';
  const color =
    tone === 'red' ? '#B91C1C' : tone === 'amber' ? '#D97706' : 'var(--brand-text)';
  const pct = Math.min(100, (row.open_count / 12) * 100);

  return (
    <li>
      <a
        href={`/tapşırıqlar?assignee=${row.user_id}`}
        className="flex items-center gap-3 card-interactive rounded-card p-2 -m-2"
      >
        <Avatar name={row.full_name ?? row.user_id.slice(0, 4)} url={row.avatar_url} size={32} />
        <div className="flex-1 min-w-0">
          <div className="text-body truncate">{row.full_name ?? '—'}</div>
          <div
            className="mt-1 h-1.5 rounded-full overflow-hidden"
            style={{ background: 'var(--line-soft)' }}
          >
            <div
              className="h-full"
              style={{ width: `${pct}%`, background: color, transition: 'width 200ms' }}
            />
          </div>
        </div>
        <div
          className="text-body"
          style={{ fontVariantNumeric: 'tabular-nums', color, fontWeight: 600 }}
        >
          {row.open_count}
        </div>
      </a>
    </li>
  );
}
