/**
 * Elanlar (PRD §M8.6).
 * - Tabs: Approved (everyone) / Pending — admin moderation queue
 *   (mirai_generated drafts + any admin-flagged "approved=false")
 * - Read tracking via read_by jsonb keyed by user_id
 * - "Hamısını oxunmuş işarələ" bulk action
 * - + Yeni elan modal (admin only — auto-approves manual posts)
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { PageHead } from '@/components/PageHead';
import { useT } from '@/lib/i18n';
import { EmptyState } from '@/components/EmptyState';
import { relativeTime } from '@/lib/format';

type AnnouncementRow = {
  id: string;
  title: string;
  body: string | null;
  category: string | null;
  cover_url: string | null;
  is_featured: boolean;
  mirai_generated: boolean;
  approved: boolean;
  published_at: string | null;
  read_by: Record<string, string>;
  created_by: string | null;
  created_at: string;
};

const CATEGORIES = ['Xəbər', 'Hadisə', 'Siyasət', 'Layihə', 'Trend', 'Opportunity', 'Digər'] as const;

export function AnnouncementsPage() {
  const t = useT();
  const { isAdmin, profile } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'approved' | 'pending'>('approved');
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: ['announcements', tab],
    queryFn: async (): Promise<AnnouncementRow[]> => {
      const q = supabase
        .from('announcements')
        .select('*')
        .eq('approved', tab === 'approved')
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(60);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AnnouncementRow[];
    },
  });

  const unreadIds = useMemo(() => {
    if (!profile?.id) return [] as string[];
    return (list.data ?? [])
      .filter((a) => a.approved && !a.read_by?.[profile.id])
      .map((a) => a.id);
  }, [list.data, profile?.id]);

  const markRead = useMutation({
    mutationFn: async (input: { id?: string; all?: boolean }) => {
      if (!profile?.id) return;
      const stamp = new Date().toISOString();
      const ids = input.all ? unreadIds : input.id ? [input.id] : [];
      if (ids.length === 0) return;
      // Optimistic: read_by jsonb merge requires a server function; we patch
      // each row by reading current value. Acceptable for the inbox-sized list.
      for (const id of ids) {
        const row = (list.data ?? []).find((a) => a.id === id);
        if (!row) continue;
        const next = { ...(row.read_by ?? {}), [profile.id]: stamp };
        await supabase.from('announcements').update({ read_by: next }).eq('id', id);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('announcements')
        .update({
          approved: true,
          approved_by: profile?.id ?? null,
          published_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });

  const reject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('announcements').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });

  // Auto-mark items as read on click — but only when in the approved tab
  // and the user is opening that specific row's body.
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (!openId || !profile?.id) return;
    const row = (list.data ?? []).find((a) => a.id === openId);
    if (row && row.approved && !row.read_by?.[profile.id]) {
      markRead.mutate({ id: openId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  return (
    <>
      <PageHead
        meta="MIRAI feed + manual"
        title={t('nav.team.announcements')}
        actions={
          <>
            {tab === 'approved' && unreadIds.length > 0 ? (
              <button
                className="btn-outline"
                onClick={() => markRead.mutate({ all: true })}
                disabled={markRead.isPending}
              >
                Hamısını oxunmuş işarələ ({unreadIds.length})
              </button>
            ) : null}
            {isAdmin ? (
              <button className="btn-primary" onClick={() => setCreating(true)}>
                + Yeni elan
              </button>
            ) : null}
          </>
        }
      />

      {isAdmin ? (
        <div className="flex gap-2 mb-4">
          {(['approved', 'pending'] as const).map((t) => (
            <button
              key={t}
              className={`chip ${tab === t ? 'chip-brand' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'approved' ? 'Yayımlanmış' : 'Təsdiq gözləyən'}
              {t === 'pending' && (list.data?.length ?? 0) > 0 && tab === t
                ? ` · ${list.data?.length}`
                : ''}
            </button>
          ))}
        </div>
      ) : null}

      {(list.data ?? []).length === 0 ? (
        <EmptyState
          title={tab === 'approved' ? 'Elan yoxdur' : 'Təsdiq gözləyən yoxdur'}
          body={
            tab === 'approved'
              ? 'MIRAI CMO trend feed-dən təkliflər doldurmağa başlayanda burada görünəcək.'
              : 'MIRAI gətirdiyi qaralamalar və əl ilə yaradılmış qeyri-aktiv elanlar burada görünür.'
          }
        />
      ) : (
        <div className="space-y-3">
          {(list.data ?? []).map((a) => {
            const isUnread =
              tab === 'approved' && profile?.id ? !a.read_by?.[profile.id] : false;
            const isPending = tab === 'pending';
            return (
              <article
                key={a.id}
                className="card"
                style={{
                  borderLeft: isUnread
                    ? '3px solid var(--brand-action)'
                    : '1px solid var(--line)',
                  cursor: tab === 'approved' ? 'pointer' : 'default',
                }}
                onClick={() => tab === 'approved' && setOpenId(a.id)}
              >
                <div className="flex items-center gap-2 mb-1">
                  {a.is_featured ? <span className="chip chip-brand">Featured</span> : null}
                  {a.mirai_generated ? (
                    <span
                      className="chip"
                      style={{
                        background: 'rgba(173,251,73,0.12)',
                        color: 'var(--brand-text)',
                      }}
                    >
                      MIRAI
                    </span>
                  ) : null}
                  {a.category ? <span className="chip">{a.category}</span> : null}
                  {isUnread ? (
                    <span
                      className="text-tiny font-medium"
                      style={{
                        color: 'var(--brand-text)',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Yeni
                    </span>
                  ) : null}
                </div>
                <h3 className="text-h3">{a.title}</h3>
                {a.body ? (
                  <p className="text-body mt-1 whitespace-pre-wrap">{a.body}</p>
                ) : null}
                <div className="flex items-center justify-between mt-3">
                  <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
                    {relativeTime(a.published_at ?? a.created_at)}
                  </span>
                  {isPending && isAdmin ? (
                    <span className="flex gap-2">
                      <button
                        type="button"
                        className="chip chip-brand"
                        onClick={(e) => {
                          e.stopPropagation();
                          approve.mutate(a.id);
                        }}
                      >
                        Təsdiqlə
                      </button>
                      <button
                        type="button"
                        className="chip"
                        style={{ background: '#FEEEED', color: '#B91C1C' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          reject.mutate(a.id);
                        }}
                      >
                        Sil
                      </button>
                    </span>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {creating && isAdmin ? (
        <AnnouncementModal
          onClose={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ['announcements'] });
          }}
        />
      ) : null}
    </>
  );
}

function AnnouncementModal({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [featured, setFeatured] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error('Başlıq tələb olunur');
      const { error } = await supabase.from('announcements').insert({
        title: title.trim(),
        body: body.trim() || null,
        category,
        is_featured: featured,
        approved: true,
        approved_by: profile?.id ?? null,
        created_by: profile?.id ?? null,
        published_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: onClose,
  });

  return (
    <div
      role="dialog"
      aria-label="Yeni elan"
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
        <h2 className="text-h2">+ Yeni elan</h2>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Başlıq
            </span>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              required
            />
          </label>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Mətn
            </span>
            <textarea
              className="input"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={{ minHeight: 140, padding: '12px 14px', whiteSpace: 'pre-wrap' }}
            />
          </label>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Kateqoriya
            </span>
            <select
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={featured}
              onChange={(e) => setFeatured(e.target.checked)}
            />
            <span className="text-body">Featured (ən üstdə dəyşmir)</span>
          </label>
        </div>

        {save.error ? (
          <p className="text-meta mt-3" style={{ color: '#B91C1C' }}>
            {(save.error as Error).message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn-outline" onClick={onClose} disabled={save.isPending}>
            Geri
          </button>
          <button type="submit" className="btn-primary" disabled={save.isPending || !title}>
            {save.isPending ? 'Yayımlanır…' : 'Yayımla'}
          </button>
        </div>
      </form>
    </div>
  );
}
