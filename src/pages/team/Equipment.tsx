/**
 * US-EQUIP-01 — assign equipment to teammate, update condition, view transfer log
 * Schema: equipment(id, name, kind, serial, assigned_to uuid|null, condition, purchased_at, notes)
 * Transfer history via activity_log(entity_type='equipment', entity_id, action, old_value, new_value)
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { downloadCsv } from '@/lib/csv';

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

  // PRD §UX — availability filter (Hamısı / Boş / Tapşırılıb) + free-text search +
  // person filter (narrow to a specific holder when audit-trailing kit)
  const [availability, setAvailability] = useState<'all' | 'available' | 'assigned'>('all');
  const [search, setSearch] = useState('');
  const [holderFilter, setHolderFilter] = useState<string>(''); // '' = all
  // PRD §8.7 — also narrow by equipment kind (laptop / printer / camera / etc.)
  const [kindFilter, setKindFilter] = useState<string>('');
  const filteredEquipment = (equipment.data ?? []).filter((e) => {
    if (availability === 'available' && e.assigned_to) return false;
    if (availability === 'assigned' && !e.assigned_to) return false;
    if (holderFilter && e.assigned_to !== holderFilter) return false;
    if (kindFilter && (e.kind ?? '') !== kindFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const hay = `${e.name} ${e.serial ?? ''} ${(e as { qr_code?: string | null }).qr_code ?? ''} ${e.kind ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  // Surface only kinds we actually have so the row stays terse
  const availableKinds = Array.from(
    new Set((equipment.data ?? []).map((e) => e.kind ?? '').filter(Boolean)),
  ).sort();
  // Only show holders who actually own equipment (cleaner UX than full firm roster)
  const holdersWithEquipment = Array.from(
    new Set((equipment.data ?? []).map((e) => e.assigned_to).filter(Boolean) as string[]),
  ).map((id) => ({ id, name: profileMap[id] ?? id.slice(0, 8) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'az'));

  return (
    <>
      <PageHead
        meta={`${equipment.data?.length ?? 0} avadanlıq`}
        title="Avadanlıq"
        actions={
          <>
            <input
              className="input max-w-[220px]"
              placeholder="Axtar (ad, serial, QR…)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {isAdmin ? (
              <>
                {/* PRD §8.7 — CSV export for inventory audit / handover */}
                <button
                  type="button"
                  className="btn-outline"
                  disabled={(equipment.data ?? []).length === 0}
                  onClick={() => {
                    downloadCsv(
                      `avadanliq-${new Date().toISOString().slice(0, 10)}.csv`,
                      ['Ad', 'Növ', 'Serial', 'QR', 'Tapşırılıb', 'Vəziyyət', 'Qeyd'],
                      filteredEquipment.map((e) => ({
                        'Ad': e.name,
                        'Növ': e.kind ?? '',
                        'Serial': e.serial ?? '',
                        'QR': (e as { qr_code?: string | null }).qr_code ?? '',
                        'Tapşırılıb': e.assigned_to ? (profileMap[e.assigned_to] ?? '') : '',
                        'Vəziyyət': e.condition ?? '',
                        'Qeyd': e.notes ?? '',
                      })),
                    );
                  }}
                >
                  ↓ CSV
                </button>
                <button className="btn-primary" onClick={() => setCreating(true)}>+ Yeni</button>
              </>
            ) : null}
          </>
        }
      />

      {(equipment.data ?? []).length === 0 ? (
        <EmptyState
          title="Avadanlıq qeydiyyatı yoxdur"
          body="Texnika, kompüterlər, ploterlər — burada izlə."
          cta={
            isAdmin ? (
              <button className="btn-primary" onClick={() => setCreating(true)}>
                + İlk avadanlığı əlavə et
              </button>
            ) : null
          }
        />
      ) : (
        <>
          {/* PRD §8.7 — condition breakdown chips (simple distribution view) */}
          {(() => {
            const buckets = new Map<string, number>();
            for (const e of equipment.data ?? []) {
              const c = (e.condition as string) ?? 'naməlum';
              buckets.set(c, (buckets.get(c) ?? 0) + 1);
            }
            const total = (equipment.data ?? []).length;
            return (
              <div className="card mb-4 flex items-center gap-3 flex-wrap">
                <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Vəziyyət:</span>
                {Array.from(buckets.entries()).map(([k, v]) => {
                  const pct = Math.round((v / total) * 100);
                  const color =
                    k === 'good' ? 'var(--success-deep, #16794a)'
                    : k === 'fair' ? '#c47d00'
                    : k === 'broken' ? 'var(--error-deep, #b3261e)'
                    : 'var(--text-muted)';
                  return (
                    <span
                      key={k}
                      className="chip"
                      style={{
                        background: 'var(--surface-mist)',
                        color,
                        fontSize: 12,
                      }}
                    >
                      {k} · {v} ({pct}%)
                    </span>
                  );
                })}
              </div>
            );
          })()}

          {/* PRD §UX — availability filter chips */}
          <div className="flex gap-2 mb-3">
            {([
              { k: 'all', label: 'Hamısı' },
              { k: 'available', label: 'Boş' },
              { k: 'assigned', label: 'Tapşırılıb' },
            ] as const).map((f) => (
              <button
                key={f.k}
                type="button"
                className="chip"
                style={{
                  background: availability === f.k ? 'var(--brand-action)' : 'var(--surface-mist)',
                  color: availability === f.k ? 'var(--ink)' : 'var(--text-muted)',
                  fontWeight: availability === f.k ? 600 : 400,
                }}
                onClick={() => setAvailability(f.k)}
              >
                {f.label}
              </button>
            ))}
            {/* PRD §8.7 — kind filter dropdown (only shown when >1 distinct kind) */}
            {availableKinds.length > 1 ? (
              <select
                className="input"
                style={{ maxWidth: 160, height: 32, fontSize: 12 }}
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value)}
                aria-label="Növə görə süz"
              >
                <option value="">Bütün növlər</option>
                {availableKinds.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            ) : null}
            {/* PRD §8.7 — narrow to one holder so audit trail per person is one click */}
            {holdersWithEquipment.length > 0 ? (
              <select
                className="input"
                style={{ maxWidth: 200, height: 32, fontSize: 12 }}
                value={holderFilter}
                onChange={(e) => setHolderFilter(e.target.value)}
                aria-label="İstifadəçiyə görə süz"
              >
                <option value="">Bütün istifadəçilər</option>
                {holdersWithEquipment.map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            ) : null}
          </div>

        <div className="card overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Ad', 'Növ', 'Serial', 'QR', 'Tapşırılıb', 'Vəziyyət', 'Qeyd', ''].map((h) => (
                  <th key={h} className="text-left py-3 px-3 text-meta" style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredEquipment.map((e) => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  <td className="py-3 px-3 font-medium">{e.name}</td>
                  <td className="py-3 px-3">{e.kind ?? '—'}</td>
                  <td className="py-3 px-3">
                    <EquipmentTextCell id={e.id} field="serial" initial={e.serial ?? null} isAdmin={isAdmin} mono={false} />
                  </td>
                  {/* PRD §8.7 — QR/asset tag (migration 0051) */}
                  <td className="py-3 px-3">
                    <EquipmentTextCell id={e.id} field="qr_code" initial={(e as { qr_code?: string | null }).qr_code ?? null} isAdmin={isAdmin} mono={true} />
                  </td>
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
                  {/* PRD §8.7 — inline notes edit (admin) */}
                  <td className="py-3 px-3" style={{ maxWidth: 200 }}>
                    <EquipmentNotesCell id={e.id} initial={(e as { notes?: string | null }).notes ?? null} isAdmin={isAdmin} />
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
        </>
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
  const [qrCode, setQrCode] = useState('');
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
        qr_code: qrCode.trim() || null,
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
        {/* PRD §8.7 — QR / asset tag (migration 0051) */}
        <label className="block mb-3">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>QR / Asset tag</span>
          <input
            className="input"
            value={qrCode}
            onChange={(e) => setQrCode(e.target.value)}
            placeholder="məs: ASSET-0042"
            style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}
          />
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

        {save.error ? <p className="text-meta mb-3" style={{ color: 'var(--error-deep)' }}>{(save.error as Error).message}</p> : null}
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

// PRD §8.7 — generic inline text editor for an equipment field (admin-only writes).
// Used by serial / qr_code / notes. Mono styling for ID-like fields (qr_code).
function EquipmentTextCell({
  id,
  field,
  initial,
  isAdmin,
  mono = false,
  placeholder,
}: {
  id: string;
  field: 'serial' | 'qr_code' | 'notes';
  initial: string | null;
  isAdmin: boolean;
  mono?: boolean;
  placeholder?: string;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(initial ?? '');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!editing) setVal(initial ?? ''); }, [initial, editing]);

  async function save() {
    const trimmed = val.trim();
    if (trimmed === (initial ?? '')) { setEditing(false); return; }
    setSaving(true);
    await supabase.from('equipment').update({ [field]: trimmed || null }).eq('id', id);
    setSaving(false);
    qc.invalidateQueries({ queryKey: ['equipment'] });
    setEditing(false);
  }

  const monoStyle: React.CSSProperties = mono ? { fontFamily: 'ui-monospace, Menlo, monospace' } : {};
  const placeholderText = placeholder ?? (field === 'notes' ? '+ qeyd' : `+ ${field}`);

  if (!isAdmin) {
    return (
      <span className="text-meta truncate block" style={{ color: 'var(--text-muted)', fontSize: 12, ...monoStyle }} title={initial ?? undefined}>
        {initial ?? '—'}
      </span>
    );
  }
  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          className="input"
          style={{ height: 24, fontSize: 12, ...monoStyle }}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') { setVal(initial ?? ''); setEditing(false); }
          }}
        />
        <button type="button" className="chip" disabled={saving} onClick={save} style={{ fontSize: 11, color: 'var(--brand-text)' }}>{saving ? '…' : '✓'}</button>
        <button type="button" className="chip" onClick={() => { setVal(initial ?? ''); setEditing(false); }} style={{ fontSize: 11 }}>×</button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="text-meta truncate block text-left hover:bg-surface-mist px-1 -mx-1 rounded-btn w-full"
      style={{
        color: initial ? 'var(--text)' : 'var(--text-muted)',
        fontStyle: initial ? 'normal' : 'italic',
        fontSize: 12,
        ...monoStyle,
      }}
      title={initial ?? undefined}
    >
      {initial ?? placeholderText}
    </button>
  );
}

// Backwards-compat: keep the old name pointing to the generic component for notes
function EquipmentNotesCell({ id, initial, isAdmin }: { id: string; initial: string | null; isAdmin: boolean }) {
  return <EquipmentTextCell id={id} field="notes" initial={initial} isAdmin={isAdmin} />;
}
