/**
 * Announcements — PRD §8.6.
 * Manual posts + MIRAI auto-posts. Manual creates require admin approval before
 * showing to all (RLS allows non-approved rows visible only to creator+admin in 0002).
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { relativeTime } from '@/lib/format';
import { useAuth } from '@/lib/store';

const CATEGORIES = ['Xəbər', 'Hadisə', 'Siyasət', 'Layihə', 'Trend', 'Opportunity', 'Digər'];

type Announcement = {
  id: string;
  title: string;
  body: string | null;
  category: string | null;
  is_featured: boolean;
  mirai_generated: boolean;
  approved: boolean;
  published_at: string | null;
};

export function AnnouncementsPage() {
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ['announcements'],
    queryFn: async () =>
      ((
        await supabase
          .from('announcements')
          .select('*')
          .order('published_at', { ascending: false })
          .limit(100)
      ).data ?? []) as Announcement[],
  });

  return (
    <>
      <PageHead
        meta="MIRAI feed + manual"
        title="Elanlar"
        actions={
          <button className="btn-primary" onClick={() => setOpen(true)}>
            + Yeni elan
          </button>
        }
      />
      {(q.data ?? []).length === 0 ? (
        <EmptyState
          title="Elan yoxdur"
          body="İlk elanı paylaşın və ya MIRAI CMO trend feed-i gözləyin."
        />
      ) : (
        <div className="space-y-3">
          {(q.data ?? []).map((a) => (
            <article key={a.id} className="card">
              <div className="flex items-center gap-2 mb-1">
                {a.is_featured ? <span className="chip chip-brand">Featured</span> : null}
                {a.mirai_generated ? <span className="chip">MIRAI</span> : null}
                {!a.approved ? <span className="chip">Təsdiq gözləyir</span> : null}
                {a.category ? <span className="chip">{a.category}</span> : null}
              </div>
              <h3 className="text-h3">{a.title}</h3>
              {a.body ? <p className="text-body mt-1">{a.body}</p> : null}
              <div className="flex items-center justify-between mt-2">
                <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                  {relativeTime(a.published_at)}
                </div>
                {isAdmin && !a.approved ? <ApproveButton id={a.id} /> : null}
              </div>
            </article>
          ))}
        </div>
      )}

      {open ? <AnnouncementCreateModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ApproveButton({ id }: { id: string }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('announcements')
        .update({ approved: true, published_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });
  return (
    <button className="chip chip-brand" disabled={m.isPending} onClick={() => m.mutate()}>
      Təsdiqlə
    </button>
  );
}

function AnnouncementCreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { isAdmin, session } = useAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!session?.userId) throw new Error('No session');
      const { error } = await supabase.from('announcements').insert({
        title,
        body: body || null,
        category,
        created_by: session.userId,
        // Admins auto-approve their own posts; others wait in the queue.
        approved: isAdmin,
        published_at: isAdmin ? new Date().toISOString() : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
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
        <h3 className="text-h3">Yeni elan</h3>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Başlıq
          </span>
          <input
            className="input mt-1 w-full"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Kateqoriya
          </span>
          <select
            className="input mt-1 w-full"
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
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Mətn
          </span>
          <textarea
            className="input mt-1 w-full"
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        {!isAdmin ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Bu post adminin təsdiqindən sonra yayımlanacaq.
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-outline" onClick={onClose}>
            Ləğv et
          </button>
          <button
            className="btn-primary"
            disabled={!title || submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? '…' : 'Yarat'}
          </button>
        </div>
      </div>
    </div>
  );
}
