import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/store';
import { formatAZN } from '@/lib/format';

const STATUS_LABEL = { order: 'Sifariş', in_progress: 'İcrada', delivered: 'Təhvil', paid: 'Ödənildi' } as const;
type Status = keyof typeof STATUS_LABEL;

const STATUS_NEXT: Partial<Record<Status, Status>> = {
  order: 'in_progress',
  in_progress: 'delivered',
  delivered: 'paid',
};

export function OutsourcePage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const view = isAdmin ? 'outsource_items' : 'outsource_user_view';
  const [createOpen, setCreateOpen] = useState(false);

  const q = useQuery({
    queryKey: ['outsource', view],
    queryFn: async () => {
      const { data, error } = await supabase.from(view as 'outsource_items').select('*').order('deadline', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const advanceStatus = useMutation({
    mutationFn: async ({ id, nextStatus }: { id: string; nextStatus: Status }) => {
      const { error } = await supabase
        .from('outsource_items')
        .update({ status: nextStatus })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outsource'] }),
  });

  const headers = ['İş', 'Layihə', 'Deadline', 'Status / İrəlilə', ...(isAdmin ? ['Məbləğ'] : [])];

  return (
    <>
      <PageHead
        meta={isAdmin ? 'Admin görünüşü (məbləğlər var)' : 'İstifadəçi görünüşü (məbləğlər gizlidir)'}
        title="Podrat İşləri"
        actions={isAdmin ? <button className="btn-primary" onClick={() => setCreateOpen(true)}>+ Yeni</button> : null}
      />
      {(q.data ?? []).length === 0 ? (
        <EmptyState
          title="Podrat işi yoxdur"
          body="Sifariş yarat və icraçıya təhvil ver."
          cta={
            isAdmin ? (
              <button className="btn-primary" onClick={() => setCreateOpen(true)}>
                + İlk sifarişi yarat
              </button>
            ) : null
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {headers.map((h) => (
                  <th
                    key={h}
                    className="text-left py-3 px-3 text-meta"
                    style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(q.data as any[]).map((row) => (
                <tr key={row.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  <td className="py-3 px-3">{row.work_title}</td>
                  <td className="py-3 px-3">{row.project_id ?? '—'}</td>
                  <td className="py-3 px-3">{row.deadline ?? '—'}</td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <span className="chip" style={{ background: 'var(--surface-mist)', color: 'var(--text)', fontSize: 12 }}>
                        {STATUS_LABEL[row.status as Status] ?? row.status}
                      </span>
                      {STATUS_NEXT[row.status as Status] ? (
                        <button
                          className="text-meta hover:underline"
                          style={{ color: 'var(--brand-text)', fontSize: 12 }}
                          disabled={advanceStatus.isPending}
                          onClick={() =>
                            advanceStatus.mutate({
                              id: row.id,
                              nextStatus: STATUS_NEXT[row.status as Status]!,
                            })
                          }
                        >
                          → {STATUS_LABEL[STATUS_NEXT[row.status as Status]!]}
                        </button>
                      ) : null}
                    </div>
                  </td>
                  {isAdmin ? (
                    <td className="py-3 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatAZN(row.amount)}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {createOpen && isAdmin ? <CreateOutsourceModal onClose={() => setCreateOpen(false)} /> : null}
    </>
  );
}

function CreateOutsourceModal({ onClose }: { onClose: () => void }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [workTitle, setWorkTitle] = useState('');
  const [contactCompany, setContactCompany] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [amount, setAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [status, setStatus] = useState<Status>('order');
  const [projectId, setProjectId] = useState<string>('');
  const [responsibleUserId, setResponsibleUserId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('');

  const projects = useQuery({
    queryKey: ['projects', 'active-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('id, name').is('archived_at', null).order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const profiles = useQuery({
    queryKey: ['profiles', 'list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name').order('full_name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!workTitle.trim()) throw new Error('İş adı tələb olunur');
      const { error } = await supabase.from('outsource_items').insert({
        work_title: workTitle.trim(),
        contact_company: contactCompany.trim() || null,
        contact_person: contactPerson.trim() || null,
        amount: amount ? Number(amount) : null,
        deadline: deadline || null,
        status,
        project_id: projectId || null,
        responsible_user_id: responsibleUserId || null,
        payment_method: isAdmin ? paymentMethod || null : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['outsource'] });
      qc.invalidateQueries({ queryKey: ['fin', 'outsource_summary'] });
      onClose();
    },
  });

  return (
    <div
      role="dialog"
      aria-label="Yeni podrat işi"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <div className="card w-full max-w-lg" style={{ padding: 24 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-h3 mb-4">Yeni podrat işi</h3>
        <div className="space-y-3">
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>İş adı *</span>
            <input className="input w-full" value={workTitle} onChange={(e) => setWorkTitle(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Layihə</span>
            <select className="input w-full" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— seç —</option>
              {(projects.data ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Şirkət</span>
              <input className="input w-full" value={contactCompany} onChange={(e) => setContactCompany(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Əlaqə şəxsi</span>
              <input className="input w-full" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Məbləğ (AZN)</span>
              <input type="number" className="input w-full" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Müddət</span>
              <input type="date" className="input w-full" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </label>
          </div>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Status</span>
            <select className="input w-full" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Məsul şəxs</span>
            <select className="input w-full" value={responsibleUserId} onChange={(e) => setResponsibleUserId(e.target.value)}>
              <option value="">— seç —</option>
              {(profiles.data ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>
              ))}
            </select>
          </label>
          {isAdmin ? (
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Ödəniş üsulu</span>
              <select className="input w-full" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="">— seç —</option>
                <option value="cash">Nağd</option>
                <option value="bank_transfer">Bank köçürmə</option>
                <option value="card">Kart</option>
              </select>
            </label>
          ) : null}
          {create.error ? (
            <p className="text-meta" style={{ color: 'var(--error-deep)' }}>{(create.error as Error).message}</p>
          ) : null}
        </div>
        <div className="flex gap-3 justify-end mt-5">
          <button className="btn-ghost" onClick={onClose}>Ləğv et</button>
          <button className="btn-primary" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Yaradılır…' : 'Yarat'}
          </button>
        </div>
      </div>
    </div>
  );
}
