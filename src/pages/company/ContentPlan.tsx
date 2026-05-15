/**
 * PRD §9.3 — US-CONTENT-01
 * content_plans (id, channel, scheduled_at, topic, owner_id, status, body)
 * Admin-only editorial calendar; kanban: idea → draft → review → published.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';

type ContentStatus = 'idea' | 'draft' | 'review' | 'published';

type ContentPlan = {
  id: string;
  channel: string;
  scheduled_at: string | null;
  topic: string;
  owner_id: string | null;
  status: ContentStatus;
  body: string | null;
  created_at: string;
  profiles?: { full_name: string | null } | null;
};

const STATUSES: { key: ContentStatus; label: string }[] = [
  { key: 'idea', label: 'İdea' },
  { key: 'draft', label: 'Qaralama' },
  { key: 'review', label: 'İcmal' },
  { key: 'published', label: 'Paylaşıldı' },
];

const CHANNELS = ['Instagram', 'LinkedIn', 'Website', 'Newsletter', 'YouTube', 'Digər'];

export function ContentPlanPage() {
  const { isAdmin, profile } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['content_plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_plans')
        .select('*, profiles(full_name)')
        .order('scheduled_at', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as ContentPlan[];
    },
    enabled: !!isAdmin,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ContentStatus }) => {
      const { error } = await supabase
        .from('content_plans')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content_plans'] }),
  });

  const grouped = STATUSES.reduce(
    (acc, s) => ({ ...acc, [s.key]: plans.filter((p) => p.status === s.key) }),
    {} as Record<ContentStatus, ContentPlan[]>,
  );

  if (!isAdmin) {
    return (
      <>
        <PageHead meta="MIRAI CMO + manual" title="Məzmun Planlaması" />
        <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
          Bu bölmə yalnız adminlər üçündür.
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead
        meta="MIRAI CMO + manual"
        title="Məzmun Planlaması"
        actions={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            + Məzmun postu
          </button>
        }
      />

      {isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {STATUSES.map((s) => (
            <div key={s.key}>
              <h3
                className="text-meta uppercase tracking-wider mb-3"
                style={{ color: 'var(--text-muted)' }}
              >
                {s.label} ({grouped[s.key].length})
              </h3>
              <div className="space-y-2">
                {grouped[s.key].map((p) => (
                  <div key={p.id} className="card" style={{ padding: 12 }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="chip text-meta"
                        style={{ padding: '2px 6px', fontSize: 11 }}
                      >
                        {p.channel}
                      </span>
                    </div>
                    <p className="text-body font-medium leading-tight">{p.topic}</p>
                    {p.scheduled_at ? (
                      <p className="text-meta mt-1" style={{ color: 'var(--text-muted)' }}>
                        {new Date(p.scheduled_at).toLocaleDateString('az-AZ')}
                      </p>
                    ) : null}
                    {p.profiles?.full_name ? (
                      <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
                        {p.profiles.full_name}
                      </p>
                    ) : null}
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {STATUSES.filter((st) => st.key !== p.status).map((st) => (
                        <button
                          key={st.key}
                          type="button"
                          className="chip"
                          style={{ padding: '2px 6px', fontSize: 11, background: 'var(--surface)' }}
                          onClick={() => updateStatus.mutate({ id: p.id, status: st.key })}
                        >
                          → {st.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {grouped[s.key].length === 0 ? (
                  <div
                    className="rounded-card px-3 py-6 text-center text-meta"
                    style={{ border: '1px dashed var(--line)', color: 'var(--text-muted)' }}
                  >
                    Boş
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {creating ? (
        <CreateContentModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['content_plans'] });
            setCreating(false);
          }}
        />
      ) : null}
    </>
  );
}

function CreateContentModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [channel, setChannel] = useState(CHANNELS[0]);
  const [topic, setTopic] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [body, setBody] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      if (!topic.trim()) throw new Error('Mövzu daxil edin');
      const { error } = await supabase.from('content_plans').insert({
        channel,
        topic: topic.trim(),
        scheduled_at: scheduledAt || null,
        owner_id: profile?.id,
        status: 'idea',
        body: body.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: onSaved,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(14,22,17,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-surface p-6 rounded-card w-[440px]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-h2 mb-4">Məzmun postu</h2>

        <label className="block mb-3">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Kanal</span>
          <select className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>
            {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <label className="block mb-3">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Mövzu</span>
          <input
            className="input"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Yeni layihəmizi açıqlayırıq…"
          />
        </label>

        <label className="block mb-3">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
            Planlaşdırılan tarix
          </span>
          <input
            type="date" className="input"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </label>

        <label className="block mb-4">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
            Mətn (istəyə bağlı)
          </span>
          <textarea
            className="input" rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>

        {save.error ? (
          <p className="text-meta mb-3" style={{ color: 'var(--error-deep)' }}>
            {(save.error as Error).message}
          </p>
        ) : null}

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
