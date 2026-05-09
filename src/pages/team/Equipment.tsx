/**
 * Avadanlıq (PRD §M8.7). Reflect tracks the firm's hardware and assigns
 * each item to a profile. Admin-only CRUD + assign/unassign; non-admins
 * read the catalogue (RLS would gate it but the table has no policy yet
 * so we render the same view to everyone).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { PageHead } from '@/components/PageHead';
import { useT } from '@/lib/i18n';
import { EmptyState } from '@/components/EmptyState';
import { formatDate } from '@/lib/format';

const KIND_OPTIONS = [
  'Notebook',
  'Desktop',
  'Monitor',
  'Plotter',
  'Printer',
  'Tablet',
  'Telefon',
  'Digər',
] as const;

const CONDITION_OPTIONS = ['Yeni', 'Yaxşı', 'İstifadə olunur', 'Təmir tələb edir'] as const;

const CONDITION_TONE: Record<string, { bg: string; text: string }> = {
  Yeni: { bg: '#ECF9EF', text: '#15803D' },
  Yaxşı: { bg: '#EAF2FF', text: '#1D4ED8' },
  'İstifadə olunur': { bg: '#F1F5F2', text: '#475569' },
  'Təmir tələb edir': { bg: '#FEEEED', text: '#B91C1C' },
};

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

export function EquipmentPage() {
  const t = useT();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<EquipmentRow | null>(null);

  const items = useQuery({
    queryKey: ['equipment'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data ?? []) as EquipmentRow[];
    },
  });

  const profiles = useQuery({
    queryKey: ['equipment', 'profiles'],
    queryFn: async () =>
      (await supabase.from('profiles').select('id, full_name, email').order('full_name')).data ??
      [],
  });

  const profileMap = new Map<string, { full_name: string | null; email: string }>();
  for (const p of (profiles.data ?? []) as Array<{
    id: string;
    full_name: string | null;
    email: string;
  }>) {
    profileMap.set(p.id, p);
  }

  const empty = (items.data ?? []).length === 0;

  return (
    <>
      <PageHead
        meta={`${items.data?.length ?? 0} avadanlıq`}
        title={t('nav.team.equipment')}
        actions={
          isAdmin ? (
            <button
              className="btn-primary"
              onClick={() =>
                setEditing({
                  id: '',
                  name: '',
                  kind: KIND_OPTIONS[0],
                  serial: null,
                  assigned_to: null,
                  condition: 'Yaxşı',
                  purchased_at: null,
                  notes: null,
                })
              }
            >
              + Yeni
            </button>
          ) : null
        }
      />

      {empty ? (
        <EmptyState
          title="Avadanlıq qeydiyyatı yoxdur"
          body="Texnika, kompüterlər, ploterlər — burada izlə."
          cta={
            isAdmin ? (
              <button
                className="btn-primary"
                onClick={() =>
                  setEditing({
                    id: '',
                    name: '',
                    kind: KIND_OPTIONS[0],
                    serial: null,
                    assigned_to: null,
                    condition: 'Yaxşı',
                    purchased_at: null,
                    notes: null,
                  })
                }
              >
                + Yeni avadanlıq
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Ad', 'Növ', 'Serial', 'Tapşırılıb', 'Vəziyyət', 'Alınma', ''].map((h) => (
                  <th
                    key={h}
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
              {(items.data ?? []).map((e) => {
                const tone = e.condition ? CONDITION_TONE[e.condition] : undefined;
                const assignee = e.assigned_to ? profileMap.get(e.assigned_to) : null;
                return (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    <td className="py-3 px-3 font-medium">{e.name}</td>
                    <td className="py-3 px-3">{e.kind ?? '—'}</td>
                    <td className="py-3 px-3 text-meta" style={{ color: 'var(--text-muted)' }}>
                      {e.serial ?? '—'}
                    </td>
                    <td className="py-3 px-3">
                      {assignee ? assignee.full_name || assignee.email : '—'}
                    </td>
                    <td className="py-3 px-3">
                      {e.condition ? (
                        <span
                          className="chip"
                          style={
                            tone
                              ? { background: tone.bg, color: tone.text }
                              : undefined
                          }
                        >
                          {e.condition}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {e.purchased_at ? formatDate(e.purchased_at) : '—'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {isAdmin ? (
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => setEditing(e)}
                          style={{ height: 32, padding: '0 12px' }}
                        >
                          Düzəlt
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && isAdmin ? (
        <EquipmentModal
          row={editing}
          profiles={
            (profiles.data ?? []) as Array<{
              id: string;
              full_name: string | null;
              email: string;
            }>
          }
          onClose={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ['equipment'] });
          }}
        />
      ) : null}
    </>
  );
}

function EquipmentModal({
  row,
  profiles,
  onClose,
}: {
  row: EquipmentRow;
  profiles: Array<{ id: string; full_name: string | null; email: string }>;
  onClose: () => void;
}) {
  const [name, setName] = useState(row.name);
  const [kind, setKind] = useState(row.kind ?? KIND_OPTIONS[0]);
  const [serial, setSerial] = useState(row.serial ?? '');
  const [assignedTo, setAssignedTo] = useState(row.assigned_to ?? '');
  const [condition, setCondition] = useState(row.condition ?? 'Yaxşı');
  const [purchasedAt, setPurchasedAt] = useState(row.purchased_at ?? '');
  const [notes, setNotes] = useState(row.notes ?? '');

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Ad tələb olunur');
      const payload = {
        name: name.trim(),
        kind,
        serial: serial || null,
        assigned_to: assignedTo || null,
        condition,
        purchased_at: purchasedAt || null,
        notes: notes || null,
      };
      if (row.id) {
        const { error } = await supabase.from('equipment').update(payload).eq('id', row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('equipment').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: onClose,
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('equipment').delete().eq('id', row.id);
      if (error) throw error;
    },
    onSuccess: onClose,
  });

  return (
    <div
      role="dialog"
      aria-label="Avadanlıq"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
        className="card w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        style={{ padding: 24 }}
      >
        <h2 className="text-h2">{row.id ? 'Düzəlt' : '+ Yeni avadanlıq'}</h2>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Ad
            </span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Növ
              </span>
              <select className="input" value={kind ?? ''} onChange={(e) => setKind(e.target.value)}>
                {KIND_OPTIONS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Vəziyyət
              </span>
              <select
                className="input"
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
              >
                {CONDITION_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Serial
              </span>
              <input
                className="input"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Alınma tarixi
              </span>
              <input
                type="date"
                className="input"
                value={purchasedAt ?? ''}
                onChange={(e) => setPurchasedAt(e.target.value)}
              />
            </label>
          </div>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Tapşırılıb
            </span>
            <select
              className="input"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
            >
              <option value="">— təyin olunmayıb —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Qeyd
            </span>
            <textarea
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ minHeight: 72, padding: '12px 14px' }}
            />
          </label>
        </div>

        {save.error ? (
          <p className="text-meta mt-3" style={{ color: '#B91C1C' }}>
            {(save.error as Error).message}
          </p>
        ) : null}

        <div className="flex justify-between items-center mt-6">
          {row.id ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
              style={{ color: '#B91C1C' }}
            >
              Sil
            </button>
          ) : (
            <span />
          )}
          <span className="flex gap-2">
            <button
              type="button"
              className="btn-outline"
              onClick={onClose}
              disabled={save.isPending}
            >
              Geri
            </button>
            <button type="submit" className="btn-primary" disabled={save.isPending || !name}>
              {save.isPending ? 'Yadda saxlanılır…' : 'Yadda saxla'}
            </button>
          </span>
        </div>
      </form>
    </div>
  );
}
