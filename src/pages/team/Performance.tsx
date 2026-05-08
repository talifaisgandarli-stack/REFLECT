import { PageHead } from '@/components/PageHead';

export function PerformancePage() {
  return (
    <>
      <PageHead meta="2026-cı il" title="Performans" />
      <div className="card flex items-center gap-6">
        <div style={{ position: 'relative', width: 160, height: 160 }}>
          <svg width={160} height={160} viewBox="0 0 160 160">
            <circle cx="80" cy="80" r="70" fill="none" stroke="var(--line)" strokeWidth="8" />
            <circle
              cx="80"
              cy="80"
              r="70"
              fill="none"
              stroke="var(--brand-action)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 70}
              strokeDashoffset={2 * Math.PI * 70 * 0.32}
              transform="rotate(-90 80 80)"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-h1" style={{ fontVariantNumeric: 'tabular-nums' }}>
            68
          </div>
        </div>
        <div>
          <h2 className="text-h2">Yaxşı temp</h2>
          <p className="text-body" style={{ color: 'var(--text-muted)' }}>
            Tapşırıq tamamlanma sürəti, gecikmə dərəcəsi və yoldaşlar arası işbirliyi əsasında MIRAI tərəfindən hesablanır.
          </p>
        </div>
      </div>
    </>
  );
}
