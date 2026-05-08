import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/store';
import { formatAZN, formatDate } from '@/lib/format';
import {
  isOutsourcePaidAdminOnly,
  useUpdateOutsourceStatus,
} from '@/lib/hooks';
import type { OutsourceItem, OutsourceStatus } from '@/types/db';
import { useState } from 'react';

const STATUS_LABEL: Record<OutsourceStatus, string> = {
  order: 'Sifariş',
  in_progress: 'İcrada',
  delivered: 'Təhvil',
  paid: 'Ödənildi',
};

const STATUS_FLOW: OutsourceStatus[] = ['order', 'in_progress', 'delivered', 'paid'];

type UserRow = Pick<OutsourceItem, 'id' | 'project_id' | 'work_title' | 'deadline' | 'status' | 'responsible_user_id'>;

export function OutsourcePage() {
  const { isAdmin, profile } = useAuth();
  const update = useUpdateOutsourceStatus();
  const [err, setErr] = useState<string | null>(null);

  const adminQ = useQuery({
    queryKey: ['outsource'],
    enabled: isAdmin,
    queryFn: async (): Promise<OutsourceItem[]> => {
      const { data, error } = await supabase
        .from('outsource_items')
        .select('*')
        .order('deadline', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const userQ = useQuery({
    queryKey: ['outsource-user'],
    enabled: !isAdmin,
    queryFn: async (): Promise<UserRow[]> => {
      const { data, error } = await supabase
        .from('outsource_user_view')
        .select('*')
        .order('deadline', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as UserRow[];
    },
  });

  const rows = isAdmin ? adminQ.data ?? [] : userQ.data ?? [];
  const loading = isAdmin ? adminQ.isLoading : userQ.isLoading;

  function changeStatus(id: string, status: OutsourceStatus) {
    setErr(null);
    update.mutate(
      { id, status },
      {
        onError: (e) =>
          setErr(
            isOutsourcePaidAdminOnly(e)
              ? 'Yalnız admin "Ödənildi" qoya bilər.'
              : (e as Error).message,
          ),
      },
    );
  }

  const canControl = (row: OutsourceItem | UserRow) =>
    isAdmin || row.responsible_user_id === profile?.id;

  return (
    <>
      <PageHead
        meta={
          isAdmin
            ? 'Admin görünüşü (məbləğlər var)'
            : 'İstifadəçi görünüşü (məbləğlər gizlidir)'
        }
        title="Podrat İşləri"
        actions={isAdmin ? <button className="btn-primary">+ Yeni</button> : null}
      />

      {err ? (
        <div className="card mb-3 text-meta" style={{ color: 'var(--danger, #B91C1C)' }}>
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : rows.length === 0 ? (
        <EmptyState title="Podrat işi yoxdur" body="Sifariş yarat və icraçıya təhvil ver." />
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
              {rows.map((row) => (
                <tr key={row.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  <td className="py-3 px-3">{row.work_title}</td>
                  <td className="py-3 px-3">{row.project_id ?? '—'}</td>
                  <td className="py-3 px-3">{formatDate(row.deadline)}</td>
                  <td className="py-3 px-3">
                    <span className="chip">{STATUS_LABEL[row.status]}</span>
                  </td>
                  {isAdmin ? (
                    <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatAZN((row as OutsourceItem).amount)}
                    </td>
                  ) : null}
                  <td className="py-3 px-3">
                    {canControl(row) ? (
                      <StatusControls
                        current={row.status}
                        canMarkPaid={isAdmin}
                        disabled={update.isPending}
                        onChange={(s) => changeStatus(row.id, s)}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function StatusControls({
  current,
  canMarkPaid,
  disabled,
  onChange,
}: {
  current: OutsourceStatus;
  canMarkPaid: boolean;
  disabled: boolean;
  onChange: (s: OutsourceStatus) => void;
}) {
  const idx = STATUS_FLOW.indexOf(current);
  const next = STATUS_FLOW[idx + 1];
  if (!next) return null;
  if (next === 'paid' && !canMarkPaid) return null;
  return (
    <button className="btn-outline" disabled={disabled} onClick={() => onChange(next)}>
      → {STATUS_LABEL[next]}
    </button>
  );
}
