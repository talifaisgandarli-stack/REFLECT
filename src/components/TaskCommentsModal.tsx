/**
 * REQ-TASK-07 — @mention in task_comments; mentions[] populated client-side by
 * matching @word against profiles.full_name; mentioned users receive in-app notification.
 *
 * Autocomplete: typing @ opens a dropdown of matching team members; click or
 * Enter/Tab selects and replaces the partial @token with @FullName.
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { relativeTime } from '@/lib/format';
import { trackRecentEntry } from '@/lib/useRecentlyViewed';
import { renderCommentMarkdown } from '@/lib/sanitize';

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

// --- Mention autocomplete helpers -------------------------------------------

/** Extract the partial @token that ends at `cursorPos` in `text`, or null. */
function getMentionQuery(text: string, cursorPos: number): string | null {
  const before = text.slice(0, cursorPos);
  const match = before.match(/@([\wЀ-ӿа-яА-Яəüöçşğı]*)$/);
  return match ? match[1] : null;
}

/** Replace the partial @token before `cursorPos` with the chosen name. */
function applyMention(text: string, cursorPos: number, fullName: string): { text: string; cursor: number } {
  const before = text.slice(0, cursorPos);
  const after = text.slice(cursorPos);
  const replaced = before.replace(/@([\wЀ-ӿа-яА-Яəüöçşğı]*)$/, `@${fullName}`);
  const newText = replaced + (after.startsWith(' ') ? after : ' ' + after);
  return { text: newText, cursor: replaced.length + (after.startsWith(' ') ? 0 : 1) };
}

// ---------------------------------------------------------------------------

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
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Track recent: opening comments counts as task visit
  useEffect(() => {
    trackRecentEntry({
      type: 'task',
      id: taskId,
      title: taskTitle,
      href: `/tapşırıqlar?focus=${taskId}`,
    });
  }, [taskId, taskTitle]);

  // PRD §REQ-TASK — show child subtasks at a glance
  const subtasks = useQuery({
    queryKey: ['task_subtasks', taskId],
    queryFn: async () => {
      const { data } = await supabase
        .from('tasks')
        .select('id, title, status')
        .eq('parent_task_id', taskId)
        .is('archived_at', null)
        .order('created_at', { ascending: true });
      return (data ?? []) as Array<{ id: string; title: string; status: string }>;
    },
  });

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

  // Compute filtered mention suggestions
  const suggestions =
    mentionQuery !== null
      ? (profiles.data ?? [])
          .filter((p) => p.full_name && p.full_name.toLowerCase().includes(mentionQuery.toLowerCase()))
          .slice(0, 6)
      : [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.data]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && mentionQuery === null) onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, mentionQuery]);

  // Reset suggestion index when suggestions list changes
  useEffect(() => { setMentionIndex(0); }, [suggestions.length]);

  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setBody(val);
    const cursor = e.target.selectionStart ?? val.length;
    const q = getMentionQuery(val, cursor);
    setMentionQuery(q);
  }

  function pickSuggestion(p: Profile) {
    if (!p.full_name) return;
    const cursor = textareaRef.current?.selectionStart ?? body.length;
    const { text, cursor: newCursor } = applyMention(body, cursor, p.full_name);
    setBody(text);
    setMentionQuery(null);
    // Restore focus + cursor position after React re-render
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(newCursor, newCursor);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pickSuggestion(suggestions[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      addComment.mutate();
    }
  }

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
      setMentionQuery(null);
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
        <div className="flex items-center justify-between px-5 py-4 gap-2" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="min-w-0 flex-1">
            <div className="text-meta" style={{ color: 'var(--text-muted)' }}>Şərhlər</div>
            <TaskTitleInlineEditor taskId={taskId} initial={taskTitle} />
          </div>
          {/* PRD §REQ-TASK — quick subtask creation under this task */}
          <SubtaskInlineCreate parentTaskId={taskId} />
          <button className="text-meta" style={{ fontSize: 20 }} onClick={onClose}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* PRD §REQ-TASK-05 — subtask list (when this task has children) */}
          {(subtasks.data ?? []).length > 0 ? (
            <div
              className="rounded-card p-2 mb-2"
              style={{ background: 'var(--surface-mist)', fontSize: 12 }}
            >
              <div className="text-meta mb-1" style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Yarımtapşırıqlar ({(subtasks.data ?? []).length})
              </div>
              <ul className="space-y-0.5">
                {(subtasks.data ?? []).map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <span style={{ color: s.status === 'done' ? 'var(--success-deep, #16794a)' : 'var(--text-muted)', fontSize: 11 }}>
                      {s.status === 'done' ? '✓' : '○'}
                    </span>
                    <span style={{
                      color: s.status === 'done' ? 'var(--text-muted)' : 'var(--text)',
                      textDecoration: s.status === 'done' ? 'line-through' : 'none',
                    }}>
                      {s.title}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
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
                  className={`rounded-card px-3 py-2 text-body comment-body ${c.user_id === profile?.id ? 'comment-body-mine' : ''}`}
                  style={{
                    background: c.user_id === profile?.id ? 'var(--brand-action)' : 'var(--surface)',
                    color: c.user_id === profile?.id ? 'var(--ink)' : 'var(--text)',
                  }}
                  // Markdown rendering (PRD §9.1 sanitized via DOMPurify):
                  // **bold**, *italic*, `code`, [text](url), bare URLs, @mentions
                  dangerouslySetInnerHTML={{ __html: renderCommentMarkdown(c.body) }}
                />
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
            @ad ilə komanda üzvlərini qeyd et · Enter = göndər, Shift+Enter = yeni sətir
          </p>

          {/* @mention autocomplete dropdown — PRD §6.2 / REQ-TASK-07 */}
          {mentionQuery !== null && suggestions.length > 0 && (
            <div
              className="card mb-1 overflow-hidden"
              style={{
                border: '1px solid var(--line)',
                boxShadow: '0 4px 16px rgba(14,22,17,0.12)',
                maxHeight: 180,
                overflowY: 'auto',
              }}
              role="listbox"
              aria-label="Komanda üzvləri"
            >
              {suggestions.map((p, i) => (
                <button
                  key={p.id}
                  role="option"
                  aria-selected={i === mentionIndex}
                  type="button"
                  className="w-full text-left px-3 py-2 text-body"
                  style={{
                    background: i === mentionIndex ? 'var(--surface-mist)' : 'transparent',
                    borderBottom: i < suggestions.length - 1 ? '1px solid var(--line-soft)' : 'none',
                  }}
                  onMouseDown={(e) => { e.preventDefault(); pickSuggestion(p); }}
                  onMouseEnter={() => setMentionIndex(i)}
                >
                  @{p.full_name}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <textarea
              ref={textareaRef}
              className="input flex-1"
              rows={2}
              value={body}
              onChange={handleBodyChange}
              onKeyDown={handleKeyDown}
              placeholder="Şərh yaz… (@ad)"
              aria-label="Şərh məktubu"
              aria-autocomplete={mentionQuery !== null ? 'list' : 'none'}
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
            <p className="text-meta mt-1" style={{ color: 'var(--error-deep)' }}>{(addComment.error as Error).message}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// PRD §UX — inline edit task title (click h3 → input → ✓/×)
function TaskTitleInlineEditor({ taskId, initial }: { taskId: string; initial: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(initial);
  useEffect(() => { setVal(initial); }, [initial]);
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!val.trim() || val.trim() === initial) {
      setEditing(false);
      setVal(initial);
      return;
    }
    setSaving(true);
    await supabase.from('tasks').update({ title: val.trim() }).eq('id', taskId);
    setSaving(false);
    qc.invalidateQueries({ queryKey: ['tasks'] });
    qc.invalidateQueries({ queryKey: ['task_comments', taskId] });
    setEditing(false);
  }
  if (editing) {
    return (
      <div className="mt-0.5 flex items-center gap-1">
        <input
          autoFocus
          className="input"
          style={{ height: 30, fontSize: 16, fontWeight: 600 }}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') { setVal(initial); setEditing(false); }
          }}
          disabled={saving}
        />
        <button type="button" className="chip" disabled={saving} onClick={save} style={{ fontSize: 11, color: 'var(--brand-text)' }}>{saving ? '…' : '✓'}</button>
        <button type="button" className="chip" onClick={() => { setVal(initial); setEditing(false); }} style={{ fontSize: 11 }}>×</button>
      </div>
    );
  }
  return (
    <button
      type="button"
      className="text-h3 mt-0.5 truncate text-left hover:opacity-80"
      style={{ display: 'block', width: '100%' }}
      title="Başlığı dəyişdirmək üçün klikləyin"
      onClick={() => setEditing(true)}
    >
      {initial}
    </button>
  );
}

// PRD §REQ-TASK — inline subtask creation from a parent task's comments modal.
// Click-to-expand input; Enter submits; sets parent_task_id + inherits project.
function SubtaskInlineCreate({ parentTaskId }: { parentTaskId: string }) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const create = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error('Başlıq tələb olunur');
      // Inherit project_id from parent so the subtask appears in the same project
      const { data: parent } = await supabase
        .from('tasks')
        .select('project_id, task_level')
        .eq('id', parentTaskId)
        .maybeSingle();
      const { error } = await supabase.from('tasks').insert({
        title: title.trim(),
        status: 'queued',
        parent_task_id: parentTaskId,
        project_id: parent?.project_id ?? null,
        task_level: (parent?.task_level ?? 0) + 1,
        assignee_ids: profile?.id ? [profile.id] : [],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      setTitle('');
      setOpen(false);
    },
  });

  if (!open) {
    return (
      <button
        type="button"
        className="chip"
        style={{ color: 'var(--brand-text)', fontSize: 11 }}
        onClick={() => setOpen(true)}
        title="Yarımtapşırıq əlavə et"
      >
        + Alt
      </button>
    );
  }
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
    >
      <input
        autoFocus
        className="input"
        style={{ width: 160, height: 28, fontSize: 12 }}
        placeholder="Yarımtapşırıq başlığı"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); setTitle(''); } }}
      />
      <button type="submit" className="chip" disabled={create.isPending || !title.trim()} style={{ color: 'var(--brand-text)', fontSize: 11 }}>
        {create.isPending ? '…' : '✓'}
      </button>
      <button type="button" className="chip" onClick={() => { setOpen(false); setTitle(''); }} style={{ fontSize: 11 }}>×</button>
    </form>
  );
}
