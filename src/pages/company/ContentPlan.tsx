/**
 * Məzmun Planlaması — PRD §9.3 / Module 9.3
 * content_plans (id, channel, scheduled_at, topic, owner_id, status, body)
 * Admin only. Status: idea → draft → review → published.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import type { ContentChannel, ContentPlan, ContentStatus, Profile } from '@/types/db';

const STATUS_ORDER: ContentStatus[] = ['idea', 'draft', 'review', 'published'];
const STATUS_LABEL: Record<ContentStatus, string> = {
  idea: 'İdea',
  draft: 'Qaralama',
  review: 'Yoxlama',
  published: 'Dərc edildi',
};

const CHANNEL_LABEL: Record<ContentChannel, string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  telegram: 'Telegram',
  website: 'Vebsayt',
  email: 'Email',
  other: 'Digər',
};

const STATUS_COLOR: Record<ContentStatus, string> = {
  idea: 'var(--text-muted)',
  draft: '#D97706',
  review: '#2563EB',
  published: 'var(--brand-action)',
};

export function ContentPlanPage() {
  const { isAdmin, profile } = useAuth();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [filterStatus, setFilterStatus] = useState<ContentStatus | 'all'>('all');

  const plans = useQuery({
    queryKey: ['content-plans'],
    queryFn: async (): Promise<(ContentPlan & { owner?: Pick<Profile, 'id' | 'full_name' | 'email'> })[]> => {
      const { data, error } = await supabase
        .from('content_plans')
        .select('*, owner:profiles(id, full_name, email)')
        .order('scheduled_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as (ContentPlan & { owner?: Pick<Profile, 'id' | 'full_name' | 'email'> })[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ContentStatus }) => {
      const { error } = await supabase.from('content_plans').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content-plans'] }),
  });

  const filtered = (plans.data ?? []).filter(
    (p) => filterStatus === 'all' || p.status === filterStatus,
  );

  return (
    <>
      <PageHead
        meta="MIRAI CMO + manual"
        title="Məzmun Planlaması"
        actions={
          isAdmin ? (
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              + Məzmun postu
            </button>
          ) : null
        }
      />

      <div className="flex flex-wrap gap-2 mb-5">
        {(['all', ...STATUS_ORDER] as const).map((s) => (
          <button
            key={s}
            className={`chip ${filterStatus === s ? 'chip-brand' : ''}`}
            onClick={() => setFilterStatus(s)}
          >
            {s === 'all' ? 'Hamısı' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {plans.isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Məzmun cədvəli boşdur"
          body="Idea → Draft → Review → Published axını ilə məzmunları planlaşdırın."
          cta={isAdmin ? <button className="btn-primary" onClick={() => setShowCreate(true)}>+ Məzmun postu</button> : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <div key={p.id} className="card space-y-2" style={{ padding: 16 }}>
              <div className="flex items-center justify-between">
                <span className="chip text-meta">{CHANNEL_LABEL[p.channel]}</span>
                {isAdmin ? (
                  <select
                    className="text-meta"
                    style={{ background: 'transparent', border: 'none', color: STATUS_COLOR[p.status], cursor: 'pointer', fontWeight: 600 }}
                    value={p.status}
                    onChange={(e) => updateStatus.mutate({ id: p.id, status: e.target.value as ContentStatus })}
                  >
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-meta" style={{ color: STATUS_COLOR[p.status], fontWeight: 600 }}>
                    {STATUS_LABEL[p.status]}
                  </span>
                )}
              </div>
              <h3 className="text-h3">{p.topic}</h3>
              {p.body && (
                <p className="text-body" style={{ color: 'var(--text-soft)' }}>
                  {p.body.slice(0, 120)}{p.body.length > 120 ? '…' : ''}
                </p>
              )}
              <div className="flex items-center justify-between text-meta" style={{ color: 'var(--text-muted)' }}>
                <span>
                  {new Date(p.scheduled_at).toLocaleDateString('az-AZ', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Asia/Baku',
                  })}
                </span>
                <span>{(p as any).owner?.full_name ?? '—'}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && isAdmin && (
        <CreateContentModal
          ownerId={profile!.id}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['content-plans'] });
            setShowCreate(false);
          }}
        />
      )}
    </>
  );
}

function CreateContentModal({
  ownerId,
  onClose,
  onSaved,
}: {
  ownerId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [channel, setChannel] = useState<ContentChannel>('instagram');
  const [topic, setTopic] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<ContentStatus>('idea');

  const save = useMutation({
    mutationFn: async () => {
      const trimmedTopic = topic.trim();
      if (!trimmedTopic) throw new Error('Mövzu tələb olunur');
      if (!scheduledAt) throw new Error('Tarix tələb olunur');
      const { error } = await supabase.from('content_plans').insert({
        channel,
        scheduled_at: scheduledAt,
        topic: trimmedTopic,
        owner_id: ownerId,
        status,
        body: body.trim() || null,
        created_by: ownerId,
      });
      if (error) throw error;
    },
    onSuccess: onSaved,
  });

  return (
    <div
      role="dialog"
      aria-label="Yeni məzmun postu"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
        className="card w-full max-w-lg"
        style={{ padding: 24 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
      >
        <h2 className="text-h2 mb-4">Yeni məzmun postu</h2>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Kanal</span>
              <select className="input" value={channel} onChange={(e) => setChannel(e.target.value as ContentChannel)}>
                {(Object.entries(CHANNEL_LABEL) as [ContentChannel, string][]).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Status</span>
              <select className="input" value={status} onChange={(e) => setStatus(e.target.value as ContentStatus)}>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Mövzu *</span>
            <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} required placeholder="Post mövzusu…" autoFocus />
          </label>

          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Planlaşdırma tarixi *</span>
            <input
              type="datetime-local"
              className="input"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              required
            />
          </label>

          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Məzmun (könüllü)</span>
            <textarea
              className="input"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={{ minHeight: 96 }}
              placeholder="Post mətni, ideyalar, hashtags…"
            />
          </label>
        </div>

        {save.error ? <p className="text-meta mt-3" style={{ color: '#B91C1C' }}>{(save.error as Error).message}</p> : null}

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn-outline" onClick={onClose} disabled={save.isPending}>Geri</button>
          <button type="submit" className="btn-primary" disabled={save.isPending || !topic.trim()}>
            {save.isPending ? 'Yaradılır…' : 'Yarat'}
          </button>
        </div>
      </form>
    </div>
  );
}
