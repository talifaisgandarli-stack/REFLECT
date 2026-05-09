/**
 * Content planning kanban — PRD §9.3.
 * content_plans (id, channel, scheduled_at, topic, owner_id, status, body) — admin only.
 * Status flow: idea → draft → review → published.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/format';

const STATUSES = ['idea', 'draft', 'review', 'published'] as const;
type Status = (typeof STATUSES)[number];

const STATUS_LABEL: Record<Status, string> = {
  idea: 'Idea',
  draft: 'Draft',
  review: 'Review',
  published: 'Published',
};

type Plan = {
  id: string;
  channel: string;
  scheduled_at: string;
  topic: string;
  owner_id: string | null;
  status: string;
  body: string | null;
};

export function ContentPlanPage() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const plans = useQuery({
    queryKey: ['content_plans'],
    queryFn: async () =>
      ((
        await supabase
          .from('content_plans')
          .select('*')
          .order('scheduled_at', { ascending: true })
          .limit(500)
      ).data ?? []) as Plan[],
  });

  const advance = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const { error } = await supabase.from('content_plans').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content_plans'] }),
  });

  const grouped: Record<Status, Plan[]> = {
    idea: [],
    draft: [],
    review: [],
    published: [],
  };
  for (const p of plans.data ?? []) {
    const s = (STATUSES as readonly string[]).includes(p.status) ? (p.status as Status) : 'idea';
    grouped[s].push(p);
  }

  return (
    <>
      <PageHead
        meta="MIRAI CMO + manual"
        title="Məzmun Planlaması"
        actions={
          <button className="btn-primary" onClick={() => setOpen(true)}>
            + Məzmun postu
          </button>
        }
      />

      {(plans.data ?? []).length === 0 ? (
        <EmptyState
          title="Məzmun cədvəli boşdur"
          body="İlk postu əlavə edin və ya MIRAI trend feed-i gözləyin."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {STATUSES.map((s) => (
            <section key={s} className="card">
              <h3 className="text-h3 mb-3">
                {STATUS_LABEL[s]}{' '}
                <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
                  ({grouped[s].length})
                </span>
              </h3>
              <ul className="space-y-2">
                {grouped[s].map((p) => {
                  const idx = STATUSES.indexOf(s);
                  const next = idx < STATUSES.length - 1 ? STATUSES[idx + 1] : null;
                  return (
                    <li
                      key={p.id}
                      className="p-3 rounded"
                      style={{ border: '1px solid var(--line-soft)' }}
                    >
                      <div className="text-body font-medium">{p.topic}</div>
                      <div
                        className="text-meta"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {p.channel} · {formatDate(p.scheduled_at)}
                      </div>
                      {next ? (
                        <button
                          className="chip mt-2"
                          disabled={advance.isPending}
                          onClick={() => advance.mutate({ id: p.id, status: next })}
                        >
                          → {STATUS_LABEL[next]}
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {open ? <PlanAddModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function PlanAddModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [channel, setChannel] = useState('Instagram');
  const [topic, setTopic] = useState('');
  const [scheduledAt, setScheduledAt] = useState(new Date().toISOString().slice(0, 16));
  const [body, setBody] = useState('');

  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('content_plans').insert({
        channel,
        topic,
        scheduled_at: new Date(scheduledAt).toISOString(),
        body: body || null,
        status: 'idea',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['content_plans'] });
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
        <h3 className="text-h3">Yeni məzmun postu</h3>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Kanal
          </span>
          <input
            className="input mt-1 w-full"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Mövzu
          </span>
          <input
            className="input mt-1 w-full"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Planlaşdırılmış vaxt
          </span>
          <input
            type="datetime-local"
            className="input mt-1 w-full"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Mətn (opsional)
          </span>
          <textarea
            className="input mt-1 w-full"
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-outline" onClick={onClose}>
            Ləğv et
          </button>
          <button
            className="btn-primary"
            disabled={!topic || submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? '…' : 'Yadda saxla'}
          </button>
        </div>
      </div>
    </div>
  );
}
