import { useMemo, useState } from 'react';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import {
  useActiveProfiles,
  useAssignEquipment,
  useCreateEquipment,
  useEquipment,
  useEquipmentTransfers,
} from '@/lib/hooks';
import type { Equipment, Profile } from '@/types/db';
import { useAuth } from '@/lib/store';
import { formatDate, relativeTime } from '@/lib/format';

export function EquipmentPage() {
  const { isAdmin } = useAuth();
  const { data: rows = [], isLoading } = useEquipment();
  const { data: people = [] } = useActiveProfiles();
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState<Equipment | null>(null);
  const [history, setHistory] = useState<Equipment | null>(null);

  return (
    <>
      <PageHead
        meta={`${rows.length} avadanlıq`}
        title="Avadanlıq"
        actions={
          isAdmin ? (
            <button className="btn-primary" onClick={() => setCreating(true)}>
              + Yeni
            </button>
          ) : null
        }
      />

      {isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Avadanlıq qeydiyyatı yoxdur"
          body="Texnika, kompüterlər, ploterlər — burada izlə."
          cta={
            isAdmin ? (
              <button className="btn-primary" onClick={() => setCreating(true)}>
                + Yeni
              </button>
            ) : null
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {[
                  'Ad',
                  'Növ',
                  'Serial',
                  'Tapşırılıb',
                  'Vəziyyət',
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
              {rows.map((r) => {
                const owner = r.assigned_to ? peopleById.get(r.assigned_to) : null;
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    <td className="py-3 px-3">{r.name}</td>
                    <td className="py-3 px-3">{r.kind ?? '—'}</td>
                    <td className="py-3 px-3">{r.serial ?? '—'}</td>
                    <td className="py-3 px-3">
                      {owner ? owner.full_name ?? owner.email : '—'}
                    </td>
                    <td className="py-3 px-3">{r.condition ?? '—'}</td>
                    <td className="py-3 px-3 text-right space-x-2">
                      <button className="btn-outline" onClick={() => setHistory(r)}>
                        Tarixçə
                      </button>
                      {isAdmin ? (
                        <button className="btn-outline" onClick={() => setAssigning(r)}>
                          Tapşır
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

      {creating ? <CreateModal onClose={() => setCreating(false)} /> : null}
      {assigning ? (
        <AssignModal
          equipment={assigning}
          people={people}
          peopleById={peopleById}
          onClose={() => setAssigning(null)}
        />
      ) : null}
      {history ? (
        <HistoryModal
          equipment={history}
          peopleById={peopleById}
          onClose={() => setHistory(null)}
        />
      ) : null}
    </>
  );
}

function CreateModal({ onClose }: { onClose: () => void }) {
  const create = useCreateEquipment();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('');
  const [serial, setSerial] = useState('');
  const [condition, setCondition] = useState('');
  const [purchasedAt, setPurchasedAt] = useState('');
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    setErr(null);
    if (!name.trim()) return setErr('Ad lazımdır.');
    create.mutate(
      {
        name: name.trim(),
        kind: kind.trim() || null,
        serial: serial.trim() || null,
        condition: condition.trim() || null,
        purchased_at: purchasedAt || null,
      },
      { onSuccess: onClose, onError: (e) => setErr((e as Error).message) },
    );
  }

  return (
    <Modal title="+ Yeni avadanlıq" onClose={onClose}>
      <Field label="Ad">
        <input
          className="input w-full"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </Field>
      <Field label="Növ">
        <input className="input w-full" value={kind} onChange={(e) => setKind(e.target.value)} />
      </Field>
      <Field label="Serial">
        <input className="input w-full" value={serial} onChange={(e) => setSerial(e.target.value)} />
      </Field>
      <Field label="Vəziyyət">
        <input className="input w-full" value={condition} onChange={(e) => setCondition(e.target.value)} />
      </Field>
      <Field label="Alış tarixi">
        <input
          className="input w-full"
          type="date"
          value={purchasedAt}
          onChange={(e) => setPurchasedAt(e.target.value)}
        />
      </Field>
      {err ? (
        <div className="text-meta" style={{ color: 'var(--danger, #B91C1C)' }}>
          {err}
        </div>
      ) : null}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn-outline" onClick={onClose}>
          Ləğv et
        </button>
        <button className="btn-primary" disabled={create.isPending} onClick={submit}>
          {create.isPending ? 'Yazılır…' : 'Yarat'}
        </button>
      </div>
    </Modal>
  );
}

function AssignModal({
  equipment,
  people,
  peopleById,
  onClose,
}: {
  equipment: Equipment;
  people: Profile[];
  peopleById: Map<string, Profile>;
  onClose: () => void;
}) {
  const assign = useAssignEquipment();
  const [target, setTarget] = useState<string>(equipment.assigned_to ?? '');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const currentOwner = equipment.assigned_to
    ? peopleById.get(equipment.assigned_to)
    : null;

  function submit() {
    setErr(null);
    assign.mutate(
      { id: equipment.id, toUserId: target || null, note: note.trim() || undefined },
      { onSuccess: onClose, onError: (e) => setErr((e as Error).message) },
    );
  }

  return (
    <Modal title={`Tapşır: ${equipment.name}`} onClose={onClose}>
      <p className="text-meta mb-3" style={{ color: 'var(--text-muted)' }}>
        Hazırda:{' '}
        {currentOwner ? currentOwner.full_name ?? currentOwner.email : 'tapşırılmayıb'}
      </p>
      <Field label="Yeni sahib">
        <select
          className="input w-full"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="">— Tapşırışı boşalt —</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name ?? p.email}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Qeyd (opsional)">
        <input className="input w-full" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {err ? (
        <div className="text-meta" style={{ color: 'var(--danger, #B91C1C)' }}>
          {err}
        </div>
      ) : null}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn-outline" onClick={onClose}>
          Ləğv et
        </button>
        <button className="btn-primary" disabled={assign.isPending} onClick={submit}>
          {assign.isPending ? 'Tapşırılır…' : 'Tapşır'}
        </button>
      </div>
    </Modal>
  );
}

function HistoryModal({
  equipment,
  peopleById,
  onClose,
}: {
  equipment: Equipment;
  peopleById: Map<string, Profile>;
  onClose: () => void;
}) {
  const { data: items = [], isLoading } = useEquipmentTransfers(equipment.id);
  return (
    <Modal title={`${equipment.name} — tarixçə`} onClose={onClose}>
      {equipment.purchased_at ? (
        <p className="text-meta mb-3" style={{ color: 'var(--text-muted)' }}>
          Alış: {formatDate(equipment.purchased_at)}
        </p>
      ) : null}
      {isLoading ? (
        <div className="text-meta">Yüklənir…</div>
      ) : items.length === 0 ? (
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Tapşırma tarixçəsi yoxdur.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((t) => {
            const fromName = t.from_user_id
              ? peopleById.get(t.from_user_id)?.full_name ??
                peopleById.get(t.from_user_id)?.email ??
                '—'
              : '—';
            const toName = t.to_user_id
              ? peopleById.get(t.to_user_id)?.full_name ??
                peopleById.get(t.to_user_id)?.email ??
                '—'
              : 'tapşırılmayıb';
            return (
              <li key={t.id} className="card" style={{ padding: 12 }}>
                <div className="text-body">
                  {fromName} → <strong>{toName}</strong>
                </div>
                <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                  {relativeTime(t.transferred_at)}
                </div>
                {t.note ? (
                  <div className="text-meta mt-1">{t.note}</div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex justify-end mt-4">
        <button className="btn-outline" onClick={onClose}>
          Bağla
        </button>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(14,22,17,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-surface p-6 rounded-card w-[480px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-h2 mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <div
        className="text-meta uppercase tracking-wider mb-1"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}
