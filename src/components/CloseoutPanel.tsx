/**
 * Closeout (REQ-PROJ-04) — checklist UI that, when complete, calls
 * close_project RPC. Items are stored in closeout_checklists.items jsonb
 * as { id, label, done, by, at }; we lazy-create the row on first interaction.
 *
 * Default checklist (PRD §M3 REQ-PROJ-04):
 *   1. Akt imzalandı
 *   2. Final sənədlər təhvil verildi
 *   3. Arxivə köçürüldü
 *   4. Portfolio üçün ayrıldı
 *   5. Retrospektiv sorğu göndərildi
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';

const DEFAULT_ITEMS = [
  { id: 'act_signed', label: 'Akt imzalandı' },
  { id: 'final_docs', label: 'Final sənədlər təhvil verildi' },
  { id: 'archived', label: 'Arxivə köçürüldü' },
  { id: 'portfolio_set', label: 'Portfolio üçün ayrıldı' },
  { id: 'retro_sent', label: 'Retrospektiv sorğu göndərildi' },
] as const;

type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  by?: string | null;
  at?: string | null;
};

type ChecklistRow = {
  id: string;
  project_id: string;
  items: ChecklistItem[];
  completed_at: string | null;
};

type Props = { projectId: string; projectStatus: string };

export function CloseoutPanel({ projectId, projectStatus }: Props) {
  const { profile, isAdmin } = useAuth();
  const qc = useQueryClient();

  const checklist = useQuery({
    queryKey: ['closeout', projectId],
    queryFn: async (): Promise<ChecklistRow | null> => {
      const { data, error } = await supabase
        .from('closeout_checklists')
        .select('*')
        .eq('project_id', projectId)
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as ChecklistRow | null;
    },
  });

  const [items, setItems] = useState<ChecklistItem[]>([]);

  useEffect(() => {
    if (checklist.data) {
      // Reconcile against DEFAULT_ITEMS so a future PRD addition surfaces
      // unchecked even on legacy rows.
      const stored = checklist.data.items ?? [];
      const merged = DEFAULT_ITEMS.map((d) => {
        const existing = stored.find((s) => s.id === d.id);
        return existing ?? { id: d.id, label: d.label, done: false };
      });
      setItems(merged);
    } else {
      setItems(DEFAULT_ITEMS.map((d) => ({ id: d.id, label: d.label, done: false })));
    }
  }, [checklist.data]);

  const upsert = useMutation({
    mutationFn: async (next: ChecklistItem[]) => {
      const payload = {
        project_id: projectId,
        items: next,
      };
      if (checklist.data?.id) {
        const { error } = await supabase
          .from('closeout_checklists')
          .update({ items: next })
          .eq('id', checklist.data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('closeout_checklists').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['closeout', projectId] }),
  });

  const close = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('close_project', { p_id: projectId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['closeout', projectId] });
    },
  });

  function toggle(id: string) {
    const next = items.map((it) =>
      it.id === id
        ? {
            ...it,
            done: !it.done,
            by: !it.done ? profile?.id ?? null : null,
            at: !it.done ? new Date().toISOString() : null,
          }
        : it,
    );
    setItems(next);
    upsert.mutate(next);
  }

  const allDone = items.length > 0 && items.every((it) => it.done);
  const closed = projectStatus === 'closed';

  return (
    <div className="space-y-4">
      <div className="card">
        <h3 className="text-h3 mb-3">Bağlama yoxlama siyahısı</h3>
        <ul className="divide-y" style={{ borderColor: 'var(--line-soft)' }}>
          {items.map((it) => (
            <li key={it.id} className="py-3 flex items-center gap-3">
              <input
                type="checkbox"
                id={`co-${it.id}`}
                checked={it.done}
                onChange={() => toggle(it.id)}
                disabled={closed || upsert.isPending}
                aria-labelledby={`co-${it.id}-label`}
              />
              <label
                id={`co-${it.id}-label`}
                htmlFor={`co-${it.id}`}
                className="flex-1 cursor-pointer"
                style={{ color: it.done ? 'var(--text-muted)' : 'var(--text)' }}
              >
                {it.label}
                {it.done && it.at ? (
                  <span className="text-meta ml-2" style={{ color: 'var(--text-muted)' }}>
                    {new Date(it.at).toISOString().slice(0, 10)}
                  </span>
                ) : null}
              </label>
            </li>
          ))}
        </ul>
      </div>

      {closed ? (
        <div
          className="card flex items-center justify-between"
          style={{ background: 'var(--brand-mist)' }}
        >
          <div>
            <h4 className="text-h4">Layihə bağlanılıb</h4>
            <p className="text-meta" style={{ color: 'var(--text-soft)' }}>
              Yenidən açmaq adminin səlahiyyətindədir.
            </p>
          </div>
          {isAdmin ? (
            <button
              type="button"
              className="btn-outline"
              onClick={async () => {
                const { error } = await supabase.rpc('reopen_project', { p_id: projectId });
                if (!error) qc.invalidateQueries({ queryKey: ['project', projectId] });
              }}
            >
              Yenidən aç
            </button>
          ) : null}
        </div>
      ) : (
        <div className="card flex items-center justify-between">
          <div>
            <h4 className="text-h4">Hazırsan?</h4>
            <p className="text-meta" style={{ color: 'var(--text-soft)' }}>
              {allDone
                ? 'Bütün addımlar tamamlandı — Layihəni bağla.'
                : 'Yaxşı vərdişdir hamısını işarələmək, amma bağlama hər zaman mümkündür.'}
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={() => close.mutate()}
            disabled={close.isPending}
          >
            {close.isPending ? 'Bağlanır…' : 'Layihəni bağla'}
          </button>
        </div>
      )}

      {close.error ? (
        <p className="text-meta" style={{ color: '#B91C1C' }}>
          {(close.error as Error).message}
        </p>
      ) : null}
    </div>
  );
}
