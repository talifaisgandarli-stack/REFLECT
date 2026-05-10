/**
 * REQ-TASK-07 — @mention in task_comments; mentions[] populated client-side by
 * matching @word against profiles.full_name; mentioned users receive in-app notification.
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { relativeTime } from '@/lib/format';

type Comment = {
  id: string;
  task_id: string;
  user_id: string;
  body: string;
  mentions: string[];
  created_at: string;
  profiles?: { full_name: string | null; avatar_url: string | null } | null;
};

type Profile = { id: string; full_name: string | null };

function parseMentions(body: string, profiles: Profile[]): string[] {
  // Match @ followed by a word (Latin or Cyrillic). Resolve to first profile
  // whose full_name starts with the captured token (case-insensitive). Fall
  // back to substring match only if no prefix hit. This keeps `@ali` from
  // ambiguously matching both "Aliyev" and "Allahverdiyev" — the prefix wins.
  const tokens = body.match(/@[\wЀ-ӿ]+/g) ?? [];
  const ids: string[] = [];
  for (const token of tokens) {
    const name = token.slice(1).toLowerCase();
    if (!name) continue;
    const byPrefix = profiles.find((p) => p.full_name?.toLowerCase().startsWith(name));
    const match = byPrefix ?? profiles.find((p) => p.full_name?.toLowerCase().includes(name));
    if (match && !ids.includes(match.id)) ids.push(match.id);
  }
  return ids;
}

export function TaskCommentsModal({
  taskId,
  taskTitle,
  onClose,
}: {
  taskId: string;
  taskTitle: string;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const profiles = useQuery({
    queryKey: ['profiles', 'list'],
    queryFn: async (): Promise<Profile[]> => (await supabase.from('profiles').select('id, full_name')).data ?? [],
  });

  const comments = useQuery({
    queryKey: ['task_comments', taskId],
    queryFn: async (): Promise<Comment[]> => {
      const { data, error } = await supabase
        .from('task_comments')
        .select('*, profiles(full_name, avatar_url)')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Comment[];
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.data]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const addComment = useMutation({
    mutationFn: async () => {
      const trimmed = body.trim();
      if (!trimmed) return;
      const mentions = parseMentions(trimmed, profiles.data ?? []);

      // task_comments_notify_mentions trigger (migration 0004 + 0019) handles
      // both the activity_log entry and notification fan-out for each mention.
      const { error } = await supabase.from('task_comments').insert({
        task_id: taskId,
        user_id: profile?.id,
        body: trimmed,
        mentions,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['task_comments', taskId] });
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end"
      style={{ background: 'rgba(14,22,17,0.45)' }}
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-tl-card rounded-bl-card flex flex-col"
        style={{ width: 400, height: '100vh', maxHeight: '100vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <div>
            <div className="text-meta" style={{ color: 'var(--text-muted)' }}>Şərhlər</div>
            <div className="text-h3 mt-0.5 truncate max-w-[300px]">{taskTitle}</div>
          </div>
          <button className="text-meta" style={{ fontSize: 20 }} onClick={onClose}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {comments.isLoading ? <p className="text-meta">Yüklənir…</p> : null}
          {!comments.isLoading && (comments.data ?? []).length === 0 ? (
            <p className="text-meta" style={{ color: 'var(--text-muted)' }}>Hələ şərh yoxdur. İlk şərhi sən yaz!</p>
          ) : null}
          {(comments.data ?? []).map((c) => (
            <div key={c.id} className={`flex gap-3 ${c.user_id === profile?.id ? 'flex-row-reverse' : ''}`}>
              <div
                className="rounded-full flex-shrink-0 flex items-center justify-center text-meta font-medium"
                style={{ width: 32, height: 32, background: 'var(--surface)', border: '1px solid var(--line)', fontSize: 12 }}
              >
                {(c.profiles?.full_name ?? '?')[0]?.toUpperCase()}
              </div>
              <div style={{ maxWidth: '75%' }}>
                <div
                  className="rounded-card px-3 py-2 text-body"
                  style={{
                    background: c.user_id === profile?.id ? 'var(--brand-action)' : 'var(--surface)',
                    color: c.user_id === profile?.id ? 'var(--ink)' : 'var(--text)',
                  }}
                >
                  {c.body}
                </div>
                <div className="text-meta mt-1" style={{ color: 'var(--text-muted)', fontSize: 11, textAlign: c.user_id === profile?.id ? 'right' : 'left' }}>
                  {c.profiles?.full_name ?? '—'} · {relativeTime(c.created_at)}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="px-5 py-4" style={{ borderTop: '1px solid var(--line)' }}>
          <p className="text-meta mb-1" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
            @ad ilə komanda üzvlərini qeyd et
          </p>
          <div className="flex gap-2">
            <textarea
              className="input flex-1"
              rows={2}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Şərh yaz… (@ad)"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  addComment.mutate();
                }
              }}
            />
            <button
              className="btn-primary"
              style={{ alignSelf: 'flex-end', height: 36 }}
              disabled={!body.trim() || addComment.isPending}
              onClick={() => addComment.mutate()}
            >
              Göndər
            </button>
          </div>
          {addComment.error ? (
            <p className="text-meta mt-1" style={{ color: '#B91C1C' }}>{(addComment.error as Error).message}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
