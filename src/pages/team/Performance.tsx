/**
 * Performance review gauge — PRD §8.3.
 * Activates from year 2026 (REQ §8.3 line 439).
 * User sees self for all years; admin sees all rows + can pick employee.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/db';

type ReviewRow = {
  id: string;
  employee_id: string;
  year: number;
  score: number | null;
  ratings: Record<string, number> | null;
  reviewer_id: string | null;
  summary: string | null;
};

export function PerformancePage() {
  const { isAdmin, session } = useAuth();
  const [employeeId, setEmployeeId] = useState<string>(session?.userId ?? '');
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(Math.max(2026, currentYear));

  const profilesQ = useQuery({
    queryKey: ['profiles', 'minimal'],
    enabled: isAdmin,
    queryFn: async () =>
      ((
        await supabase.from('profiles').select('id, full_name, email').eq('is_active', true)
      ).data ?? []) as Pick<Profile, 'id' | 'full_name' | 'email'>[],
  });

  const reviews = useQuery({
    queryKey: ['perf', employeeId],
    enabled: !!employeeId,
    queryFn: async () =>
      ((
        await supabase
          .from('performance_reviews')
          .select('*')
          .eq('employee_id', employeeId)
          .order('year', { ascending: false })
      ).data ?? []) as ReviewRow[],
  });

  const current = useMemo(
    () => (reviews.data ?? []).find((r) => r.year === year) ?? null,
    [reviews.data, year],
  );

  const score = current?.score ?? null;
  const tone =
    score == null
      ? 'none'
      : score >= 70
        ? 'strong'
        : score >= 40
          ? 'medium'
          : 'weak';

  return (
    <>
      <PageHead
        meta={`${year}-cı il`}
        title="Performans"
        actions={
          <>
            {isAdmin ? (
              <select
                className="input"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
              >
                <option value="">— işçi —</option>
                {(profilesQ.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name ?? p.email}
                  </option>
                ))}
              </select>
            ) : null}
            <select
              className="input"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {Array.from(
                { length: Math.max(1, currentYear - 2025) },
                (_, i) => 2026 + i,
              ).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </>
        }
      />

      {!employeeId ? (
        <EmptyState
          title="İşçi seçin"
          body="Yuxarıdakı menyudan bir işçi seçərək performans tarixçəsini görün."
        />
      ) : reviews.data && reviews.data.length === 0 ? (
        <EmptyState
          title="Performans qiymətləndirməsi yoxdur"
          body="2026-cı ildən etibarən illik performans qiymətləndirməsi başlayır."
        />
      ) : (
        <div className="card flex items-center gap-6">
          <Gauge value={score ?? 0} active={score != null} tone={tone} />
          <div>
            <h2 className="text-h2">
              {score == null
                ? '—'
                : tone === 'strong'
                  ? 'Yüksək'
                  : tone === 'medium'
                    ? 'Orta'
                    : 'Aşağı'}
            </h2>
            <p
              className="text-body mt-1"
              style={{ color: 'var(--text-muted)', maxWidth: 480 }}
            >
              {current?.summary ?? 'Bu il üçün hələ qiymətləndirmə əlavə edilməyib.'}
            </p>
            {current?.ratings ? (
              <ul className="mt-3 space-y-1">
                {Object.entries(current.ratings).map(([k, v]) => (
                  <li
                    key={k}
                    className="text-meta"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {k}: {String(v)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}

function Gauge({
  value,
  active,
  tone,
}: {
  value: number;
  active: boolean;
  tone: 'strong' | 'medium' | 'weak' | 'none';
}) {
  const color =
    tone === 'strong'
      ? 'var(--brand-action)'
      : tone === 'medium'
        ? '#D97706'
        : tone === 'weak'
          ? '#EF4444'
          : 'var(--line)';
  const C = 2 * Math.PI * 70;
  return (
    <div style={{ position: 'relative', width: 160, height: 160 }}>
      <svg width={160} height={160} viewBox="0 0 160 160">
        <circle cx="80" cy="80" r="70" fill="none" stroke="var(--line)" strokeWidth="8" />
        <circle
          cx="80"
          cy="80"
          r="70"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={active ? C * (1 - value / 100) : C}
          transform="rotate(-90 80 80)"
        />
      </svg>
      <div
        className="absolute inset-0 flex items-center justify-center text-h1"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {active ? value : '—'}
      </div>
    </div>
  );
}
