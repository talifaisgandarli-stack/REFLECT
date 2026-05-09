/**
 * Career structure — PRD §9.2.
 * career_levels (id, name, level_index, requirements jsonb).
 * Admin edits; users read + see promotion path. Data lands via 0017 migration.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/store';
import { supabase } from '@/lib/supabase';

type Level = {
  id: string;
  name: string;
  level_index: number;
  requirements: Record<string, string> | string[] | null;
};

export function CareerPage() {
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);

  const levels = useQuery({
    queryKey: ['career_levels'],
    queryFn: async () =>
      ((
        await supabase.from('career_levels').select('*').order('level_index')
      ).data ?? []) as Level[],
  });

  return (
    <>
      <PageHead
        meta="Promosyon yolu"
        title="Karyera Strukturu"
        actions={
          isAdmin ? (
            <button className="btn-primary" onClick={() => setOpen(true)}>
              + Səviyyə
            </button>
          ) : null
        }
      />

      {(levels.data ?? []).length === 0 ? (
        <EmptyState
          title="Karyera strukturu hələ qurulmayıb"
          body={
            isAdmin
              ? 'İlk səviyyəni əlavə edərək promosyon yolunu qurun.'
              : 'Admin karyera strukturunu qurduqdan sonra burada görünəcək.'
          }
        />
      ) : (
        <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {(levels.data ?? []).map((l) => (
            <li key={l.id} className="card">
              <div
                className="text-meta uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                Səviyyə {l.level_index}
              </div>
              <h3 className="text-h3 mt-1">{l.name}</h3>
              {l.requirements ? (
                <ul className="mt-2 space-y-1 text-body" style={{ color: 'var(--text-soft)' }}>
                  {flatten(l.requirements).map((r, i) => (
                    <li key={i}>· {r}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {open ? <LevelAddModal onClose={() => setOpen(false)} nextIndex={(levels.data?.length ?? 0) + 1} /> : null}
    </>
  );
}

function flatten(reqs: Level['requirements']): string[] {
  if (!reqs) return [];
  if (Array.isArray(reqs)) return reqs.map(String);
  return Object.values(reqs).map(String);
}

function LevelAddModal({
  onClose,
  nextIndex,
}: {
  onClose: () => void;
  nextIndex: number;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [levelIndex, setLevelIndex] = useState(nextIndex);
  const [requirements, setRequirements] = useState('');

  const submit = useMutation({
    mutationFn: async () => {
      const reqList = requirements
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const { error } = await supabase.from('career_levels').insert({
        name,
        level_index: levelIndex,
        requirements: reqList,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['career_levels'] });
      onClose();
    },
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
    >
      <div className="card max-w-md w-full space-y-3">
        <h3 className="text-h3">Yeni səviyyə</h3>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Ad
          </span>
          <input
            className="input mt-1 w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="məs. Senior"
          />
        </label>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            İndeks
          </span>
          <input
            type="number"
            className="input mt-1 w-full"
            value={levelIndex}
            onChange={(e) => setLevelIndex(Number(e.target.value))}
            min={1}
          />
        </label>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Tələblər (hər sətirdə bir)
          </span>
          <textarea
            className="input mt-1 w-full"
            rows={5}
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-outline" onClick={onClose}>
            Ləğv et
          </button>
          <button
            className="btn-primary"
            disabled={!name || submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? '…' : 'Yadda saxla'}
          </button>
        </div>
      </div>
    </div>
  );
}
