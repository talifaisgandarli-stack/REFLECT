/**
 * Karyera Strukturu — PRD §9.2.
 *
 * Schema-backed (migration 0011). Admin can create, edit, delete; everyone
 * else gets a read-only ordered list.
 *
 * Logged PRD gap: PRD §9.2 says "users read + see promotion path from
 * current level → next" but profiles has no career_level_id. v1 ships the
 * ordered list without per-user current-level highlighting; we revisit
 * when PRD adds the column.
 */
import { useState } from 'react';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/store';
import {
  useCareerLevels,
  useCreateCareerLevel,
  useDeleteCareerLevel,
  useUpdateCareerLevel,
  type CareerLevel,
} from '@/lib/career';
import { ValidationError } from '@/lib/finance';

export function CareerPage() {
  const { isAdmin } = useAuth();
  const levels = useCareerLevels();
  const create = useCreateCareerLevel();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', level_index: '', summary: '' });
  const [err, setErr] = useState<string | null>(null);

  async function onAdd() {
    setErr(null);
    try {
      await create.mutateAsync({
        name: draft.name,
        level_index: Number(draft.level_index),
        requirements: draft.summary.trim() ? { summary: draft.summary.trim() } : {},
      });
      setDraft({ name: '', level_index: '', summary: '' });
      setAdding(false);
    } catch (e) {
      setErr(e instanceof ValidationError ? e.message : (e as Error).message);
    }
  }

  return (
    <>
      <PageHead
        meta="Promosyon yolu"
        title="Karyera Strukturu"
        actions={
          isAdmin ? (
            <button className="btn-primary" onClick={() => setAdding(true)}>
              + Səviyyə
            </button>
          ) : null
        }
      />

      {levels.isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : (levels.data ?? []).length === 0 && !adding ? (
        <EmptyState
          title="Karyera səviyyələri yoxdur"
          body={
            isAdmin
              ? 'İlk səviyyəni əlavə et — Junior, Mid, Senior, Principal kimi.'
              : 'Admin səviyyələri qurana qədər boş qalacaq.'
          }
          cta={
            isAdmin ? (
              <button className="btn-primary" onClick={() => setAdding(true)}>
                + Səviyyə
              </button>
            ) : undefined
          }
        />
      ) : (
        <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {(levels.data ?? []).map((l) => (
            <LevelCard key={l.id} level={l} editable={isAdmin} />
          ))}
          {adding ? (
            <li className="card" style={{ borderStyle: 'dashed' }}>
              <div className="flex flex-col gap-2">
                <input
                  className="input"
                  placeholder="Ad (Junior, Mid…)"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  placeholder="Səviyyə nömrəsi"
                  value={draft.level_index}
                  onChange={(e) => setDraft({ ...draft, level_index: e.target.value })}
                />
                <textarea
                  className="input"
                  style={{ height: 80, padding: 12 }}
                  placeholder="Tələblər / qısa təsvir"
                  value={draft.summary}
                  onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                />
                {err ? <p className="text-meta" style={{ color: '#B91C1C' }}>{err}</p> : null}
                <div className="flex gap-2 justify-end">
                  <button className="btn-ghost" onClick={() => setAdding(false)}>Ləğv</button>
                  <button className="btn-primary" onClick={onAdd} disabled={create.isPending}>
                    {create.isPending ? 'Saxlanılır…' : 'Yarat'}
                  </button>
                </div>
              </div>
            </li>
          ) : null}
        </ol>
      )}
    </>
  );
}

function LevelCard({ level, editable }: { level: CareerLevel; editable: boolean }) {
  const update = useUpdateCareerLevel();
  const del = useDeleteCareerLevel();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(level.name);
  const [summary, setSummary] = useState(
    typeof level.requirements?.summary === 'string'
      ? (level.requirements.summary as string)
      : '',
  );

  if (editing) {
    return (
      <li className="card">
        <div className="flex flex-col gap-2">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea
            className="input"
            style={{ height: 80, padding: 12 }}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
          <div className="flex gap-2 justify-end">
            <button
              className="btn-ghost"
              onClick={() => {
                setEditing(false);
                setName(level.name);
              }}
            >
              Ləğv
            </button>
            <button
              className="btn-primary"
              onClick={async () => {
                await update.mutateAsync({
                  id: level.id,
                  name,
                  requirements: summary.trim() ? { summary: summary.trim() } : {},
                });
                setEditing(false);
              }}
              disabled={update.isPending}
            >
              Saxla
            </button>
          </div>
        </div>
      </li>
    );
  }

  const summaryText =
    typeof level.requirements?.summary === 'string'
      ? (level.requirements.summary as string)
      : null;

  return (
    <li className="card">
      <div className="text-meta uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        Səviyyə {level.level_index}
      </div>
      <h3 className="text-h3 mt-1">{level.name}</h3>
      {summaryText ? (
        <p className="text-body mt-2 whitespace-pre-line" style={{ color: 'var(--text-soft)' }}>
          {summaryText}
        </p>
      ) : null}
      {editable ? (
        <div className="flex gap-2 mt-3 justify-end">
          <button className="btn-ghost text-meta" onClick={() => setEditing(true)}>
            Düzəlt
          </button>
          <button
            className="btn-ghost text-meta"
            onClick={() => {
              if (confirm(`"${level.name}" səviyyəsi silinsin?`)) del.mutate(level.id);
            }}
          >
            Sil
          </button>
        </div>
      ) : null}
    </li>
  );
}
