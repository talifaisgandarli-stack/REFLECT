/**
 * US-EQUIP-01 — assign equipment to teammate, update condition, view transfer log
 * Schema: equipment(id, name, kind, serial, assigned_to uuid|null, condition, purchased_at, notes)
 * Transfer history via activity_log(entity_type='equipment', entity_id, action, old_value, new_value)
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/store';
import { supabase } from '@/lib/supabase';

type Equipment = {
  id: string;
  name: string;
  kind: string | null;
  serial: string | null;
  assigned_to: string | null;
  condition: string | null;
  purchased_at: string | null;
  notes: string | null;
};

type Profile = { id: string; full_name: string | null };

const CONDITIONS = ['Əla', 'Yaxşı', 'Orta', 'Zəif'] as const;
const KINDS = ['Kompüter', 'Printer', 'Plotter', 'Skaner', 'Kamera', 'Telefon', 'Digər'] as const;

export function EquipmentPage() {
  const { isAdmin, profile } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Equipment | null>(null);
  const [creating, setCreating] = useState(false);

  const equipment = useQuery({
    queryKey: ['equipment'],
    queryFn: async (): Promise<Equipment[]> => {
      const { data, error } = await supabase.from('equipment').select('*').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const profiles = useQuery({
    queryKey: ['profiles', 'list'],
    queryFn: async (): Promise<Profile[]> => {
      const { data } = await supabase.from('profiles').select('id, full_name');
      return data ?? [];
    },
  });

  const history = useQuery({
    queryKey: ['equipment_history', selected?.id],
    queryFn: async () => {
      if (!selected) return [];
      const { data } = await supabase
        .from('activity_log')
        .select('*')
        .eq('entity_type', 'equipment')
        .eq('entity_id', selected.id)
        .order('created_at', { ascending: false })
        .limit(20);
      return data ?? [];
    },
    enabled: !!selected,
  });

  const assign = useMutation({
    mutationFn: async ({ id, assigned_to, old_assigned }: { id: string; assigned_to: string | null; old_assigned: string | null }) => {
      const { error } = await supabase.from('equipment').update({ assigned_to }).eq('id', id);
      if (error) throw error;
      await supabase.from('activity_log').insert({
        entity_type: 'equipment',
        entity_id: id,
        user_id: profile?.id,
        action: assigned_to ? 'assigned' : 'unassigned',
        field_name: 'assigned_to',
        old_value: old_assigned,
        new_value: assigned_to,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment'] });
      qc.invalidateQueries({ queryKey: ['equipment_history', selected?.id] });
      setSelected(null);
    },
  });

  const updateCondition = useMutation({
    mutationFn: async ({ id, condition }: { id: string; condition: string }) => {
      const { error } = await supabase.from('equipment').update({ condition }).eq('id', id);
      if (error) throw error;
      await supabase.from('activity_log').insert({
        entity_type: 'equipment',
        entity_id: id,
        user_id: profile?.id,
        action: 'condition_updated',
        field_name: 'condition',
        new_value: condition,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment'] });
      qc.invalidateQueries({ queryKey: ['equipment_history', selected?.id] });
    },
  });

  const profileMap = Object.fromEntries((profiles.data ?? []).map((p) => [p.id, p.full_name ?? p.id]));

  return (
    <>
      <PageHead
        meta={`${equipment.data?.length ?? 0} avadanlıq`}
        title="Avadanlıq"
        actions={
          isAdmin ? (
            <button className="btn-primary" onClick={() => setCreating(true)}>+ Yeni</button>
          ) : null
        }
      />

      {(equipment.data ?? []).length === 0 ? (
        <EmptyState title="Avadanlıq qeydiyyatı yoxdur" body="Texnika, kompüterlər, ploterlər — burada izlə." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Ad', 'Növ', 'Serial', 'Tapşırılıb', 'Vəziyyət', ''].map((h) => (
                  <th key={h} className="text-left py-3 px-3 text-meta" style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(equipment.data ?? []).map((e) => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  <td className="py-3 px-3 font-medium">{e.name}</td>
                  <td className="py-3 px-3">{e.kind ?? '—'}</td>
                  <td className="py-3 px-3 text-meta" style={{ color: 'var(--text-muted)' }}>{e.serial ?? '—'}</td>
                  <td className="py-3 px-3">
                    {e.assigned_to ? profileMap[e.assigned_to] ?? e.assigned_to : (
                      <span className="text-meta" style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    {isAdmin ? (
                      <select
                        className="input"
                        style={{ height: 28, fontSize: 13, padding: '0 6px' }}
                        value={e.condition ?? ''}
                        onChange={(ev) => updateCondition.mutate({ id: e.id, condition: ev.target.value })}
                      >
                        <option value="">—</option>
                        {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : (
                      e.condition ?? '—'
                    )}
                  </td>
                  <td className="py-3 px-3">
                    {isAdmin ? (
                      <button
                        type="button"
                        className="chip"
                        style={{ fontSize: 11 }}
                        onClick={() => setSelected(e)}
                      >
                        Təhvil / Tarix
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Assign / history panel */}
      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(14,22,17,0.55)' }}
          onClick={() => setSelected(null)}
        >
          <div className="bg-surface p-6 rounded-card w-[440px] max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-h2 mb-1">{selected.name}</h2>
            <p className="text-meta mb-4" style={{ color: 'var(--text-muted)' }}>{selected.kind} · {selected.serial ?? '—'}</p>

            <h3 className="text-h3 mb-2">Tapşır / Geri al</h3>
            <select
              className="input w-full mb-3"
              key={selected.id + ':' + (selected.assigned_to ?? '')}
              defaultValue={selected.assigned_to ?? ''}
              onChange={(e) => {
                const val = e.target.value || null;
                const currentName = (profiles.data ?? []).find((p) => p.id === selected.assigned_to)?.full_name ?? null;
                const nextName = val ? (profiles.data ?? []).find((p) => p.id === val)?.full_name ?? 'naməlum' : 'Boş';
                const msg = selected.assigned_to
                  ? `Avadanlığı ${currentName ?? 'cari istifadəçidən'} ${val ? '→ ' + nextName + '-ə' : 'geri al?'} keçirilsin?`
                  : `Avadanlığı "${nextName}" istifadəçisinə tapşır?`;
                if (!confirm(msg)) {
                  // Revert select to prior value without firing change
                  e.target.value = selected.assigned_to ?? '';
                  return;
                }
                assign.mutate({ id: selected.id, assigned_to: val, old_assigned: selected.assigned_to });
              }}
            >
              <option value="">— Boş —</option>
              {(profiles.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>
              ))}
            </select>

            <h3 className="text-h3 mb-2">Transfer tarixçəsi</h3>
            {history.isLoading ? <p className="text-meta">Yüklənir…</p> : null}
            {(history.data ?? []).length === 0 && !history.isLoading ? (
              <p className="text-meta" style={{ color: 'var(--text-muted)' }}>Tarixçə yoxdur.</p>
            ) : (
              <ul className="space-y-2">
                {(history.data ?? []).map((h: any) => (
                  <li key={h.id} className="text-body border-b pb-2" style={{ borderColor: 'var(--line-soft)' }}>
                    <span className="font-medium">{h.action}</span>
                    {h.new_value ? ` → ${profileMap[h.new_value] ?? h.new_value}` : ''}
                    <span className="text-meta ml-2" style={{ color: 'var(--text-muted)' }}>
                      {new Date(h.created_at).toLocaleDateString('az-AZ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex justify-end mt-4">
              <button className="btn-outline" onClick={() => setSelected(null)}>Bağla</button>
            </div>
          </div>
        </div>
      ) : null}

      {creating ? <CreateEquipmentModal onClose={() => setCreating(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ['equipment'] }); setCreating(false); }} /> : null}
    </>
  );
}

function CreateEquipmentModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<string>(KINDS[0]);
  const [serial, setSerial] = useState('');
  const [condition, setCondition] = useState<string>(CONDITIONS[0]);
  const [purchasedAt, setPurchasedAt] = useState('');
  const [notes, setNotes] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Ad daxil edin');
      const { error } = await supabase.from('equipment').insert({
        name: name.trim(),
        kind,
        serial: serial.trim() || null,
        condition,
        purchased_at: purchasedAt || null,
        notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: onSaved,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(14,22,17,0.55)' }} onClick={onClose}>
      <div className="bg-surface p-6 rounded-card w-[420px]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-h2 mb-4">Yeni avadanlıq</h2>

        <label className="block mb-3">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Ad</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="MacBook Pro 14…" />
        </label>
        <label className="block mb-3">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Növ</span>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="block mb-3">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Serial nömrəsi</span>
          <input className="input" value={serial} onChange={(e) => setSerial(e.target.value)} />
        </label>
        <label className="block mb-3">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Vəziyyət</span>
          <select className="input" value={condition} onChange={(e) => setCondition(e.target.value)}>
            {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="block mb-3">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Alınma tarixi</span>
          <input type="date" className="input" value={purchasedAt} onChange={(e) => setPurchasedAt(e.target.value)} />
        </label>
        <label className="block mb-4">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Qeyd</span>
          <textarea className="input w-full" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {save.error ? <p className="text-meta mb-3" style={{ color: '#B91C1C' }}>{(save.error as Error).message}</p> : null}
        <div className="flex justify-end gap-2">
          <button className="btn-outline" onClick={onClose}>Ləğv et</button>
          <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saxlanılır…' : 'Saxla'}
          </button>
        </div>
      </div>
    </div>
  );
}
