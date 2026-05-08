import { useMemo, useState } from 'react';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { relativeTime } from '@/lib/format';
import {
  ANNOUNCEMENT_CATEGORIES,
  useAnnouncements,
  useCreateAnnouncement,
  useMarkAnnouncementRead,
  type AnnouncementCategory,
} from '@/lib/hooks';
import { useAuth } from '@/lib/store';
import type { Announcement } from '@/types/db';

export function AnnouncementsPage() {
  const { isAdmin, profile } = useAuth();
  const { data: items = [], isLoading } = useAnnouncements();
  const [filter, setFilter] = useState<'all' | AnnouncementCategory>('all');
  const [creating, setCreating] = useState(false);

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter((a) => a.category === filter)),
    [items, filter],
  );

  const unreadCount = useMemo(
    () => (profile?.id ? items.filter((a) => !a.read_by?.[profile.id]).length : 0),
    [items, profile?.id],
  );

  return (
    <>
      <PageHead
        meta={`${items.length} elan${unreadCount > 0 ? ` · ${unreadCount} oxunmamış` : ''}`}
        title="Elanlar"
        actions={
          isAdmin ? (
            <button className="btn-primary" onClick={() => setCreating(true)}>
              + Yeni elan
            </button>
          ) : null
        }
      />

      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          className={`chip ${filter === 'all' ? 'chip-brand' : ''}`}
          onClick={() => setFilter('all')}
        >
          Hamısı
        </button>
        {ANNOUNCEMENT_CATEGORIES.map((c) => (
          <button
            key={c}
            className={`chip ${filter === c ? 'chip-brand' : ''}`}
            onClick={() => setFilter(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : visible.length === 0 ? (
        <EmptyState
          title={filter === 'all' ? 'Elan yoxdur' : `"${filter}" üzrə elan yoxdur`}
          body="Admin manual elan əlavə edə və ya MIRAI CMO feed-i moderasiya edib paylaşa bilər."
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((a) => (
            <AnnouncementCard key={a.id} item={a} userId={profile?.id} />
          ))}
        </ul>
      )}

      {creating ? <CreateModal onClose={() => setCreating(false)} /> : null}
    </>
  );
}

function AnnouncementCard({
  item,
  userId,
}: {
  item: Announcement;
  userId: string | undefined;
}) {
  const mark = useMarkAnnouncementRead();
  const [open, setOpen] = useState(false);
  const isUnread = !!userId && !item.read_by?.[userId];

  function expand() {
    setOpen((v) => !v);
    if (isUnread && userId) {
      mark.mutate({ id: item.id, userId, readBy: item.read_by ?? {} });
    }
  }

  return (
    <li>
      <article
        className="card"
        style={{
          borderLeft: isUnread ? '4px solid var(--brand-action)' : '4px solid transparent',
          padding: 16,
        }}
      >
        <button
          type="button"
          className="w-full text-left"
          onClick={expand}
          aria-expanded={open}
        >
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {item.is_featured ? <span className="chip chip-brand">Featured</span> : null}
            {item.mirai_generated ? <span className="chip">MIRAI</span> : null}
            {item.category ? <span className="chip">{item.category}</span> : null}
            {isUnread ? (
              <span
                className="chip"
                style={{ background: 'var(--brand-action)', color: 'var(--ink)' }}
              >
                Yeni
              </span>
            ) : null}
          </div>
          <h3 className="text-h3">{item.title}</h3>
          <div className="text-meta mt-1" style={{ color: 'var(--text-muted)' }}>
            {relativeTime(item.published_at)}
          </div>
        </button>
        {open && item.body ? (
          <p className="text-body mt-3 whitespace-pre-wrap">{item.body}</p>
        ) : null}
        {open && item.cover_url ? (
          <img
            src={item.cover_url}
            alt=""
            className="mt-3 rounded-card"
            style={{ maxWidth: '100%', maxHeight: 360 }}
          />
        ) : null}
      </article>
    </li>
  );
}

function CreateModal({ onClose }: { onClose: () => void }) {
  const create = useCreateAnnouncement();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<AnnouncementCategory>('Xəbər');
  const [coverUrl, setCoverUrl] = useState('');
  const [featured, setFeatured] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    setErr(null);
    if (!title.trim()) return setErr('Başlıq boş ola bilməz.');
    create.mutate(
      {
        title: title.trim(),
        body: body.trim(),
        category,
        cover_url: coverUrl.trim() || null,
        is_featured: featured,
      },
      { onSuccess: onClose, onError: (e) => setErr((e as Error).message) },
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(14,22,17,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-surface p-6 rounded-card w-[520px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-h2 mb-4">+ Yeni elan</h2>
        <Field label="Başlıq">
          <input
            className="input w-full"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Kateqoriya">
          <select
            className="input w-full"
            value={category}
            onChange={(e) => setCategory(e.target.value as AnnouncementCategory)}
          >
            {ANNOUNCEMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mətn">
          <textarea
            className="input w-full"
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>
        <Field label="Cover URL (opsional)">
          <input
            className="input w-full"
            value={coverUrl}
            onChange={(e) => setCoverUrl(e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 mb-3">
          <input
            type="checkbox"
            checked={featured}
            onChange={(e) => setFeatured(e.target.checked)}
          />
          <span className="text-body">Featured (səhifə başında saxla)</span>
        </label>
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
            {create.isPending ? 'Paylaşılır…' : 'Paylaş'}
          </button>
        </div>
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
