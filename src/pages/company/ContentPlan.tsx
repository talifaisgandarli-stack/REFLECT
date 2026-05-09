/**
 * §9.3 Məzmun Planlaması — Editorial kanban: Idea → Draft → Review → Published.
 * content_plans table (migration 0010).
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { useAuth } from '@/lib/store';
import { useContentPlans, useUpdateContentStatus } from '@/lib/hooks';
import { formatDate } from '@/lib/format';

type Status = 'idea' | 'draft' | 'review' | 'published';

const COLUMNS: { key: Status; label: string }[] = [
  { key: 'idea', label: 'Idea' },
  { key: 'draft', label: 'Draft' },
  { key: 'review', label: 'Review' },
  { key: 'published', label: 'Published' },
];

const NEXT: Record<Status, Status | null> = {
  idea: 'draft',
  draft: 'review',
  review: 'published',
  published: null,
};

type Plan = {
  id: string;
  channel: string | null;
  scheduled_at: string | null;
  topic: string;
  owner_id: string | null;
  status: Status;
  body: string | null;
};

export function ContentPlanPage() {
  const { isAdmin } = useAuth();
  const list = useContentPlans();
  const updateStatus = useUpdateContentStatus();
  const [showForm, setShowForm] = useState(false);

  const items = (list.data ?? []) as Plan[];
  const byStatus = (s: Status) => items.filter((i) => i.status === s);

  return (
    <>
      <PageHead
        meta="MIRAI CMO + manual"
        title="Məzmun Planlaması"
        actions={
          isAdmin ? (
            <button className="btn-primary" onClick={() => setShowForm((p) => !p)}>
              + Məzmun postu
            </button>
          ) : null
        }
      />
      {showForm && isAdmin ? <CreateForm onDone={() => setShowForm(false)} /> : null}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {COLUMNS.map((col) => (
          <div key={col.key} className="card">
            <h3 className="text-h3 mb-3">
              {col.label}{' '}
              <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
                ({byStatus(col.key).length})
              </span>
            </h3>
            <ul className="space-y-2">
              {byStatus(col.key).map((p) => {
                const next = NEXT[p.status];
                return (
                  <li key={p.id} className="card" style={{ padding: 12 }}>
                    <div className="text-body font-medium">{p.topic}</div>
                    <div className="text-meta mt-1" style={{ color: 'var(--text-muted)' }}>
                      {p.channel ?? '—'}
                      {p.scheduled_at ? ` · ${formatDate(p.scheduled_at)}` : ''}
                    </div>
                    {next && isAdmin ? (
                      <button
                        type="button"
                        className="chip chip-brand mt-2"
                        onClick={() => updateStatus.mutate({ id: p.id, status: next })}
                      >
                        → {COLUMNS.find((c) => c.key === next)?.label}
                      </button>
                    ) : null}
                  </li>
                );
              })}
              {byStatus(col.key).length === 0 ? (
                <li className="text-meta" style={{ color: 'var(--text-muted)' }}>
                  Boş
                </li>
              ) : null}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [topic, setTopic] = useState('');
  const [channel, setChannel] = useState('');
  const [scheduled, setScheduled] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: async () => {
      if (!topic.trim()) throw new Error('Mövzu tələb olunur');
      const { error: e } = await supabase.from('content_plans').insert({
        topic: topic.trim(),
        channel: channel.trim() || null,
        scheduled_at: scheduled ? new Date(scheduled).toISOString() : null,
        body: body.trim() || null,
        owner_id: profile?.id,
        status: 'idea',
      });
      if (e) throw e;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['content-plans'] });
      onDone();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <form
      className="card mb-4 grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <input
        className="input"
        placeholder="Mövzu"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input
          className="input"
          placeholder="Kanal (Instagram, LinkedIn, ...)"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
        />
        <input
          className="input"
          type="datetime-local"
          value={scheduled}
          onChange={(e) => setScheduled(e.target.value)}
        />
      </div>
      <textarea
        className="input"
        rows={3}
        placeholder="Mətn (istəyə bağlı)"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {error ? (
        <div className="text-meta" style={{ color: 'var(--danger, #c33)' }}>
          {error}
        </div>
      ) : null}
      <div className="flex gap-2">
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
