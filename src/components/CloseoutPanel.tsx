/**
 * Closeout flow — REQ-PROJ-04.
 *
 * Built-in checklist (akt imzalandı, final sənədlər, arxiv, portfel,
 * retrospektiv sorğu). When all items checked → "Layihəni Tamamla":
 *   - sets project.status = 'closed'
 *   - stamps closeout_checklists.completed_at
 *   - creates a portfolio_workflows row if one doesn't exist
 *
 * Edge case (PRD §5 line 315): project with no tasks → closeout allowed
 * (the warning is surfaced as inline copy, no hard block).
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

type Item = { key: string; label: string; checked: boolean };

const DEFAULT_ITEMS: Item[] = [
  { key: 'akt', label: 'Akt imzalandı', checked: false },
  { key: 'final_docs', label: 'Final sənədlər təhvil verildi', checked: false },
  { key: 'archive', label: 'Layihə arxivləndi', checked: false },
  { key: 'portfolio', label: 'Portfel materialları hazırdır', checked: false },
  { key: 'retro', label: 'Retrospektiv sorğu göndərildi', checked: false },
];

type ChecklistRow = {
  id: string;
  project_id: string;
  items: Item[];
  completed_at: string | null;
};

export function CloseoutPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();

  const checklist = useQuery({
    queryKey: ['closeout', projectId],
    queryFn: async (): Promise<ChecklistRow | null> => {
      const { data } = await supabase
        .from('closeout_checklists')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();
      return (data as ChecklistRow) ?? null;
    },
  });

  const [items, setItems] = useState<Item[]>(DEFAULT_ITEMS);

  useEffect(() => {
    if (checklist.data?.items && Array.isArray(checklist.data.items)) {
      // Merge stored items into the canonical default list so newly-added
      // checklist items always appear even on legacy rows.
      const stored = new Map(checklist.data.items.map((i) => [i.key, i.checked]));
      setItems(DEFAULT_ITEMS.map((i) => ({ ...i, checked: stored.get(i.key) ?? false })));
    }
  }, [checklist.data]);

  const allChecked = useMemo(() => items.every((i) => i.checked), [items]);
  const completedAt = checklist.data?.completed_at ?? null;

  const saveItems = useMutation({
    mutationFn: async (next: Item[]) => {
      if (checklist.data) {
        const { error } = await supabase
          .from('closeout_checklists')
          .update({ items: next })
          .eq('id', checklist.data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('closeout_checklists')
          .insert({ project_id: projectId, items: next });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['closeout', projectId] }),
  });

  const finalize = useMutation({
    mutationFn: async () => {
      const stampedAt = new Date().toISOString();
      // Stamp completed_at + close project + create portfolio workflow row.
      const ops = await Promise.all([
        supabase
          .from('closeout_checklists')
          .update({ completed_at: stampedAt, items })
          .eq('project_id', projectId),
        supabase.from('projects').update({ status: 'closed' }).eq('id', projectId),
        supabase
          .from('portfolio_workflows')
          .upsert({ project_id: projectId }, { onConflict: 'project_id' }),
      ]);
      const err = ops.find((r) => r.error)?.error;
      if (err) throw err;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['closeout', projectId] });
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      qc.invalidateQueries({ queryKey: ['portfolio', projectId] });
    },
  });

  const toggle = (key: string) => {
    const next = items.map((i) => (i.key === key ? { ...i, checked: !i.checked } : i));
    setItems(next);
    saveItems.mutate(next);
  };

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-h3">Closeout</h3>
        {completedAt ? (
          <span className="chip" style={{ background: 'rgba(173,251,73,0.12)', color: 'var(--brand-text)' }}>
            Tamamlandı · {new Date(completedAt).toLocaleDateString('az-AZ')}
          </span>
        ) : null}
      </div>

      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.key} className="flex items-center gap-3">
            <input
              type="checkbox"
              id={`co-${i.key}`}
              checked={i.checked}
              disabled={!!completedAt}
              onChange={() => toggle(i.key)}
            />
            <label htmlFor={`co-${i.key}`} className="text-body">
              {i.label}
            </label>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-3 pt-2">
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
          {allChecked
            ? 'Bütün addımlar hazırdır.'
            : 'Bütün addımlar tamamlandıqdan sonra layihəni bağlayın.'}
        </p>
        <button
          className="btn-primary"
          disabled={!allChecked || !!completedAt || finalize.isPending}
          onClick={() => finalize.mutate()}
        >
          {finalize.isPending ? '…' : 'Layihəni Tamamla'}
        </button>
      </div>
    </div>
  );
}
