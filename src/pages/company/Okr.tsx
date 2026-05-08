/**
 * OKR — PRD §9.1.
 *
 * Two scopes: Şirkət (admin only) and Şəxsi (user sees own; admin sees all).
 * Health bands: ≥70 On Track · 40-69 At Risk · <40 Off Track.
 * Inline KR `current_value` editing drives computed progress.
 *
 * Out of scope this sprint:
 *   - Weekly nudge cron via MIRAI (PRD §9.1; lands in a follow-up that
 *     reads key_results.updated_at vs now() - 7 days).
 *   - Karyera + Məzmun pages (separate stub modules).
 */
import { useState } from 'react';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { OkrModal } from '@/components/OkrModal';
import { useAuth } from '@/lib/store';
import {
  okrBand,
  okrProgressPct,
  krProgressPct,
  useDeleteOkr,
  useOkrs,
  useUpdateKr,
  type KeyResultRow,
  type OkrScope,
  type OkrWithKRs,
} from '@/lib/okr';

export function OkrPage() {
  const { isAdmin } = useAuth();
  const [scope, setScope] = useState<OkrScope>(isAdmin ? 'company' : 'personal');
  const [openCreate, setOpenCreate] = useState(false);
  const okrs = useOkrs(scope);
  const del = useDeleteOkr();

  const canCreateHere = scope === 'personal' || isAdmin;

  return (
    <>
      <PageHead
        meta="Periodlar üzrə"
        title="OKR"
        actions={
          <>
            {(['company', 'personal'] as const).map((s) =>
              s === 'company' && !isAdmin ? null : (
                <button
                  key={s}
                  type="button"
                  className="chip"
                  onClick={() => setScope(s)}
                  style={{
                    background: scope === s ? 'var(--brand-action)' : 'rgba(255,255,255,0.04)',
                    color: scope === s ? 'var(--brand-text)' : 'var(--text)',
                  }}
                >
                  {s === 'company' ? 'Şirkət' : 'Şəxsi'}
                </button>
              ),
            )}
            {canCreateHere ? (
              <button className="btn-primary" onClick={() => setOpenCreate(true)}>
                + Obyektiv
              </button>
            ) : null}
          </>
        }
      />

      {okrs.isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : (okrs.data ?? []).length === 0 ? (
        <EmptyState
          title="OKR yoxdur"
          body={
            scope === 'company'
              ? 'Şirkət OKR-larını burada yarat və komandanın baxış sahəsinə gətir.'
              : 'Şəxsi OKR yarat — Key Results-larla bağla, hər həftə yenilə.'
          }
          cta={
            canCreateHere ? (
              <button className="btn-primary" onClick={() => setOpenCreate(true)}>
                + Obyektiv
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {(okrs.data ?? []).map((o) => (
            <OkrCard
              key={o.id}
              okr={o}
              onDelete={
                isAdmin || (scope === 'personal') ? () => {
                  if (confirm('Bu OKR silinsin?')) del.mutate(o.id);
                } : undefined
              }
            />
          ))}
        </div>
      )}

      {openCreate ? (
        <OkrModal scope={scope} onClose={() => setOpenCreate(false)} />
      ) : null}
    </>
  );
}

function OkrCard({ okr, onDelete }: { okr: OkrWithKRs; onDelete?: () => void }) {
  const updateKr = useUpdateKr();
  const pct = okrProgressPct(okr);
  const band = okrBand(pct);

  return (
    <article className="card">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-h3">{okr.objective}</h3>
          <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
            {okr.period}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="chip text-tiny"
            style={{
              background: band.bg,
              color: band.color,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {pct}% · {band.label}
          </span>
          {onDelete ? (
            <button
              type="button"
              className="btn-ghost text-meta"
              onClick={onDelete}
            >
              Sil
            </button>
          ) : null}
        </div>
      </header>

      {okr.key_results.length === 0 ? (
        <p className="text-meta mt-3" style={{ color: 'var(--text-muted)' }}>
          Key Result yoxdur.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {okr.key_results.map((kr) => (
            <li
              key={kr.id}
              className="rounded-card px-3 py-2"
              style={{ border: '1px solid var(--line-soft)' }}
            >
              <KrRow kr={kr} onCommit={(v) => updateKr.mutate({ id: kr.id, current_value: v })} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function KrRow({ kr, onCommit }: { kr: KeyResultRow; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(kr.current_value));
  const pct = krProgressPct({ ...kr, current_value: Number(draft) || kr.current_value });
  const dirty = String(kr.current_value) !== draft;

  return (
    <div className="grid gap-3 items-center" style={{ gridTemplateColumns: '1fr auto auto' }}>
      <div className="min-w-0">
        <div className="text-body truncate">{kr.title}</div>
        <div
          className="h-1.5 rounded-full mt-1.5"
          style={{ background: 'var(--line-soft)' }}
        >
          <div
            className="h-1.5 rounded-full"
            style={{
              width: `${pct}%`,
              background:
                pct >= 70 ? 'var(--brand-action)' : pct >= 40 ? '#F59E0B' : '#EF4444',
              transition: 'width 200ms ease',
            }}
          />
        </div>
      </div>
      <div className="flex items-center gap-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <input
          type="number"
          inputMode="decimal"
          step="any"
          className="input"
          style={{ height: 32, padding: '0 8px', width: 84 }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (dirty) onCommit(Number(draft));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (dirty) onCommit(Number(draft));
            }
          }}
        />
        <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
          / {kr.target_value} {kr.unit ?? ''}
        </span>
      </div>
      <span
        className="text-meta"
        style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', minWidth: 40, textAlign: 'right' }}
      >
        {pct}%
      </span>
    </div>
  );
}
