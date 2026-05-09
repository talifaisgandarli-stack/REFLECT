/**
 * §8.7 Avadanlıq — equipment table; assign/unassign + condition log.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/store';

type EquipmentRow = {
  id: string;
  name: string;
  kind: string | null;
  serial: string | null;
  assigned_to: string | null;
  condition: string | null;
  purchased_at: string | null;
  notes: string | null;
};

type Profile = { id: string; full_name: string | null; email: string };

const CONDITIONS = ['Yeni', 'İşlək', 'Təmir', 'Sıradan çıxıb'] as const;

export function EquipmentPage() {
  const { isAdmin } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const list = useQuery({
    queryKey: ['equipment'],
    queryFn: async () => {
      const { data, error } = await supabase.from('equipment').select('*').limit(500);
      if (error) throw error;
      return (data ?? []) as EquipmentRow[];
    },
  });
  const profiles = useQuery({
    queryKey: ['profiles', 'simple'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, email').eq('is_active', true);
      return (data ?? []) as Profile[];
    },
  });

  const items = list.data ?? [];
  const ppl = profiles.data ?? [];
  const nameOf = (id: string | null) =>
    id ? (ppl.find((p) => p.id === id)?.full_name ?? ppl.find((p) => p.id === id)?.email ?? id.slice(0, 6)) : '—';

  return (
    <>
      <PageHead
        meta={`${items.length} avadanlıq`}
        title="Avadanlıq"
        actions={
          isAdmin ? (
            <button className="btn-primary" onClick={() => setShowForm((p) => !p)}>
              + Yeni
            </button>
          ) : null
        }
      />
      {showForm && isAdmin ? <EquipmentForm ppl={ppl} onDone={() => setShowForm(false)} /> : null}
      {items.length === 0 ? (
        <EmptyState title="Avadanlıq qeydiyyatı yoxdur" body="Texnika, kompüterlər, ploterlər — burada izlə." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Ad', 'Növ', 'Serial', 'Tapşırılıb', 'Vəziyyət', ''].map((h) => (
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
              {items.map((e) => (
                <EquipmentRow key={e.id} row={e} ppl={ppl} nameOf={nameOf} canEdit={isAdmin} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function EquipmentRow({
  row,
  ppl,
  nameOf,
  canEdit,
}: {
  row: EquipmentRow;
  ppl: Profile[];
  nameOf: (id: string | null) => string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const update = useMutation({
    mutationFn: async (patch: Partial<EquipmentRow>) => {
      const { error } = await supabase.from('equipment').update(patch).eq('id', row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ['equipment'] });
    },
  });

  if (editing && canEdit) {
    return (
      <tr style={{ borderBottom: '1px solid var(--line-soft)' }}>
        <td className="py-2 px-3">{row.name}</td>
        <td className="py-2 px-3">{row.kind ?? '—'}</td>
        <td className="py-2 px-3">{row.serial ?? '—'}</td>
        <td className="py-2 px-3">
          <select
            className="input"
            defaultValue={row.assigned_to ?? ''}
            onChange={(e) => update.mutate({ assigned_to: e.target.value || null })}
          >
            <option value="">—</option>
            {ppl.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name ?? p.email}
              </option>
            ))}
          </select>
        </td>
        <td className="py-2 px-3">
          <select
            className="input"
            defaultValue={row.condition ?? ''}
            onChange={(e) => update.mutate({ condition: e.target.value || null })}
          >
            <option value="">—</option>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </td>
        <td className="py-2 px-3 text-right">
          <button className="chip" type="button" onClick={() => setEditing(false)}>
            Bitir
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr style={{ borderBottom: '1px solid var(--line-soft)' }}>
      <td className="py-3 px-3">{row.name}</td>
      <td className="py-3 px-3">{row.kind ?? '—'}</td>
      <td className="py-3 px-3">{row.serial ?? '—'}</td>
      <td className="py-3 px-3">{nameOf(row.assigned_to)}</td>
      <td className="py-3 px-3">{row.condition ?? '—'}</td>
      <td className="py-3 px-3 text-right">
        {canEdit ? (
          <button className="chip" type="button" onClick={() => setEditing(true)}>
            Redaktə
          </button>
        ) : null}
      </td>
    </tr>
  );
}

function EquipmentForm({ ppl, onDone }: { ppl: Profile[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('');
  const [serial, setSerial] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [condition, setCondition] = useState<string>('Yeni');
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Ad tələb olunur');
      const { error: e } = await supabase.from('equipment').insert({
        name: name.trim(),
        kind: kind.trim() || null,
        serial: serial.trim() || null,
        assigned_to: assignedTo || null,
        condition,
      });
      if (e) throw e;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment'] });
      onDone();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <form
      className="card mb-4 grid grid-cols-1 md:grid-cols-5 gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <input className="input" placeholder="Ad" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="input" placeholder="Növ" value={kind} onChange={(e) => setKind(e.target.value)} />
      <input className="input" placeholder="Serial" value={serial} onChange={(e) => setSerial(e.target.value)} />
      <select className="input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
        <option value="">Tapşırılmayıb</option>
        {ppl.map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name ?? p.email}
          </option>
        ))}
      </select>
      <select className="input" value={condition} onChange={(e) => setCondition(e.target.value)}>
        {CONDITIONS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {error ? (
        <div className="md:col-span-5 text-meta" style={{ color: 'var(--danger, #c33)' }}>
          {error}
        </div>
      ) : null}
      <div className="md:col-span-5 flex gap-2">
        <button type="submit" className="btn-primary" disabled={create.isPending}>
          Yarat
        </button>
        <button type="button" className="btn-outline" onClick={onDone}>
          Ləğv
        </button>
      </div>
    </form>
  );
}
