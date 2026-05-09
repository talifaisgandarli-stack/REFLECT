/**
 * Karyera Strukturu — PRD §9.2 / Module 9.2
 * career_levels (id, name, level_index, requirements jsonb)
 * Admin edits; users read + see promotion path from current level → next.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { PageHead } from '@/components/PageHead';
import type { CareerLevel } from '@/types/db';

export function CareerPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<CareerLevel | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const levels = useQuery({
    queryKey: ['career-levels'],
    queryFn: async (): Promise<CareerLevel[]> => {
      const { data, error } = await supabase
        .from('career_levels')
        .select('*')
        .order('level_index', { ascending: true });
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
            <button className="btn-primary" onClick={() => setShowAdd(true)}>
              + Səviyyə
            </button>
          ) : null
        }
      />

      {levels.isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : (
        <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {(levels.data ?? []).map((l) => (
            <li key={l.id} className="card">
              <div
                className="text-meta uppercase tracking-wider mb-1"
                style={{ color: 'var(--text-muted)' }}
              >
                Səviyyə {l.level_index}
              </div>
              <h3 className="text-h3">{l.name}</h3>
              {l.requirements.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {l.requirements.map((req, i) => (
                    <li key={i} className="text-body flex gap-2" style={{ color: 'var(--text-soft)' }}>
                      <span style={{ color: 'var(--brand-action)' }}>·</span>
                      {req}
                    </li>
                  ))}
                </ul>
              )}
              {isAdmin && (
                <button
                  className="btn-outline text-meta mt-3"
                  style={{ padding: '3px 10px' }}
                  onClick={() => setEditing(l)}
                >
                  Düzəlt
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      {(showAdd || editing) && (
        <CareerLevelModal
          existing={editing}
          onClose={() => { setEditing(null); setShowAdd(false); }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['career-levels'] });
            setEditing(null);
            setShowAdd(false);
          }}
        />
      )}
    </>
  );
}

function CareerLevelModal({
  existing,
  onClose,
  onSaved,
}: {
  existing: CareerLevel | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? '');
  const [levelIndex, setLevelIndex] = useState(existing?.level_index ?? 1);
  const [reqText, setReqText] = useState(existing ? existing.requirements.join('\n') : '');

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Ad tələb olunur');
      const requirements = reqText
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean);
      if (existing) {
        const { error } = await supabase
          .from('career_levels')
          .update({ name: trimmed, level_index: levelIndex, requirements })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('career_levels')
          .insert({ name: trimmed, level_index: levelIndex, requirements });
        if (error) throw error;
      }
    },
    onSuccess: onSaved,
  });

  return (
    <div
      role="dialog"
      aria-label="Karyera səviyyəsi"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
        className="card w-full max-w-md"
        style={{ padding: 24 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
      >
        <h2 className="text-h2 mb-4">{existing ? 'Səviyyəni düzəlt' : 'Yeni səviyyə'}</h2>
        <div className="space-y-3">
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Ad *</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Junior, Mid, Senior…" />
          </label>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Sıra nömrəsi</span>
            <input type="number" className="input max-w-[100px]" min={1} value={levelIndex} onChange={(e) => setLevelIndex(Number(e.target.value))} />
          </label>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Tələblər (hər sətrdə bir)</span>
            <textarea
              className="input"
              value={reqText}
              onChange={(e) => setReqText(e.target.value)}
              style={{ minHeight: 100 }}
              placeholder="3+ bağlanmış layihə&#10;Ekspertiza sertifikatı&#10;…"
            />
          </label>
        </div>

        {save.error ? <p className="text-meta mt-3" style={{ color: '#B91C1C' }}>{(save.error as Error).message}</p> : null}

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn-outline" onClick={onClose} disabled={save.isPending}>Geri</button>
          <button type="submit" className="btn-primary" disabled={save.isPending || !name.trim()}>
            {save.isPending ? 'Saxlanılır…' : 'Saxla'}
          </button>
        </div>
      </form>
    </div>
  );
}
