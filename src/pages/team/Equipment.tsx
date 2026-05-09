/**
 * Equipment register — PRD §8.7.
 * Admin assigns/unassigns; condition log + transfer history (transfer log v1.5).
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/store';
import type { Profile } from '@/types/db';

type Equipment = {
  id: string;
  name: string;
  kind: string | null;
  serial: string | null;
  assigned_to: string | null;
  condition: string | null;
};

export function EquipmentPage() {
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ['equipment'],
    queryFn: async () =>
      ((await supabase.from('equipment').select('*').limit(200)).data ?? []) as Equipment[],
  });

  const profiles = useQuery({
    queryKey: ['profiles', 'minimal'],
    queryFn: async () =>
      ((
        await supabase.from('profiles').select('id, full_name, email').eq('is_active', true)
      ).data ?? []) as Pick<Profile, 'id' | 'full_name' | 'email'>[],
  });

  const profileMap = new Map(
    (profiles.data ?? []).map((p) => [p.id, p.full_name ?? p.email]),
  );

  return (
    <>
      <PageHead
        meta={`${q.data?.length ?? 0} avadanlıq`}
        title="Avadanlıq"
        actions={
          isAdmin ? (
            <button className="btn-primary" onClick={() => setOpen(true)}>
              + Yeni
            </button>
          ) : null
        }
      />
      {(q.data ?? []).length === 0 ? (
        <EmptyState
          title="Avadanlıq qeydiyyatı yoxdur"
          body="Texnika, kompüterlər, ploterlər — burada izlə."
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Ad', 'Növ', 'Serial', 'Tapşırılıb', 'Vəziyyət'].map((h) => (
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
              {(q.data ?? []).map((e) => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  <td className="py-3 px-3">{e.name}</td>
                  <td className="py-3 px-3">{e.kind ?? '—'}</td>
                  <td className="py-3 px-3">{e.serial ?? '—'}</td>
                  <td className="py-3 px-3">
                    {e.assigned_to ? profileMap.get(e.assigned_to) ?? '—' : '—'}
                  </td>
                  <td className="py-3 px-3">{e.condition ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open ? (
        <EquipmentAddModal
          profiles={profiles.data ?? []}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function EquipmentAddModal({
  profiles,
  onClose,
}: {
  profiles: Pick<Profile, 'id' | 'full_name' | 'email'>[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('');
  const [serial, setSerial] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [condition, setCondition] = useState('new');

  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('equipment').insert({
        name,
        kind: kind || null,
        serial: serial || null,
        assigned_to: assignedTo || null,
        condition: condition || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment'] });
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
        <h3 className="text-h3">Yeni avadanlıq</h3>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Ad
          </span>
          <input
            className="input mt-1 w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
              Növ
            </span>
            <input
              className="input mt-1 w-full"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              placeholder="laptop / printer / …"
            />
          </label>
          <label className="block">
            <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
              Serial
            </span>
            <input
              className="input mt-1 w-full"
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
            />
          </label>
        </div>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Tapşırılıb
          </span>
          <select
            className="input mt-1 w-full"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
          >
            <option value="">— heç kim —</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name ?? p.email}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Vəziyyət
          </span>
          <select
            className="input mt-1 w-full"
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
          >
            <option value="new">Yeni</option>
            <option value="good">Yaxşı</option>
            <option value="fair">Orta</option>
            <option value="broken">Sınıb</option>
          </select>
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
