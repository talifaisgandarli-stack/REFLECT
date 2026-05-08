import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/store';
import { formatAZN } from '@/lib/format';
import { OutsourceModal } from '@/components/OutsourceModal';

type OutsourceStatus = 'order' | 'in_progress' | 'delivered' | 'paid';

const STATUS_LABEL: Record<OutsourceStatus, string> = {
  order: 'Sifariş',
  in_progress: 'İcrada',
  delivered: 'Təhvil',
  paid: 'Ödənildi',
};

const NEXT_STATUS: Record<OutsourceStatus, OutsourceStatus | null> = {
  order: 'in_progress',
  in_progress: 'delivered',
  delivered: 'paid',
  paid: null,
};

const STATUS_TONE: Record<OutsourceStatus, { bg: string; text: string }> = {
  order: { bg: '#F1F5F2', text: '#475569' },
  in_progress: { bg: '#EAF2FF', text: '#1D4ED8' },
  delivered: { bg: '#FFF6E5', text: '#92400E' },
  paid: { bg: '#ECF9EF', text: '#15803D' },
};

const FILTER_OPTIONS: Array<OutsourceStatus | 'all'> = [
  'all',
  'order',
  'in_progress',
  'delivered',
  'paid',
];

type Row = {
  id: string;
  project_id: string | null;
  work_title: string;
  contact_person?: string | null;
  deadline: string | null;
  status: OutsourceStatus;
  responsible_user_id: string | null;
  amount?: number | null;
};

export function OutsourcePage() {
  const { isAdmin, profile } = useAuth();
  const view = isAdmin ? 'outsource_items' : 'outsource_user_view';
  const qc = useQueryClient();
  const [filter, setFilter] = useState<OutsourceStatus | 'all'>('all');
  const [creating, setCreating] = useState(false);

  const q = useQuery({
    queryKey: ['outsource', view],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(view as 'outsource_items')
        .select('*')
        .order('deadline', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown) as Row[];
    },
  });

  const advance = useMutation({
    mutationFn: async (input: { id: string; next: OutsourceStatus }) => {
      const { error } = await supabase.rpc('outsource_advance_status', {
        p_id: input.id,
        p_next: input.next,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outsource'] }),
  });

  const filtered = (q.data ?? []).filter((r) => filter === 'all' || r.status === filter);

  return (
    <>
      <PageHead
        meta={
          isAdmin
            ? 'Admin görünüşü (məbləğlər var)'
            : 'İstifadəçi görünüşü (məbləğlər gizlidir)'
        }
        title="Podrat İşləri"
        actions={
          isAdmin ? (
            <button className="btn-primary" onClick={() => setCreating(true)}>
              + Yeni
            </button>
          ) : null
        }
      />

      <div className="flex flex-wrap gap-2 mb-4" role="tablist" aria-label="Status filteri">
        {FILTER_OPTIONS.map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            className={`chip ${filter === f ? 'chip-brand' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'Hamısı' : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {(q.data ?? []).length === 0 ? (
        <EmptyState
          title="Podrat işi yoxdur"
          body="Sifariş yarat və icraçıya təhvil ver."
          cta={
            isAdmin ? (
              <button className="btn-primary" onClick={() => setCreating(true)}>
                + Yeni sifariş
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {[
                  'İş',
                  'Layihə',
                  'Deadline',
                  'Status',
                  ...(isAdmin ? ['Məbləğ'] : []),
                  '',
                ].map((h, i) => (
                  <th
                    key={`${h}-${i}`}
                    className="text-left py-3 px-3 text-meta"
                    style={{
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const next = NEXT_STATUS[r.status];
                const isResponsible =
                  !!profile?.id && r.responsible_user_id === profile.id;
                const canAdvance =
                  next != null && (isAdmin || (isResponsible && next !== 'paid'));
                const tone = STATUS_TONE[r.status];
                return (
                  <tr
                    key={r.id}
                    style={{ borderBottom: '1px solid var(--line-soft)' }}
                  >
                    <td className="py-3 px-3 font-medium">{r.work_title}</td>
                    <td className="py-3 px-3 text-meta" style={{ color: 'var(--text-muted)' }}>
                      {r.project_id ?? '—'}
                    </td>
                    <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {r.deadline ?? '—'}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className="chip"
                        style={{ background: tone.bg, color: tone.text }}
                      >
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    {isAdmin ? (
                      <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatAZN(r.amount ?? null)}
                      </td>
                    ) : null}
                    <td className="py-3 px-3 text-right">
                      {canAdvance && next ? (
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => advance.mutate({ id: r.id, next })}
                          disabled={advance.isPending}
                          style={{ color: 'var(--brand-text)', height: 32, padding: '0 12px' }}
                        >
                          → {STATUS_LABEL[next]}
                        </button>
                      ) : (
                        <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
                          {r.status === 'paid' ? '✓' : ''}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={isAdmin ? 6 : 5}
                    className="py-6 text-center text-meta"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Bu filtrdə nəticə yoxdur.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {advance.error ? (
        <p className="text-meta mt-3" style={{ color: '#B91C1C' }}>
          {(advance.error as Error).message}
        </p>
      ) : null}

      {creating ? <OutsourceModal onClose={() => setCreating(false)} /> : null}
    </>
  );
}
