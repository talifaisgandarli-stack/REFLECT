/**
 * PRD §9.2 — US-CAREER-01
 * career_levels (id, name, level_index, requirements jsonb)
 * Admin edits; users read + see promotion path from current level → next.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';

type CareerLevel = {
  id: string;
  name: string;
  level_index: number;
  requirements: { criteria?: string[] };
  created_at: string;
};

export function CareerPage() {
  const { isAdmin } = useAuth();
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

      {isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : levels.length === 0 ? (
        <div className="card">
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Karyera səviyyələri hələ qurulmayıb.
            {isAdmin ? ' "Səviyyə əlavə et" düyməsinə basın.' : ''}
          </p>
        </div>
      ) : (
        <ol className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {levels.map((l, i) => (
            <li key={l.id} className="card relative">
              <div
                className="text-meta uppercase tracking-wider mb-1"
                style={{ color: 'var(--text-muted)' }}
              >
                Səviyyə {l.level_index}
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
          ))}
        </ol>
      )}

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
          <p className="text-meta mb-3" style={{ color: '#B91C1C' }}>
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
