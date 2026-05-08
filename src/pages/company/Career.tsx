import { useMemo, useState } from 'react';
import { PageHead } from '@/components/PageHead';
import {
  useActiveProfiles,
  useCareerLevels,
  useDeleteCareerLevel,
  useSetUserCareerLevel,
  useUpsertCareerLevel,
} from '@/lib/hooks';
import { useAuth } from '@/lib/store';
import { EmptyState } from '@/components/EmptyState';
import type { CareerLevel, Profile } from '@/types/db';

/**
 * REQ-Komanda 9.2 / US-CAREER-01.
 * Reads career_levels (any authenticated). Shows current + next per the
 * user's profile.career_level_id; admin sees the whole ladder.
 *
 * Auto-evaluation of "criteria already met" against tasks/projects is future
 * work — for now requirements render as a static checklist.
 */
export function CareerPage() {
  const { profile, isAdmin } = useAuth();
  const { data: levels = [], isLoading } = useCareerLevels();
  const [tab, setTab] = useState<'mine' | 'admin'>('mine');

  const current = useMemo(
    () => levels.find((l) => l.id === profile?.career_level_id) ?? null,
    [levels, profile?.career_level_id],
  );
  const next = useMemo(
    () =>
      current
        ? levels.find((l) => l.level_index === current.level_index + 1) ?? null
        : levels[0] ?? null,
    [levels, current],
  );

  return (
    <>
      <PageHead meta="Promosyon yolu" title="Karyera Strukturu" />

      {isAdmin ? (
        <div className="flex gap-2 mb-4">
          <button
            className={`chip ${tab === 'mine' ? 'chip-brand' : ''}`}
            onClick={() => setTab('mine')}
          >
            Mənim
          </button>
          <button
            className={`chip ${tab === 'admin' ? 'chip-brand' : ''}`}
            onClick={() => setTab('admin')}
          >
            Admin idarəetmə
          </button>
        </div>
      ) : null}

      {isAdmin && tab === 'admin' ? (
        <AdminCareerEditor levels={levels} />
      ) : isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : levels.length === 0 ? (
        <EmptyState
          title="Karyera səviyyələri qurulmayıb"
          body="Admin Parametrlərdən karyera nərdivanı yarada bilər."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
            <LevelCard
              level={current}
              fallback="Cari səviyyə təyin edilməyib"
              tag="Cari"
              tone="brand"
            />
            <LevelCard
              level={next}
              fallback="Daha yüksək səviyyə yoxdur"
              tag="Növbəti"
              tone="neutral"
            />
          </div>

          <h3 className="text-h3 mb-2">Bütün nərdivan</h3>
          <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {levels.map((l) => (
              <li
                key={l.id}
                className="card"
                style={{
                  border:
                    l.id === current?.id
                      ? '2px solid var(--brand-action)'
                      : '1px solid var(--line-soft)',
                }}
              >
                <div
                  className="text-meta uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Səviyyə {l.level_index}
                </div>
                <h4 className="text-h3 mt-1">{l.name}</h4>
                <ul className="mt-2 space-y-1 text-meta">
                  {l.requirements.map((r, i) => (
                    <li key={i} style={{ color: 'var(--text-muted)' }}>
                      · {r.label}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}

function AdminCareerEditor({ levels }: { levels: CareerLevel[] }) {
  const { data: people = [] } = useActiveProfiles();
  const setLevel = useSetUserCareerLevel();
  const [editing, setEditing] = useState<CareerLevel | 'new' | null>(null);

  const peopleByLevel = useMemo(() => {
    const m = new Map<string, Profile[]>();
    for (const p of people) {
      if (!p.career_level_id) continue;
      const arr = m.get(p.career_level_id) ?? [];
      arr.push(p);
      m.set(p.career_level_id, arr);
    }
    return m;
  }, [people]);

  const unassigned = people.filter((p) => !p.career_level_id);

  return (
    <div className="space-y-5">
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-h3">Səviyyələr</h3>
          <button className="btn-primary" onClick={() => setEditing('new')}>
            + Yeni səviyyə
          </button>
        </div>
        {levels.length === 0 ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Hələ səviyyə yoxdur.
          </p>
        ) : (
          <ul className="space-y-2">
            {levels.map((l) => (
              <li
                key={l.id}
                className="rounded-card p-3 flex items-center justify-between"
                style={{ border: '1px solid var(--line-soft)' }}
              >
                <div className="min-w-0">
                  <div className="text-body font-medium">
                    {l.level_index}. {l.name}
                  </div>
                  <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                    {l.requirements.length} tələb ·{' '}
                    {peopleByLevel.get(l.id)?.length ?? 0} işçi
                  </div>
                </div>
                <button className="btn-outline" onClick={() => setEditing(l)}>
                  Düzəliş
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3 className="text-h3 mb-3">İşçilərin təyinatı</h3>
        {people.length === 0 ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            İşçi yoxdur.
          </p>
        ) : (
          <ul className="space-y-2">
            {people.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-card p-2"
                style={{ border: '1px solid var(--line-soft)' }}
              >
                <div className="min-w-0">
                  <div className="text-body truncate">{p.full_name ?? p.email}</div>
                  <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                    {p.email}
                  </div>
                </div>
                <select
                  className="input"
                  style={{ width: 200 }}
                  value={p.career_level_id ?? ''}
                  disabled={setLevel.isPending}
                  onChange={(e) =>
                    setLevel.mutate({
                      userId: p.id,
                      levelId: e.target.value || null,
                    })
                  }
                >
                  <option value="">— Təyin edilməyib —</option>
                  {levels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.level_index}. {l.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
        {unassigned.length > 0 ? (
          <p className="text-meta mt-3" style={{ color: 'var(--text-muted)' }}>
            {unassigned.length} işçi səviyyəsiz.
          </p>
        ) : null}
      </div>

      {editing ? (
        <LevelEditor
          level={editing === 'new' ? null : editing}
          existing={levels}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function LevelEditor({
  level,
  existing,
  onClose,
}: {
  level: CareerLevel | null;
  existing: CareerLevel[];
  onClose: () => void;
}) {
  const upsert = useUpsertCareerLevel();
  const del = useDeleteCareerLevel();
  const [name, setName] = useState(level?.name ?? '');
  const [levelIndex, setLevelIndex] = useState(
    level?.level_index ?? Math.max(0, ...existing.map((l) => l.level_index)) + 1,
  );
  const [reqs, setReqs] = useState<string[]>(
    level?.requirements?.map((r) => r.label) ?? [''],
  );
  const [err, setErr] = useState<string | null>(null);

  function setReq(i: number, val: string) {
    setReqs((p) => p.map((r, idx) => (idx === i ? val : r)));
  }
  function addReq() {
    setReqs((p) => [...p, '']);
  }
  function removeReq(i: number) {
    setReqs((p) => p.filter((_, idx) => idx !== i));
  }

  function submit() {
    setErr(null);
    if (!name.trim()) return setErr('Ad lazımdır.');
    if (!Number.isInteger(levelIndex) || levelIndex < 1) {
      return setErr('Səviyyə nömrəsi 1 və ya daha böyük olmalıdır.');
    }
    const cleaned = reqs.map((r) => r.trim()).filter(Boolean);
    upsert.mutate(
      {
        id: level?.id,
        name: name.trim(),
        level_index: levelIndex,
        requirements: cleaned.map((label) => ({ label })),
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
        className="bg-surface p-6 rounded-card w-[520px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-h2 mb-4">
          {level ? 'Səviyyəni düzəlt' : '+ Yeni səviyyə'}
        </h2>
        <Field label="Ad">
          <input
            className="input w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Səviyyə nömrəsi">
          <input
            className="input w-full"
            type="number"
            min={1}
            value={levelIndex}
            onChange={(e) => setLevelIndex(Number(e.target.value))}
          />
        </Field>
        <div className="mb-3">
          <div
            className="text-meta uppercase tracking-wider mb-2"
            style={{ color: 'var(--text-muted)' }}
          >
            Tələblər
          </div>
          <ul className="space-y-2">
            {reqs.map((r, i) => (
              <li key={i} className="flex gap-2">
                <input
                  className="input flex-1"
                  value={r}
                  onChange={(e) => setReq(i, e.target.value)}
                  placeholder="məs. ≥3 tamamlanmış layihə"
                />
                <button
                  className="btn-outline"
                  type="button"
                  onClick={() => removeReq(i)}
                  aria-label="Sil"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn-outline mt-2"
            style={{ fontSize: 12 }}
            onClick={addReq}
          >
            + Tələb əlavə et
          </button>
        </div>
        {err ? (
          <div className="text-meta" style={{ color: 'var(--danger, #B91C1C)' }}>
            {err}
          </div>
        ) : null}
        <div className="flex justify-between mt-4">
          <div>
            {level ? (
              <button
                className="btn-outline"
                style={{ color: 'var(--danger, #B91C1C)' }}
                onClick={() => {
                  if (!confirm('Səviyyəni silmək istəyirsən?')) return;
                  del.mutate(level.id, { onSuccess: onClose });
                }}
              >
                Sil
              </button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button className="btn-outline" onClick={onClose}>
              Ləğv et
            </button>
            <button className="btn-primary" disabled={upsert.isPending} onClick={submit}>
              {upsert.isPending ? 'Yazılır…' : 'Yadda saxla'}
            </button>
          </div>
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

function LevelCard({
  level,
  fallback,
  tag,
  tone,
}: {
  level: CareerLevel | null;
  fallback: string;
  tag: string;
  tone: 'brand' | 'neutral';
}) {
  const accent = tone === 'brand' ? 'var(--brand-action)' : 'var(--line)';
  return (
    <div
      className="card"
      style={{
        borderLeft: `4px solid ${accent}`,
      }}
    >
      <div
        className="text-tiny uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        {tag}
      </div>
      {level == null ? (
        <p className="text-body mt-1" style={{ color: 'var(--text-muted)' }}>
          {fallback}
        </p>
      ) : (
        <>
          <h2 className="text-h2 mt-1">{level.name}</h2>
          <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Səviyyə {level.level_index}
          </div>
          {level.requirements.length > 0 ? (
            <ul className="mt-3 space-y-1">
              {level.requirements.map((r, i) => (
                <li key={i} className="text-body flex items-start gap-2">
                  <span
                    className="inline-block w-4 h-4 rounded-full shrink-0 mt-1"
                    style={{ border: '1px solid var(--line)' }}
                    aria-hidden
                  />
                  <span>{r.label}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}
