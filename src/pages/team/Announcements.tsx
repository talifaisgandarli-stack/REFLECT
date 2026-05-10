/**
 * US-ELAN-01 — admin publishes manual announcement (approved=true immediately)
 * US-ELAN-02 — admin approves/rejects MIRAI feed posts (mirai_feed_posts pending queue)
 * US-ELAN-03 — category filter pills (client-side, no reload)
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { relativeTime } from '@/lib/format';
import { useAuth } from '@/lib/store';
import { supabase } from '@/lib/supabase';

const CATEGORIES = ['Hamısı', 'Xəbər', 'Hadisə', 'Siyasət', 'Layihə', 'Trend', 'Opportunity', 'Digər'] as const;
type Category = (typeof CATEGORIES)[number];

export function AnnouncementsPage() {
  const { isAdmin, profile } = useAuth();
  const qc = useQueryClient();
  const [catFilter, setCatFilter] = useState<Category>('Hamısı');
  const [tab, setTab] = useState<'published' | 'pending'>('published');
  const [creating, setCreating] = useState(false);

  const announcements = useQuery({
    queryKey: ['announcements'],
    queryFn: async () =>
      (await supabase.from('announcements').select('*').eq('approved', true).order('published_at', { ascending: false }).limit(100)).data ?? [],
  });

  const pending = useQuery({
    queryKey: ['mirai_feed_posts', 'pending'],
    queryFn: async () =>
      (await supabase
        .from('mirai_feed_posts')
        .select('*')
        .is('posted_announcement_id', null)
        .is('rejected_at', null)
        .order('fetched_at', { ascending: false })
        .limit(50)
      ).data ?? [],
    enabled: !!isAdmin,
  });

  const approve = useMutation({
    mutationFn: async (post: { id: string; summary: string; source_url: string }) => {
      const { data, error } = await supabase.from('announcements').insert({
        title: post.summary.slice(0, 120),
        body: post.summary,
        category: 'Trend',
        mirai_generated: true,
        approved: true,
        approved_by: profile?.id,
        published_at: new Date().toISOString(),
      }).select('id').single();
      if (error) throw error;
      await supabase.from('mirai_feed_posts').update({ posted_announcement_id: data.id }).eq('id', post.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      qc.invalidateQueries({ queryKey: ['mirai_feed_posts', 'pending'] });
    },
  });

  const reject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('mirai_feed_posts')
        .update({ rejected_at: new Date().toISOString(), rejected_by: profile?.id ?? null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mirai_feed_posts', 'pending'] }),
  });

  const filtered = (announcements.data ?? []).filter(
    (a: any) => catFilter === 'Hamısı' || a.category === catFilter,
  );

  const unreadIds = filtered
    .filter((a: any) => profile?.id && !(a.read_by ?? {})[profile.id])
    .map((a: any) => a.id);

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!profile?.id || unreadIds.length === 0) return;
      const ts = new Date().toISOString();
      await Promise.all(
        unreadIds.map((id: string) => {
          const current = filtered.find((a: any) => a.id === id);
          const next = { ...(current?.read_by ?? {}), [profile.id]: ts };
          return supabase.from('announcements').update({ read_by: next }).eq('id', id);
        }),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });

  const toggleFeatured = useMutation({
    mutationFn: async ({ id, featured }: { id: string; featured: boolean }) => {
      const { error } = await supabase.from('announcements').update({ is_featured: featured }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });

  return (
    <>
      <PageHead
        meta="MIRAI feed + manual"
        title="Elanlar"
        actions={
          isAdmin ? (
            <button className="btn-primary" onClick={() => setCreating(true)}>+ Yeni elan</button>
          ) : null
        }
      />

      {/* US-ELAN-02 — pending tab for admin */}
      {isAdmin ? (
        <div className="flex gap-2 mb-4">
          {(['published', 'pending'] as const).map((t) => (
            <button key={t} className={`chip ${tab === t ? 'chip-brand' : ''}`} onClick={() => setTab(t)}>
              {t === 'published' ? 'Dərc olunmuş' : `Gözləyən MIRAI (${(pending.data ?? []).length})`}
            </button>
          ))}
        </div>
      ) : null}

      {/* US-ELAN-02 — MIRAI approval queue */}
      {isAdmin && tab === 'pending' ? (
        <div className="space-y-3">
          {(pending.data ?? []).length === 0 ? (
            <EmptyState title="Gözləyən post yoxdur" body="MIRAI yeni trend tap­dıq­da burada görünəcək." />
          ) : (
            (pending.data ?? []).map((p: any) => (
              <article key={p.id} className="card">
                <div className="flex items-start gap-2 mb-2">
                  <span className="chip">MIRAI · {p.source_kind}</span>
                  {p.deadline_at ? (
                    <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
                      Son tarix: {new Date(p.deadline_at).toLocaleDateString('az-AZ')}
                    </span>
                  ) : null}
                </div>
                <p className="text-body mb-3">{p.summary}</p>
                {p.source_url ? (
                  <a href={p.source_url} target="_blank" rel="noreferrer" className="text-meta" style={{ color: 'var(--brand-text)' }}>
                    Mənbə →
                  </a>
                ) : null}
                <div className="flex gap-2 mt-3">
                  <button
                    className="btn-primary"
                    disabled={approve.isPending}
                    onClick={() => approve.mutate({ id: p.id, summary: p.summary, source_url: p.source_url })}
                  >
                    Saxla / Paylaş
                  </button>
                  <button
                    className="btn-outline"
                    disabled={reject.isPending}
                    onClick={() => reject.mutate(p.id)}
                  >
                    Rədd et
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      ) : null}

      {/* US-ELAN-01/03 — published list with category filters */}
      {tab === 'published' ? (
        <>
          {/* US-ELAN-03 — category pills */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  className={`chip ${catFilter === c ? 'chip-brand' : ''}`}
                  onClick={() => setCatFilter(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            {unreadIds.length > 0 ? (
              <button
                className="text-meta"
                style={{ color: 'var(--brand-text)' }}
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
              >
                Hamısını oxunmuş işarələ ({unreadIds.length})
              </button>
            ) : null}
          </div>

          {filtered.length === 0 ? (
            <EmptyState title="Elan yoxdur" body="MIRAI CMO feed-dən təkliflər gəldikdə burada görünəcək." />
          ) : (
            <div className="space-y-3">
              {filtered.map((a: any) => (
                <article key={a.id} className="card">
                  <div className="flex items-center gap-2 mb-1">
                    {a.category ? <span className="chip text-meta" style={{ padding: '2px 6px', fontSize: 11 }}>{a.category}</span> : null}
                    {a.is_featured ? <span className="chip chip-brand text-meta" style={{ padding: '2px 6px', fontSize: 11 }}>Featured</span> : null}
                    {a.mirai_generated ? <span className="chip text-meta" style={{ padding: '2px 6px', fontSize: 11 }}>MIRAI</span> : null}
                  </div>
                  <h3 className="text-h3">{a.title}</h3>
                  <p className="text-body mt-1">{a.body}</p>
                  <div className="flex items-center justify-between mt-2 gap-3">
                    <span className="text-meta" style={{ color: 'var(--text-muted)' }}>{relativeTime(a.published_at)}</span>
                    {isAdmin ? (
                      <label className="text-meta flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!a.is_featured}
                          onChange={(e) => toggleFeatured.mutate({ id: a.id, featured: e.target.checked })}
                        />
                        Featured
                      </label>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      ) : null}

      {creating ? (
        <CreateAnnouncementModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['announcements'] });
            setCreating(false);
          }}
        />
      ) : null}
    </>
  );
}

function CreateAnnouncementModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { profile } = useAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<string>('Xəbər');

  const save = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error('Başlıq daxil edin');
      if (!body.trim()) throw new Error('Mətn daxil edin');
      const { error } = await supabase.from('announcements').insert({
        title: title.trim(),
        body: body.trim(),
        category,
        mirai_generated: false,
        approved: true,
        approved_by: profile?.id,
        created_by: profile?.id,
        published_at: new Date().toISOString(),
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
      <div className="bg-surface p-6 rounded-card w-[480px]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-h2 mb-4">Yeni elan</h2>

        <label className="block mb-3">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Başlıq</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Elan başlığı…" />
        </label>

        <label className="block mb-3">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Kateqoriya</span>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {(['Xəbər', 'Hadisə', 'Siyasət', 'Layihə', 'Digər'] as const).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>

        <label className="block mb-4">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Mətn</span>
          <textarea className="input w-full" rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Elanın məzmunu…" />
        </label>

        {save.error ? (
          <p className="text-meta mb-3" style={{ color: '#B91C1C' }}>{(save.error as Error).message}</p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button className="btn-outline" onClick={onClose}>Ləğv et</button>
          <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Dərc edilir…' : 'Dərc et'}
          </button>
        </div>
      </div>
    </div>
  );
}
