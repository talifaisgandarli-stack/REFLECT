/**
 * PRD §9.2 — US-CAREER-01
 * career_levels (id, name, level_index, requirements jsonb)
 * profiles.career_level_id = current; profiles.career_progress.criteria = self-ticked.
 *
 * Layout:
 *  - Top banner: "Cari → Növbəti" personal card with criteria checkboxes
 *  - Below: full ladder grid (read-only for non-admins)
 *  - Admins can edit levels and assign career_level_id from each user's row
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { SkeletonList } from '@/components/Skeleton';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';

type CareerLevel = {
  id: string;
  name: string;
  level_index: number;
  requirements: { criteria?: string[] };
  created_at: string;
};

type ProfileCareer = {
  id: string;
  career_level_id: string | null;
  career_progress: { criteria?: string[] } | null;
};

export function CareerPage() {
  const { isAdmin, profile } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<CareerLevel | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: levels = [], isLoading } = useQuery({
    queryKey: ['career_levels'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('career_levels')
        .select('*')
        .order('level_index');
      if (error) throw error;
      return (data ?? []) as CareerLevel[];
    },
  });

  const me = useQuery({
    queryKey: ['profile_career', profile?.id],
    enabled: !!profile?.id,
    queryFn: async (): Promise<ProfileCareer | null> => {
      const { data } = await supabase
        .from('profiles')
        .select('id, career_level_id, career_progress')
        .eq('id', profile!.id)
        .maybeSingle();
      return (data ?? null) as ProfileCareer | null;
    },
  });

  const current = useMemo(
    () => levels.find((l) => l.id === me.data?.career_level_id) ?? null,
    [levels, me.data?.career_level_id],
  );
  const next = useMemo(() => {
    if (!current) return levels[0] ?? null;
    return levels.find((l) => l.level_index > current.level_index) ?? null;
  }, [levels, current]);

  const ticked = new Set<string>(me.data?.career_progress?.criteria ?? []);

  const toggleCriterion = useMutation({
    mutationFn: async (criteria: string[]) => {
      if (!profile?.id) return;
      const { error } = await supabase
        .from('profiles')
        .update({ career_progress: { criteria } })
        .eq('id', profile.id);
      if (error) throw error;
    },
    onMutate: async (criteria) => {
      await qc.cancelQueries({ queryKey: ['profile_career', profile?.id] });
      const prev = qc.getQueryData(['profile_career', profile?.id]);
      qc.setQueryData(['profile_career', profile?.id], {
        ...(me.data ?? { id: profile?.id, career_level_id: null }),
        career_progress: { criteria },
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['profile_career', profile?.id], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['profile_career', profile?.id] }),
  });

  return (
    <>
      <PageHead
        meta="Promosyon yolu"
        title="Karyera Strukturu"
        actions={
          isAdmin ? (
            <button className="btn-primary" onClick={() => setCreating(true)}>
              + Səviyyə əlavə et
            </button>
          ) : null
        }
      />

      {/* Personalized "current → next" panel */}
      {!isLoading && levels.length > 0 ? (
        <section className="card mb-5" style={{ padding: 20 }}>
          <div className="flex flex-wrap items-baseline gap-3 mb-3">
            <div>
              <div className="text-meta uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Cari səviyyə
              </div>
              <h2 className="text-h2">{current?.name ?? 'Hələ təyin edilməyib'}</h2>
            </div>
            <span className="text-h3" style={{ color: 'var(--text-muted)' }}>→</span>
            <div>
              <div className="text-meta uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Növbəti hədəf
              </div>
              <h2 className="text-h2" style={{ color: 'var(--brand-text)' }}>
                {next?.name ?? 'Yoxdur'}
              </h2>
            </div>
          </div>
          {next && (next.requirements.criteria ?? []).length > 0 ? (
            <ul className="space-y-2">
              {(next.requirements.criteria ?? []).map((c) => (
                <li key={c}>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={ticked.has(c)}
                      onChange={(e) => {
                        const set = new Set(ticked);
                        if (e.target.checked) set.add(c);
                        else set.delete(c);
                        toggleCriterion.mutate(Array.from(set));
                      }}
                    />
                    <span
                      className="text-body"
                      style={{
                        color: ticked.has(c) ? 'var(--text-muted)' : 'var(--text)',
                        textDecoration: ticked.has(c) ? 'line-through' : 'none',
                      }}
                    >
                      {c}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
              {next ? 'Bu səviyyə üçün kriteriya hələ qurulmayıb.' : 'Tövsiyələr üçün admin ilə əlaqə saxla.'}
            </p>
          )}
          {next && (next.requirements.criteria ?? []).length > 0 ? (
            <div className="mt-3">
              <div className="text-meta flex justify-between" style={{ color: 'var(--text-muted)' }}>
                <span>{ticked.size} / {(next.requirements.criteria ?? []).length} tamamlandı</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {Math.round((ticked.size / (next.requirements.criteria ?? []).length) * 100)}%
                </span>
              </div>
              {/* PRD §9.2 — visual progress bar to next level */}
              <div
                className="mt-1 h-1.5 rounded-full"
                style={{ background: 'var(--line-soft)' }}
              >
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: `${Math.round((ticked.size / (next.requirements.criteria ?? []).length) * 100)}%`,
                    background:
                      ticked.size === (next.requirements.criteria ?? []).length
                        ? 'var(--success, #16794a)'
                        : 'var(--brand-action)',
                  }}
                />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {isLoading ? (
        <SkeletonList rows={4} />
      ) : levels.length === 0 ? (
        <div className="card">
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Karyera səviyyələri hələ qurulmayıb.
            {isAdmin ? ' "Səviyyə əlavə et" düyməsinə basın.' : ''}
          </p>
        </div>
      ) : (
        <ol className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {levels.map((l, i) => {
            const isCurrent = l.id === me.data?.career_level_id;
            return (
              <li
                key={l.id}
                className="card relative"
                style={isCurrent ? { borderColor: 'var(--brand-text)', borderWidth: 2 } : undefined}
              >
                <div
                  className="text-meta uppercase tracking-wider mb-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Səviyyə {l.level_index} {isCurrent ? '· cari' : ''}
                </div>
                <h3 className="text-h3">{l.name}</h3>

                {(l.requirements?.criteria ?? []).length > 0 ? (
                  <ul className="mt-3 space-y-1">
                    {(l.requirements.criteria ?? []).map((c, j) => (
                      <li
                        key={j}
                        className="flex items-start gap-2 text-body"
                        style={{ color: 'var(--text-soft)' }}
                      >
                        <span style={{ color: 'var(--brand-text)', flexShrink: 0 }}>·</span>
                        {c}
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="mt-3 pt-3" style={{ borderTop: '1px dashed var(--line)' }}>
                  {i < levels.length - 1 ? (
                    <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
                      → {levels[i + 1].name}
                    </p>
                  ) : (
                    <p className="text-meta" style={{ color: 'var(--brand-text)' }}>
                      Ən yüksək səviyyə
                    </p>
                  )}
                </div>

                {isAdmin ? (
                  <button
                    type="button"
                    className="absolute top-3 right-3 text-meta"
                    style={{ color: 'var(--text-muted)' }}
                    onClick={() => setEditing(l)}
                  >
                    Düzəlt
                  </button>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {/* PRD §9.2 / REQ-COMP-05 — Admin panel: assign career_level_id to each profile */}
      {isAdmin && levels.length > 0 ? (
        <TeamCareerPanel levels={levels} />
      ) : null}

      {(creating || editing) && isAdmin ? (
        <CareerLevelModal
          level={editing}
          maxIndex={levels.length + 1}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['career_levels'] });
            setCreating(false);
            setEditing(null);
          }}
        />
      ) : null}
    </>
  );
}

// --- Admin: assign career levels to team members (REQ-COMP-05) -------------

type ProfileRow = {
  id: string;
  full_name: string | null;
  career_level_id: string | null;
};

function TeamCareerPanel({ levels }: { levels: CareerLevel[] }) {
  const qc = useQueryClient();

  const members = useQuery({
    queryKey: ['profiles', 'career-assign'],
    queryFn: async (): Promise<ProfileRow[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, career_level_id')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
  });

  const assign = useMutation({
    mutationFn: async ({ userId, levelId }: { userId: string; levelId: string | null }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ career_level_id: levelId })
        .eq('id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profiles', 'career-assign'] });
      qc.invalidateQueries({ queryKey: ['profile_career'] });
    },
  });

  return (
    <section className="card mt-6" style={{ padding: 20 }}>
      <h3 className="text-h3 mb-4">Komandaya səviyyə təyin et</h3>
      {members.isLoading ? (
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>Yüklənir…</p>
      ) : (
        <ul className="space-y-2">
          {(members.data ?? []).map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 py-2"
              style={{ borderBottom: '1px solid var(--line-soft)' }}
            >
              <span className="text-body font-medium">{m.full_name ?? '—'}</span>
              <select
                aria-label={`${m.full_name ?? ''} üçün karyera səviyyəsi`}
                className="input"
                style={{ width: 220, fontSize: 13 }}
                value={m.career_level_id ?? ''}
                onChange={(e) =>
                  assign.mutate({
                    userId: m.id,
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
    </section>
  );
}

// ---------------------------------------------------------------------------

function CareerLevelModal({
  level,
  maxIndex,
  onClose,
  onSaved,
}: {
  level: CareerLevel | null;
  maxIndex: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(level?.name ?? '');
  const [levelIndex, setLevelIndex] = useState(level?.level_index ?? maxIndex);
  const [criteriaText, setCriteriaText] = useState(
    (level?.requirements?.criteria ?? []).join('\n'),
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Ad tələb olunur');
      const criteria = criteriaText
        .split('\n')
        .map((c) => c.trim())
        .filter(Boolean);
      const payload = {
        name: name.trim(),
        level_index: levelIndex,
        requirements: { criteria },
      };
      if (level) {
        const { error } = await supabase
          .from('career_levels')
          .update(payload)
          .eq('id', level.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('career_levels').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: onSaved,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(14,22,17,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-surface p-6 rounded-card w-[480px]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-h2 mb-4">
          {level ? 'Səviyyəni düzəlt' : 'Yeni karyera səviyyəsi'}
        </h2>

        <label className="block mb-3">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Ad</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Senior Architect"
          />
        </label>

        <label className="block mb-3">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Sıra nömrəsi</span>
          <input
            type="number" className="input" min={1}
            value={levelIndex}
            onChange={(e) => setLevelIndex(Number(e.target.value))}
          />
        </label>

        <label className="block mb-4">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
            Tələblər (hər sətirdə bir)
          </span>
          <textarea
            className="input" rows={5}
            value={criteriaText}
            onChange={(e) => setCriteriaText(e.target.value)}
            placeholder={'≥5 layihə bağlamış olsun\nEkspertizaya müstəqil çıxmış olsun'}
          />
        </label>

        {save.error ? (
          <p className="text-meta mb-3" style={{ color: 'var(--error-deep)' }}>
            {(save.error as Error).message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button className="btn-outline" onClick={onClose}>Ləğv et</button>
          <button
            className="btn-primary"
            disabled={save.isPending || !name.trim()}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saxlanılır…' : 'Saxla'}
          </button>
        </div>
      </div>
    </div>
  );
}
