/**
 * §8.6 Elanlar — manual posts + MIRAI auto-posts.
 * Categories: Xəbər/Hadisə/Siyasət/Layihə/Trend(MIRAI)/Opportunity(MIRAI)/Digər.
 * read_by jsonb keyed by user_id; "Hamısını oxunmuş işarələ" bulk action.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/store';
import { useMarkAnnouncementsRead } from '@/lib/hooks';
import { relativeTime } from '@/lib/format';

const CATEGORIES = ['Xəbər', 'Hadisə', 'Siyasət', 'Layihə', 'Trend', 'Opportunity', 'Digər'] as const;

type Announcement = {
  id: string;
  title: string;
  body: string | null;
  category: string | null;
  is_featured: boolean;
  mirai_generated: boolean;
  approved: boolean;
  read_by: Record<string, string> | null;
  published_at: string | null;
  created_at: string;
};

export function AnnouncementsPage() {
  const { isAdmin, profile } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread' | 'pending'>('all');

  const list = useQuery({
    queryKey: ['announcements', filter],
    queryFn: async () => {
      let q = supabase.from('announcements').select('*').order('published_at', { ascending: false }).limit(100);
      if (filter !== 'pending') q = q.eq('approved', true);
      else q = q.eq('approved', false);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Announcement[];
    },
  });

  const items = list.data ?? [];
  const unreadIds = profile?.id
    ? items.filter((a) => !(a.read_by ?? {})[profile.id]).map((a) => a.id)
    : [];
  const filtered =
    filter === 'unread'
      ? items.filter((a) => profile?.id && !(a.read_by ?? {})[profile.id])
      : items;

  const markRead = useMarkAnnouncementsRead();
  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('announcements')
        .update({ approved: true, approved_by: profile?.id, published_at: new Date().toISOString() })
        .eq('id', id);
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
            <button className="btn-primary" onClick={() => setShowForm((p) => !p)}>
              + Yeni elan
            </button>
          ) : null
        }
      />

      <div className="flex flex-wrap gap-2 mb-4">
        {(['all', 'unread', 'pending'] as const).map((f) => (
          <button
            key={f}
            className={`chip ${filter === f ? 'chip-brand' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'Hamısı' : f === 'unread' ? `Oxunmamış (${unreadIds.length})` : 'MIRAI gözləyən'}
          </button>
        ))}
        {unreadIds.length > 0 ? (
          <button className="chip" onClick={() => markRead.mutate(unreadIds)}>
            Hamısını oxunmuş işarələ
          </button>
        ) : null}
      </div>

      {showForm && isAdmin ? <CreateAnnouncementForm onDone={() => setShowForm(false)} /> : null}

      {filtered.length === 0 ? (
        <EmptyState title="Elan yoxdur" body="MIRAI CMO trend feed-dən təkliflər doldurmağa başlayanda burada görünəcək." />
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => {
            const isRead = !!(profile?.id && (a.read_by ?? {})[profile.id]);
            return (
              <article
                key={a.id}
                className="card"
                style={{ borderColor: isRead ? 'var(--line)' : 'var(--brand-action)' }}
              >
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {a.is_featured ? <span className="chip chip-brand">Featured</span> : null}
                  {a.mirai_generated ? <span className="chip">MIRAI</span> : null}
                  {a.category ? <span className="chip">{a.category}</span> : null}
                  {!a.approved ? (
                    <span className="chip" style={{ color: 'var(--danger, #c33)' }}>
                      Gözləyir
                    </span>
                  ) : null}
                </div>
                <h3 className="text-h3">{a.title}</h3>
                {a.body ? <p className="text-body mt-1">{a.body}</p> : null}
                <div className="flex items-center justify-between mt-2">
                  <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                    {relativeTime(a.published_at ?? a.created_at)}
                  </div>
                  <div className="flex gap-2">
                    {!isRead && a.approved ? (
                      <button className="chip" onClick={() => markRead.mutate([a.id])}>
                        Oxunmuş işarələ
                      </button>
                    ) : null}
                    {!a.approved && isAdmin ? (
                      <button className="chip chip-brand" onClick={() => approve.mutate(a.id)}>
                        Təsdiqlə
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

function CreateAnnouncementForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<string>('Xəbər');
  const [featured, setFeatured] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error('Başlıq tələb olunur');
      const { error: e } = await supabase.from('announcements').insert({
        title: title.trim(),
        body: body.trim() || null,
        category,
        is_featured: featured,
        mirai_generated: false,
        approved: true,
        approved_by: profile?.id,
        created_by: profile?.id,
        published_at: new Date().toISOString(),
      });
      if (e) throw e;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
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
        placeholder="Başlıq"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="input"
        rows={3}
        placeholder="Mətn"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`chip ${category === c ? 'chip-brand' : ''}`}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <label className="text-meta flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
        <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
        Featured
      </label>
      {error ? (
        <div className="text-meta" style={{ color: 'var(--danger, #c33)' }}>
          {error}
        </div>
      ) : null}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={create.isPending}>
          Dərc et
        </button>
        <button type="button" className="btn-outline" onClick={onDone}>
          Ləğv
        </button>
      </div>
    </form>
  );
}
