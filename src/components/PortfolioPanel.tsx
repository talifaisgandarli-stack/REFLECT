/**
 * REQ-PROJ-05 / US-PROJ-04 — portfolio + awards submission.
 * Lists system_awards, supports filter by deadline_month, per-award checklist
 * stored in portfolio_workflows.applications, and a "X gün qaldı" indicator.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_AWARD_CHECKLIST,
  usePortfolio,
  useSystemAwards,
  useUpdatePortfolio,
} from '@/lib/hooks';
import type {
  PortfolioApplicationItem,
  PortfolioApplications,
  SystemAward,
} from '@/types/db';

const MONTHS_AZ = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'İyun',
  'İyul',
  'Avqust',
  'Sentyabr',
  'Oktyabr',
  'Noyabr',
  'Dekabr',
];

export function PortfolioPanel({
  projectId,
  isAdmin,
  status,
}: {
  projectId: string;
  isAdmin: boolean;
  status: string;
}) {
  const { data: awards = [] } = useSystemAwards();
  const { data: portfolio } = usePortfolio(projectId);
  const update = useUpdatePortfolio();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [apps, setApps] = useState<PortfolioApplications>({});
  const [monthFilter, setMonthFilter] = useState<number | 'all'>('all');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!portfolio) return;
    setSelected(new Set(portfolio.selected_awards ?? []));
    setApps(portfolio.applications ?? {});
    setDirty(false);
  }, [portfolio]);

  const filtered = useMemo(
    () =>
      monthFilter === 'all'
        ? awards
        : awards.filter((a) => a.deadline_month === monthFilter),
    [awards, monthFilter],
  );

  if (!isAdmin) {
    return (
      <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
        Portfolio prosesini yalnız admin idarə edir.
      </div>
    );
  }

  if (status !== 'closed') {
    return (
      <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
        Portfolio Closeout tamamlanandan sonra aktivləşir.
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
        Portfolio iş axını tapılmadı.
      </div>
    );
  }

  function toggleAward(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        setApps((p) =>
          p[id]
            ? p
            : { ...p, [id]: { items: DEFAULT_AWARD_CHECKLIST.map((it) => ({ ...it })) } },
        );
      }
      setDirty(true);
      return next;
    });
  }

  function toggleItem(awardId: string, idx: number) {
    setApps((prev) => {
      const cur = prev[awardId]?.items ?? DEFAULT_AWARD_CHECKLIST.map((it) => ({ ...it }));
      const next = cur.map((it, i) => (i === idx ? { ...it, checked: !it.checked } : it));
      return { ...prev, [awardId]: { items: next } };
    });
    setDirty(true);
  }

  function save() {
    update.mutate(
      {
        projectId,
        selected_awards: [...selected],
        applications: apps,
      },
      { onSuccess: () => setDirty(false) },
    );
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h3 className="text-h3">Mükafatlar</h3>
          <div className="flex gap-2 flex-wrap items-center">
            <select
              className="input"
              value={monthFilter === 'all' ? '' : monthFilter}
              onChange={(e) =>
                setMonthFilter(e.target.value === '' ? 'all' : Number(e.target.value))
              }
            >
              <option value="">Bütün aylar</option>
              {MONTHS_AZ.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <button
              className="btn-primary"
              disabled={!dirty || update.isPending}
              onClick={save}
            >
              {update.isPending ? 'Yazılır…' : dirty ? 'Yadda saxla' : 'Dəyişiklik yoxdur'}
            </button>
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Bu filterə uyğun mükafat yoxdur.
          </p>
        ) : (
          <ul className="space-y-3">
            {filtered.map((a) => (
              <AwardRow
                key={a.id}
                award={a}
                selected={selected.has(a.id)}
                items={
                  apps[a.id]?.items ?? DEFAULT_AWARD_CHECKLIST.map((it) => ({ ...it }))
                }
                onToggle={() => toggleAward(a.id)}
                onToggleItem={(idx) => toggleItem(a.id, idx)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AwardRow({
  award,
  selected,
  items,
  onToggle,
  onToggleItem,
}: {
  award: SystemAward;
  selected: boolean;
  items: PortfolioApplicationItem[];
  onToggle: () => void;
  onToggleItem: (idx: number) => void;
}) {
  const remaining = daysUntilNextDeadline(award.deadline_month);
  const monthLabel =
    award.deadline_month != null ? MONTHS_AZ[award.deadline_month - 1] : '—';
  const tone =
    remaining == null
      ? 'var(--text-muted)'
      : remaining <= 14
        ? '#B91C1C'
        : remaining <= 45
          ? '#D97706'
          : 'var(--brand-text)';

  return (
    <li
      className="rounded-card p-3"
      style={{ border: '1px solid var(--line-soft)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <label className="flex items-start gap-3 cursor-pointer min-w-0 flex-1">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="mt-1"
          />
          <div className="min-w-0">
            <div className="text-body font-medium">{award.name}</div>
            <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
              {award.organizer ?? '—'}
              {award.criteria ? ` · ${award.criteria}` : ''}
            </div>
          </div>
        </label>
        <div className="text-right shrink-0">
          <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
            {monthLabel}
          </div>
          {remaining != null ? (
            <div className="text-body" style={{ color: tone, fontVariantNumeric: 'tabular-nums' }}>
              {remaining} gün qaldı
            </div>
          ) : null}
        </div>
      </div>

      {selected ? (
        <ul className="mt-3 space-y-1.5 pl-7">
          {items.map((it, i) => (
            <li key={it.key}>
              <label className="flex items-center gap-2 text-body cursor-pointer">
                <input
                  type="checkbox"
                  checked={it.checked}
                  onChange={() => onToggleItem(i)}
                />
                <span
                  style={{
                    textDecoration: it.checked ? 'line-through' : 'none',
                    color: it.checked ? 'var(--text-muted)' : 'var(--text)',
                  }}
                >
                  {it.label}
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function daysUntilNextDeadline(month: number | null): number | null {
  if (month == null) return null;
  const now = new Date();
  const yr =
    now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() > 1)
      ? now.getFullYear() + 1
      : now.getFullYear();
  const target = new Date(yr, month - 1, 1);
  const diff = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}
