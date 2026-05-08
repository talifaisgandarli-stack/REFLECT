/**
 * Task comments slide-in panel — REQ-TASK-07.
 *
 * Loaded by clicking "Detallar" on a task card. Renders the comment thread
 * for one task; the DB trigger from migration 0012 handles mention parsing
 * and notification fan-out, so the client just sets `body`.
 *
 * Mention rendering: tokens that match an active profile.full_name are
 * shown as a brand-tinted chip; unmatched @<text> stays as plain text.
 * The matching is approximate (case-insensitive exact full_name) so rare
 * collisions render as plain text — same rule the trigger applies.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import {
  useAddComment,
  useDeleteComment,
  useTaskComments,
  type TaskCommentRow,
} from '@/lib/comments';
import { ValidationError } from '@/lib/finance';
import { relativeTime } from '@/lib/format';
import type { Profile } from '@/types/db';

export function TaskCommentsPanel({
  taskId,
  taskTitle,
  onClose,
}: {
  taskId: string;
  taskTitle: string;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const comments = useTaskComments(taskId);
  const add = useAddComment(taskId);
  const del = useDeleteComment(taskId);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const profilesQ = useQuery({
    queryKey: ['profiles', 'active'],
    queryFn: async (): Promise<Profile[]> =>
      ((await supabase.from('profiles').select('*').eq('is_active', true)).data ?? []) as Profile[],
  });

  const profileById = useMemo(() => {
    const map = new Map<string, Profile>();
    for (const p of profilesQ.data ?? []) map.set(p.id, p);
    return map;
  }, [profilesQ.data]);

  // Lower-cased full_name → profile, for the body-rendering mention pass.
  const profileByName = useMemo(() => {
    const map = new Map<string, Profile>();
    for (const p of profilesQ.data ?? []) {
      if (p.full_name) map.set(p.full_name.toLowerCase(), p);
    }
    return map;
  }, [profilesQ.data]);

  async function onSubmit() {
    setErr(null);
    try {
      await add.mutateAsync(draft);
      setDraft('');
    } catch (e) {
      setErr(e instanceof ValidationError ? e.message : (e as Error).message);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <aside
        className="w-[480px] h-full bg-surface flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-5 border-b" style={{ borderColor: 'var(--line-soft)' }}>
          <div className="text-meta" style={{ color: 'var(--text-muted)' }}>Tapşırıq</div>
          <h2 className="text-h3 mt-1 truncate">{taskTitle}</h2>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {comments.isLoading ? (
            <div className="text-meta" style={{ color: 'var(--text-muted)' }}>Yüklənir…</div>
          ) : (comments.data ?? []).length === 0 ? (
            <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
              İlk şərhi yaz. Komandadakı insanı <code>@Ad Soyad</code> ilə xatırlat.
            </p>
          ) : (
            (comments.data ?? []).map((c) => (
              <CommentRow
                key={c.id}
                row={c}
                authorName={profileById.get(c.user_id)?.full_name ?? '—'}
                profileByName={profileByName}
                canDelete={c.user_id === profile?.id}
                onDelete={() => del.mutate(c.id)}
              />
            ))
          )}
        </div>

        <form
          className="p-4 border-t space-y-2"
          style={{ borderColor: 'var(--line-soft)' }}
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <textarea
            className="input"
            style={{ height: 80, padding: 12 }}
            placeholder="Şərh yaz… (@Ad Soyad ilə xatırlat)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                onSubmit();
              }
            }}
          />
          {err ? <p className="text-meta" style={{ color: '#B91C1C' }}>{err}</p> : null}
          <div className="flex justify-between items-center">
            <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
              ⌘+Enter ilə göndər
            </span>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost" onClick={onClose}>Bağla</button>
              <button
                type="submit"
                className="btn-primary"
                disabled={add.isPending || !draft.trim()}
              >
                {add.isPending ? 'Göndərilir…' : 'Göndər'}
              </button>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}

function CommentRow({
  row,
  authorName,
  profileByName,
  canDelete,
  onDelete,
}: {
  row: TaskCommentRow;
  authorName: string;
  profileByName: Map<string, Profile>;
  canDelete: boolean;
  onDelete: () => void;
}) {
  return (
    <article
      className="rounded-card p-3"
      style={{ background: 'var(--surface-mist)', border: '1px solid var(--line-soft)' }}
    >
      <header className="flex items-baseline justify-between gap-2 mb-1">
        <span className="font-medium text-body">{authorName}</span>
        <div className="flex items-center gap-2">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            {relativeTime(row.created_at)}
          </span>
          {canDelete ? (
            <button
              type="button"
              className="text-meta"
              style={{ color: 'var(--text-muted)' }}
              onClick={() => {
                if (confirm('Bu şərh silinsin?')) onDelete();
              }}
            >
              Sil
            </button>
          ) : null}
        </div>
      </header>
      <div className="text-body whitespace-pre-wrap">
        {renderBodyWithMentions(row.body, profileByName)}
      </div>
    </article>
  );
}

/**
 * Split body on @<token> patterns. Tokens that match a known profile by
 * full_name render as a brand-tinted chip; unmatched stay as plain text.
 * The match rule MUST mirror the DB trigger to keep visual + actual
 * mentions consistent.
 */
function renderBodyWithMentions(
  body: string,
  profileByName: Map<string, Profile>,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /@([^\s@,;:!?()]+(?:\s+[^\s@,;:!?()]+)?)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = re.exec(body)) !== null) {
    const before = body.slice(lastIdx, match.index);
    if (before) out.push(<span key={`t-${key++}`}>{before}</span>);

    const raw = match[1];
    // Try the longest plausible token first (e.g. "Ad Soyad"), then fall
    // back to the first word ("Ad"). This matches "@Ad Soyad qeyd et"
    // → mention "Ad Soyad" if it exists, else just "Ad".
    let resolved: Profile | undefined;
    let consumed = raw;
    if (profileByName.has(raw.toLowerCase())) {
      resolved = profileByName.get(raw.toLowerCase());
    } else {
      const firstWord = raw.split(/\s+/, 1)[0];
      if (firstWord && profileByName.has(firstWord.toLowerCase())) {
        resolved = profileByName.get(firstWord.toLowerCase());
        consumed = firstWord;
      }
    }

    if (resolved) {
      out.push(
        <span
          key={`m-${key++}`}
          className="chip text-tiny"
          style={{
            background: 'rgba(173,251,73,0.16)',
            color: 'var(--brand-text)',
          }}
        >
          @{consumed}
        </span>,
      );
      // If we only consumed the first word of a multi-word token, push the rest back as plain.
      if (consumed !== raw) {
        const rest = raw.slice(consumed.length);
        out.push(<span key={`t-${key++}`}>{rest}</span>);
      }
    } else {
      out.push(<span key={`t-${key++}`}>@{raw}</span>);
    }
    lastIdx = match.index + match[0].length;
  }
  const tail = body.slice(lastIdx);
  if (tail) out.push(<span key={`t-${key++}`}>{tail}</span>);
  return out;
}
