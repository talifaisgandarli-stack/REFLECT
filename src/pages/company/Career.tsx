/**
 * Karyera Strukturu (PRD §M9.2). Admin manages the level catalogue;
 * users read the ladder + see their current level highlighted with a
 * promotion path to the next tier.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { PageHead } from '@/components/PageHead';

type LevelRow = {
  id: string;
  level_index: number;
  name: string;
  description: string | null;
  requirements: string[];
};

export function CareerPage() {
  const { isAdmin, profile } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<LevelRow | null>(null);

  const levels = useQuery({
    queryKey: ['career-levels'],
    queryFn: async (): Promise<LevelRow[]> => {
      const { data, error } = await supabase
        .from('career_levels')
        .select('*')
        .order('level_index', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Array<{
        id: string;
        level_index: number;
        name: string;
        description: string | null;
        requirements: unknown;
      }>).map((r) => ({
        ...r,
        requirements: Array.isArray(r.requirements) ? (r.requirements as string[]) : [],
      }));
    },
  });

  const myLevelId = useMemo(() => {
    if (!profile) return null;
    return (profile as { career_level_id?: string | null }).career_level_id ?? null;
  }, [profile]);

  const myLevel = (levels.data ?? []).find((l) => l.id === myLevelId);
  const nextLevel = myLevel
    ? (levels.data ?? []).find((l) => l.level_index === myLevel.level_index + 1) ?? null
    : null;

  return (
    <>
      <PageHead
        meta={myLevel ? `Sənin səviyyən: ${myLevel.name}` : 'Promosyon yolu'}
        title="Karyera Strukturu"
        actions={
          isAdmin ? (
            <button
              className="btn-primary"
              onClick={() =>
                setEditing({
                  id: '',
                  level_index: ((levels.data ?? []).at(-1)?.level_index ?? 0) + 1,
                  name: '',
                  description: null,
                  requirements: [],
                })
              }
            >
              + Səviyyə
            </button>
          ) : null
        }
      />

      {myLevel && nextLevel ? (
        <div
          className="card-feature mb-5"
          style={{ background: 'var(--brand-mist)', color: 'var(--ink)' }}
        >
          <div
            className="text-tiny font-medium"
            style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}
          >
            Promosyon yolu
          </div>
          <h2 className="text-h2 mt-1">
            {myLevel.name} → {nextLevel.name}
          </h2>
          {nextLevel.requirements.length > 0 ? (
            <ul className="mt-3 space-y-1 text-body">
              {nextLevel.requirements.map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className="mt-2 w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: 'var(--brand-text)' }}
                  />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {(levels.data ?? []).map((l) => {
          const isMine = l.id === myLevelId;
          return (
            <li
              key={l.id}
              className="card"
              style={{
                borderColor: isMine ? 'var(--brand-text)' : 'var(--line)',
                borderWidth: isMine ? 2 : 1,
              }}
            >
              <div
                className="text-meta uppercase tracking-wider"
                style={{ color: isMine ? 'var(--brand-text)' : 'var(--text-muted)' }}
              >
                Səviyyə {l.level_index}
                {isMine ? ' · Sən' : ''}
              </div>
              <h3 className="text-h3 mt-1">{l.name}</h3>
              {l.description ? (
                <p className="text-body mt-2" style={{ color: 'var(--text-soft)' }}>
                  {l.description}
                </p>
              ) : null}
              {l.requirements.length > 0 ? (
                <ul
                  className="mt-3 space-y-1 text-meta"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {l.requirements.map((r, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span
                        aria-hidden
                        className="mt-1.5 w-1 h-1 rounded-full shrink-0"
                        style={{ background: 'var(--text-muted)' }}
                      />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {isAdmin ? (
                <button
                  type="button"
                  className="btn-ghost mt-3"
                  onClick={() => setEditing(l)}
                  style={{ height: 32, padding: '0 12px' }}
                >
                  Düzəlt
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>

      {editing && isAdmin ? (
        <LevelModal
          level={editing}
          onClose={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ['career-levels'] });
          }}
        />
      ) : null}
    </>
  );
}

function LevelModal({ level, onClose }: { level: LevelRow; onClose: () => void }) {
  const [name, setName] = useState(level.name);
  const [description, setDescription] = useState(level.description ?? '');
  const [reqsText, setReqsText] = useState(level.requirements.join('\n'));
  const [levelIndex, setLevelIndex] = useState<number>(level.level_index);

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Ad tələb olunur');
      const reqs = reqsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = {
        level_index: levelIndex,
        name: name.trim(),
        description: description.trim() || null,
        requirements: reqs,
      };
      if (level.id) {
        const { error } = await supabase.from('career_levels').update(payload).eq('id', level.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('career_levels').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: onClose,
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('career_levels').delete().eq('id', level.id);
      if (error) throw error;
    },
    onSuccess: onClose,
  });

  return (
    <div
      role="dialog"
      aria-label="Səviyyə"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
        className="card w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        style={{ padding: 24 }}
      >
        <h2 className="text-h2">{level.id ? 'Düzəlt' : '+ Yeni səviyyə'}</h2>

        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-[100px,1fr] gap-3">
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Sıra
              </span>
              <input
                type="number"
                min={1}
                className="input"
                value={levelIndex}
                onChange={(e) => setLevelIndex(Number(e.target.value))}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              />
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Ad
              </span>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
              />
            </label>
          </div>

          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Təsvir
            </span>
            <input
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Tələblər (hər sətir bir nöqtə)
            </span>
            <textarea
              className="input"
              value={reqsText}
              onChange={(e) => setReqsText(e.target.value)}
              style={{ minHeight: 140, padding: '12px 14px', whiteSpace: 'pre-wrap' }}
              placeholder={'Müstəqil paket sahibliyi\nMentee dəstəyi'}
            />
          </label>
        </div>

        {save.error ? (
          <p className="text-meta mt-3" style={{ color: '#B91C1C' }}>
            {(save.error as Error).message}
          </p>
        ) : null}

        <div className="flex justify-between items-center mt-6">
          {level.id ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
              style={{ color: '#B91C1C' }}
            >
              Sil
            </button>
          ) : (
            <span />
          )}
          <span className="flex gap-2">
            <button
              type="button"
              className="btn-outline"
              onClick={onClose}
              disabled={save.isPending}
            >
              Geri
            </button>
            <button type="submit" className="btn-primary" disabled={save.isPending || !name}>
              {save.isPending ? 'Yadda saxlanılır…' : 'Yadda saxla'}
            </button>
          </span>
        </div>
      </form>
    </div>
  );
}
