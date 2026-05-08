import { useMemo, useState } from 'react';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import {
  CONTENT_CHANNELS,
  useActiveProfiles,
  useContentPlans,
  useCreateContentPlan,
  useDeleteContentPlan,
  useUpdateContentPlanStatus,
} from '@/lib/hooks';
import type { ContentPlan, ContentStatus, Profile } from '@/types/db';
import { formatDate } from '@/lib/format';

const STATUS_ORDER: ContentStatus[] = ['idea', 'draft', 'review', 'published'];
const STATUS_LABEL: Record<ContentStatus, string> = {
  idea: 'İdeya',
  draft: 'Qaralama',
  review: 'Yoxlamada',
  published: 'Yayımlanıb',
};

export function ContentPlanPage() {
  const { data: rows = [], isLoading } = useContentPlans();
  const { data: people = [] } = useActiveProfiles();
  const update = useUpdateContentPlanStatus();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<ContentPlan | null>(null);

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const grouped = useMemo(() => {
    const m: Record<ContentStatus, ContentPlan[]> = {
      idea: [],
      draft: [],
      review: [],
      published: [],
    };
    for (const r of rows) m[r.status].push(r);
    return m;
  }, [rows]);

  function move(id: string, to: ContentStatus, from: ContentStatus) {
    if (to === from) return;
    update.mutate({ id, status: to });
  }

  return (
    <>
      <PageHead
        meta={`${rows.length} qeyd`}
        title="Məzmun Planlaması"
        actions={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            + Məzmun postu
          </button>
        }
      />

      {isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Məzmun cədvəli boşdur"
          body="İlk postu yarat — İdeya → Qaralama → Yoxlamada → Yayımlanıb axını avtomatik."
          cta={
            <button className="btn-primary" onClick={() => setCreating(true)}>
              + Məzmun postu
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {STATUS_ORDER.map((s) => (
            <div
              key={s}
              className="rounded-card p-3"
              style={{ border: '1px dashed var(--line)', minHeight: 320 }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const raw = e.dataTransfer.getData('text/plain');
                if (!raw) return;
                const { id, from } = JSON.parse(raw) as { id: string; from: ContentStatus };
                move(id, s, from);
              }}
            >
              <h3
                className="text-tiny uppercase tracking-wider mb-3"
                style={{ color: 'var(--text-muted)' }}
              >
                {STATUS_LABEL[s]} · {grouped[s].length}
              </h3>
              <ul className="space-y-2">
                {grouped[s].map((r) => (
                  <li key={r.id}>
                    <button
                      className="card text-left w-full"
                      style={{ padding: 12, cursor: 'grab' }}
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData(
                          'text/plain',
                          JSON.stringify({ id: r.id, from: r.status }),
                        )
                      }
                      onClick={() => setOpen(r)}
                    >
                      <div className="text-body font-medium">{r.topic}</div>
                      <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                        {r.channel}
                        {r.scheduled_at ? ` · ${formatDate(r.scheduled_at)}` : ''}
                      </div>
                      {r.owner_id ? (
                        <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                          {peopleById.get(r.owner_id)?.full_name ??
                            peopleById.get(r.owner_id)?.email ??
                            '—'}
                        </div>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {creating ? <CreateModal people={people} onClose={() => setCreating(false)} /> : null}
      {open ? (
        <DetailModal
          plan={open}
          person={open.owner_id ? peopleById.get(open.owner_id) ?? null : null}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

function CreateModal({
  people,
  onClose,
}: {
  people: Profile[];
  onClose: () => void;
}) {
  const create = useCreateContentPlan();
  const [channel, setChannel] = useState<string>(CONTENT_CHANNELS[0]);
  const [topic, setTopic] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [ownerId, setOwnerId] = useState<string>('');
  const [status, setStatus] = useState<ContentStatus>('draft');
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    setErr(null);
    if (!topic.trim()) return setErr('Mövzu lazımdır.');
    create.mutate(
      {
        channel,
        topic: topic.trim(),
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        owner_id: ownerId || null,
        status,
        body: body.trim() || null,
      },
      { onSuccess: onClose, onError: (e) => setErr((e as Error).message) },
    );
  }

  return (
    <Modal title="+ Məzmun postu" onClose={onClose}>
      <Field label="Kanal">
        <select
          className="input w-full"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
        >
          {CONTENT_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Mövzu">
        <input
          className="input w-full"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          autoFocus
        />
      </Field>
      <Field label="Planlaşdırılan tarix">
        <input
          className="input w-full"
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
        />
      </Field>
      <Field label="Sahib">
        <select
          className="input w-full"
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
        >
          <option value="">— Seç —</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name ?? p.email}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Status">
        <select
          className="input w-full"
          value={status}
          onChange={(e) => setStatus(e.target.value as ContentStatus)}
        >
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Mətn (opsional)">
        <textarea
          className="input w-full"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
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

function DetailModal({
  plan,
  person,
  onClose,
}: {
  plan: ContentPlan;
  person: Profile | null;
  onClose: () => void;
}) {
  const del = useDeleteContentPlan();
  return (
    <Modal title={plan.topic} onClose={onClose}>
      <div className="text-meta mb-3" style={{ color: 'var(--text-muted)' }}>
        {plan.channel}
        {plan.scheduled_at ? ` · ${formatDate(plan.scheduled_at)}` : ''} ·{' '}
        {STATUS_LABEL[plan.status]}
      </div>
      {person ? (
        <div className="text-body mb-3">
          Sahib: {person.full_name ?? person.email}
        </div>
      ) : null}
      {plan.body ? (
        <p className="text-body whitespace-pre-wrap">{plan.body}</p>
      ) : (
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Mətn yoxdur.
        </p>
      )}
      <div className="flex justify-end gap-2 mt-4">
        <button
          className="btn-outline"
          style={{ color: 'var(--danger, #B91C1C)' }}
          disabled={del.isPending}
          onClick={() => {
            if (!confirm('Postu silmək istəyirsən?')) return;
            del.mutate(plan.id, { onSuccess: onClose });
          }}
        >
          Sil
        </button>
        <button className="btn-primary" onClick={onClose}>
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
