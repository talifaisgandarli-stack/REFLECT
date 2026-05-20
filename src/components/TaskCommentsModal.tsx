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
import { formatDuration } from '@/lib/useTimeTracking';
import { renderCommentMarkdown } from '@/lib/sanitize';
import { dispatchOpenTask } from '@/lib/events';

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

  // PRD §REQ-TASK — toggle subtask status done ↔ active inline
  const toggleSubtaskStatus = useMutation({
    mutationFn: async (input: { id: string; nextStatus: 'done' | 'active' }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ status: input.nextStatus })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task_subtasks', taskId] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  // PRD §REQ-TASK-06 — estimated (planned) vs actual tracked time
  const estimateVsActual = useQuery({
    queryKey: ['task_estimate_vs_actual', taskId],
    queryFn: async () => {
      const [taskRes, entriesRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('estimated_duration, duration_unit, workload')
          .eq('id', taskId)
          .maybeSingle(),
        supabase
          .from('time_entries')
          .select('duration_seconds')
          .eq('task_id', taskId)
          .not('duration_seconds', 'is', null),
      ]);
      const task = taskRes.data as { estimated_duration: number | null; duration_unit: string | null; workload: number | null } | null;
      const trackedSec = ((entriesRes.data ?? []) as Array<{ duration_seconds: number }>)
        .reduce((s, r) => s + r.duration_seconds, 0);
      // Convert estimate to seconds (assume hours unit by default)
      const est = task?.estimated_duration ?? task?.workload ?? null;
      const unit = task?.duration_unit ?? 'hours';
      const estSec = est == null ? null : Math.round(est * (unit === 'days' ? 86400 : unit === 'minutes' ? 60 : 3600));
      return { trackedSec, estSec };
    },
  });

  // PRD §UX — show the parent project for context (so the title doesn't
  // float without orientation)
  const projectContext = useQuery({
    queryKey: ['task_project_context', taskId],
    queryFn: async () => {
      const { data } = await supabase
        .from('tasks')
        .select('project_id, projects(name)')
        .eq('id', taskId)
        .maybeSingle();
      if (!data?.project_id) return null;
      const projects = data.projects as { name: string }[] | { name: string } | null;
      const name = Array.isArray(projects) ? projects[0]?.name : projects?.name;
      return name ? { id: data.project_id as string, name } : null;
    },
  });

  // PRD §REQ-TASK — if this task is itself a subtask, fetch parent for back-chip
  const parentTask = useQuery({
    queryKey: ['task_parent', taskId],
    queryFn: async () => {
      const { data: self } = await supabase
        .from('tasks')
        .select('parent_task_id')
        .eq('id', taskId)
        .maybeSingle();
      if (!self?.parent_task_id) return null;
      const { data: parent } = await supabase
        .from('tasks')
        .select('id, title')
        .eq('id', self.parent_task_id)
        .maybeSingle();
      return parent as { id: string; title: string } | null;
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
            <div className="text-meta flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
              <span>Şərhlər</span>
              <span>·</span>
              {/* Admin can move task between projects via dropdown */}
              <TaskProjectPicker taskId={taskId} currentProjectId={projectContext.data?.id ?? null} currentName={projectContext.data?.name ?? null} />
            </div>
            <TaskTitleInlineEditor taskId={taskId} initial={taskTitle} />
          </div>
          {/* PRD §REQ-TASK — quick subtask creation under this task */}
          <SubtaskInlineCreate parentTaskId={taskId} />
          <button className="text-meta" style={{ fontSize: 20 }} onClick={onClose}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* PRD §REQ-TASK-05 — parent task back-chip (when this is a subtask) */}
          {parentTask.data ? (
            <button
              type="button"
              className="text-meta mb-2 px-2 py-1 rounded-btn"
              style={{
                background: 'var(--brand-glow-sm)',
                color: 'var(--brand-text)',
                border: '1px solid var(--brand-glow-xl)',
                fontSize: 11,
                textAlign: 'left',
                width: '100%',
              }}
              onClick={() => {
                // Re-mount the modal with the parent task; Tasks.tsx owns
                // the modal and subscribes to the event from src/lib/events.ts.
                dispatchOpenTask({ id: parentTask.data!.id, title: parentTask.data!.title });
              }}
              title="Ana tapşırığı aç"
            >
              ↑ Ana tapşırıq: <strong>{parentTask.data.title}</strong>
            </button>
          ) : null}

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
                    <button
                      type="button"
                      onClick={() => toggleSubtaskStatus.mutate({
                        id: s.id,
                        nextStatus: s.status === 'done' ? 'active' : 'done',
                      })}
                      disabled={toggleSubtaskStatus.isPending}
                      style={{
                        color: s.status === 'done' ? 'var(--success-deep, #16794a)' : 'var(--text-muted)',
                        fontSize: 13,
                        cursor: 'pointer',
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                      }}
                      title={s.status === 'done' ? 'Bərpa et' : 'Tamamla'}
                      aria-label={s.status === 'done' ? `Bərpa et: ${s.title}` : `Tamamla: ${s.title}`}
                    >
                      {s.status === 'done' ? '✓' : '○'}
                    </button>
                    <button
                      type="button"
                      onClick={() => dispatchOpenTask({ id: s.id, title: s.title })}
                      className="text-left hover:underline"
                      style={{
                        color: s.status === 'done' ? 'var(--text-muted)' : 'var(--text)',
                        textDecoration: s.status === 'done' ? 'line-through' : 'none',
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        flex: 1,
                      }}
                      title="Yarımtapşırığı aç"
                    >
                      {s.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {/* PRD §REQ-TASK-06 — estimate vs tracked summary chip + inline edit */}
          <TaskEstimateBar taskId={taskId} data={estimateVsActual.data} />

          {/* PRD §REQ-TASK-03 — status + priority + labels inline editors */}
          <TaskStatusPriorityLabels taskId={taskId} />

          {/* PRD §REQ-TASK — start_date + deadline inline editors */}
          <TaskDateFields taskId={taskId} />

          {/* PRD §REQ-TASK — assignees chip row */}
          <TaskAssigneesChip taskId={taskId} />

          {/* PRD §REQ-TASK — inline task description editor */}
          <TaskDescriptionEditor taskId={taskId} />

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
          {/* PRD §UX — surface keyboard contract so users don't lose drafts to Enter */}
          <p
            className="text-meta mt-1"
            style={{ color: 'var(--text-muted)', fontSize: 10, opacity: 0.7 }}
          >
            Enter göndər · Shift+Enter yeni sətir · @ ilə komandadan kimisə qeyd et
          </p>
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
      // Inherit project_id + labels from parent so subtask shares context
      const { data: parent } = await supabase
        .from('tasks')
        .select('project_id, task_level, labels')
        .eq('id', parentTaskId)
        .maybeSingle();
      const { error } = await supabase.from('tasks').insert({
        title: title.trim(),
        status: 'queued',
        parent_task_id: parentTaskId,
        project_id: parent?.project_id ?? null,
        task_level: (parent?.task_level ?? 0) + 1,
        // PRD §REQ-TASK — inherit labels so subtask shows in same filter views
        labels: (parent as { labels?: string[] } | null)?.labels ?? [],
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

// PRD §REQ-TASK — inline date pickers + risk_buffer_pct
function TaskDateFields({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const dates = useQuery({
    queryKey: ['task_dates_editable', taskId],
    queryFn: async () => {
      const { data } = await supabase
        .from('tasks')
        .select('start_date, deadline, risk_buffer_pct')
        .eq('id', taskId)
        .maybeSingle();
      return (data ?? { start_date: null, deadline: null, risk_buffer_pct: 0 }) as {
        start_date: string | null;
        deadline: string | null;
        risk_buffer_pct: number | null;
      };
    },
  });
  const update = useMutation({
    mutationFn: async (patch: Partial<{ start_date: string | null; deadline: string | null; risk_buffer_pct: number }>) => {
      const { error } = await supabase.from('tasks').update(patch).eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task_dates_editable', taskId] });
      qc.invalidateQueries({ queryKey: ['task_estimate_vs_actual', taskId] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
  return (
    <div className="flex items-center gap-1.5 flex-wrap mb-2 text-meta" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
      <span>📅 Başlama</span>
      <input
        type="date"
        className="input"
        style={{ height: 22, fontSize: 11 }}
        value={dates.data?.start_date ?? ''}
        onChange={(e) => update.mutate({ start_date: e.target.value || null })}
        disabled={update.isPending}
      />
      <span>· Bitmə</span>
      <input
        type="date"
        className="input"
        style={{ height: 22, fontSize: 11 }}
        value={dates.data?.deadline ?? ''}
        onChange={(e) => update.mutate({ deadline: e.target.value || null })}
        min={dates.data?.start_date ?? undefined}
        disabled={update.isPending}
      />
      {/* PRD §REQ-TASK-06 — risk buffer % (workload formula multiplier) */}
      <span>· Risk %</span>
      <input
        type="number"
        min={0}
        max={100}
        step={5}
        className="input"
        style={{ height: 22, fontSize: 11, width: 60, fontVariantNumeric: 'tabular-nums' }}
        value={dates.data?.risk_buffer_pct ?? 0}
        onChange={(e) => update.mutate({ risk_buffer_pct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
        disabled={update.isPending}
        title="Plan müddətinə əlavə risk buferi (workload formula)"
      />
    </div>
  );
}

// PRD §REQ-TASK-03 + 6.x — inline status / priority / labels editors row
const STATUS_LABEL_LOCAL: Record<string, string> = {
  idea: 'İdeya',
  queued: 'Növbədə',
  active: 'Aktiv',
  review: 'Yoxlanır',
  expert: 'Ekspertizada',
  done: 'Tamamlandı',
  cancelled: 'Ləğv edildi',
};
const STATUS_KEYS = ['idea', 'queued', 'active', 'review', 'expert', 'done', 'cancelled'] as const;
const PRIORITY_VISUAL: Record<string, { icon: string; bg: string; color: string }> = {
  high:   { icon: '↑', bg: 'var(--error-aa, #8a1e18)', color: 'white' },
  medium: { icon: '→', bg: 'var(--warning-aa, #8a5800)', color: 'white' },
  low:    { icon: '↓', bg: 'var(--surface-mist)', color: 'var(--text-muted)' },
};

function TaskStatusPriorityLabels({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const task = useQuery({
    queryKey: ['task_meta_editable', taskId],
    queryFn: async () => {
      const { data } = await supabase
        .from('tasks')
        .select('status, priority, labels')
        .eq('id', taskId)
        .maybeSingle();
      return (data ?? { status: 'queued', priority: null, labels: [] }) as {
        status: string;
        priority: 'high' | 'medium' | 'low' | null;
        labels: string[] | null;
      };
    },
  });

  const updateField = useMutation({
    mutationFn: async (patch: Partial<{ status: string; priority: string | null; labels: string[] }>) => {
      const { error } = await supabase.from('tasks').update(patch).eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task_meta_editable', taskId] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const status = task.data?.status ?? 'queued';
  const priority = task.data?.priority ?? null;
  const labels = task.data?.labels ?? [];
  const [draftLabel, setDraftLabel] = useState('');

  function addLabel() {
    const v = draftLabel.trim();
    if (!v || labels.includes(v)) { setDraftLabel(''); return; }
    updateField.mutate({ labels: [...labels, v] });
    setDraftLabel('');
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap mb-2 text-meta" style={{ fontSize: 11 }}>
      {/* Status inline dropdown */}
      <select
        className="input"
        style={{ height: 22, fontSize: 11, padding: '0 4px' }}
        value={status}
        onChange={(e) => updateField.mutate({ status: e.target.value })}
        disabled={updateField.isPending}
      >
        {STATUS_KEYS.map((s) => <option key={s} value={s}>{STATUS_LABEL_LOCAL[s] ?? s}</option>)}
      </select>

      {/* Priority inline dropdown — small visual chip */}
      <select
        className="input"
        style={{
          height: 22,
          fontSize: 11,
          padding: '0 4px',
          background: priority ? PRIORITY_VISUAL[priority].bg : 'var(--surface-mist)',
          color: priority ? PRIORITY_VISUAL[priority].color : 'var(--text-muted)',
        }}
        value={priority ?? ''}
        onChange={(e) => updateField.mutate({ priority: e.target.value || null })}
        disabled={updateField.isPending}
        title="Prioritet"
      >
        <option value="">— prioritet —</option>
        <option value="high">↑ Yüksək</option>
        <option value="medium">→ Orta</option>
        <option value="low">↓ Aşağı</option>
      </select>

      {/* Labels — chip with × + inline add */}
      {labels.map((l) => (
        <span
          key={l}
          className="chip flex items-center gap-1"
          style={{ background: 'var(--surface-mist)', fontSize: 11 }}
        >
          #{l}
          <button
            type="button"
            onClick={() => updateField.mutate({ labels: labels.filter((x) => x !== l) })}
            style={{ color: 'var(--text-muted)', opacity: 0.6, fontSize: 11 }}
            title="Çıxar"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        className="input"
        style={{ height: 22, fontSize: 11, width: 80 }}
        placeholder="+ etiket"
        value={draftLabel}
        onChange={(e) => setDraftLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); addLabel(); }
          if (e.key === ',') { e.preventDefault(); addLabel(); }
        }}
        onBlur={() => draftLabel.trim() && addLabel()}
      />
    </div>
  );
}

// PRD §REQ-TASK-02 — assignee chip row. Admin can add/remove via inline
// select; non-admin sees read-only chips.
function TaskAssigneesChip({ taskId }: { taskId: string }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const task = useQuery({
    queryKey: ['task_assignees_ids', taskId],
    queryFn: async () => {
      const { data } = await supabase
        .from('tasks')
        .select('assignee_ids')
        .eq('id', taskId)
        .maybeSingle();
      return ((data?.assignee_ids ?? []) as string[]);
    },
  });
  const ids = task.data ?? [];
  const allProfiles = useQuery({
    queryKey: ['profiles', 'assignee-pick'],
    enabled: ids.length > 0 || isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('is_active', true)
        .order('full_name');
      return (data ?? []) as Array<{ id: string; full_name: string | null }>;
    },
  });
  const updateIds = useMutation({
    mutationFn: async (nextIds: string[]) => {
      const { error } = await supabase.from('tasks').update({ assignee_ids: nextIds }).eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task_assignees_ids', taskId] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
  const profileMap = new Map((allProfiles.data ?? []).map((p) => [p.id, p.full_name ?? p.id.slice(0, 8)]));
  const candidates = (allProfiles.data ?? []).filter((p) => !ids.includes(p.id));

  if (ids.length === 0 && !isAdmin) return null;

  return (
    <div className="text-meta mb-2 flex items-center gap-1.5 flex-wrap" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
      <span>👤</span>
      {ids.map((id) => (
        <span
          key={id}
          className="chip flex items-center gap-1"
          style={{ background: 'var(--surface-mist)', fontSize: 11 }}
        >
          {profileMap.get(id) ?? id.slice(0, 8)}
          {isAdmin ? (
            <button
              type="button"
              onClick={() => updateIds.mutate(ids.filter((x) => x !== id))}
              disabled={updateIds.isPending}
              style={{ color: 'var(--text-muted)', opacity: 0.6, fontSize: 11 }}
              title="Çıxar"
              aria-label={`${profileMap.get(id) ?? id} çıxarılsın`}
            >
              ×
            </button>
          ) : null}
        </span>
      ))}
      {isAdmin && candidates.length > 0 ? (
        <select
          className="input"
          style={{ height: 22, fontSize: 11, padding: '0 4px', minWidth: 90 }}
          value=""
          onChange={(e) => {
            if (e.target.value) {
              updateIds.mutate([...ids, e.target.value]);
              e.target.value = '';
            }
          }}
          disabled={updateIds.isPending}
        >
          <option value="">+ İcraçı</option>
          {candidates.map((p) => (
            <option key={p.id} value={p.id}>{p.full_name ?? p.id.slice(0, 8)}</option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

// PRD §UX — show project context + admin can reassign task to another project
function TaskProjectPicker({
  taskId,
  currentProjectId,
  currentName,
}: {
  taskId: string;
  currentProjectId: string | null;
  currentName: string | null;
}) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const projects = useQuery({
    queryKey: ['projects', 'active-pick'],
    enabled: editing,
    queryFn: async () => {
      const { data } = await supabase
        .from('projects')
        .select('id, name')
        .neq('status', 'closed')
        .order('name');
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  const move = useMutation({
    mutationFn: async (nextId: string | null) => {
      const { error } = await supabase
        .from('tasks')
        .update({ project_id: nextId })
        .eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task_project_context', taskId] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      setEditing(false);
    },
  });

  if (!isAdmin) {
    if (!currentName) return null;
    return (
      <a
        href={`/layihelər/${currentProjectId}`}
        className="hover:underline truncate"
        style={{ color: 'var(--brand-text)', fontSize: 11, maxWidth: 180 }}
        title={currentName}
      >
        📁 {currentName}
      </a>
    );
  }

  if (editing) {
    return (
      <select
        autoFocus
        className="input"
        style={{ height: 22, fontSize: 11, maxWidth: 220 }}
        value={currentProjectId ?? ''}
        onChange={(e) => move.mutate(e.target.value || null)}
        onBlur={() => setEditing(false)}
      >
        <option value="">— layihəsiz —</option>
        {(projects.data ?? []).map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="hover:underline truncate"
      style={{ color: 'var(--brand-text)', fontSize: 11, maxWidth: 180, background: 'transparent', border: 'none', padding: 0 }}
      title="Layihəni dəyiş"
    >
      📁 {currentName ?? '— layihəsiz —'}
    </button>
  );
}

// PRD §REQ-TASK-06 — estimate vs tracked bar with inline ✎ to edit estimated_duration
function TaskEstimateBar({
  taskId,
  data,
}: {
  taskId: string;
  data?: { trackedSec: number; estSec: number | null };
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [duration, setDuration] = useState('');
  const [unit, setUnit] = useState<'minutes' | 'hours' | 'days'>('hours');
  const [saving, setSaving] = useState(false);

  const trackedSec = data?.trackedSec ?? 0;
  const estSec = data?.estSec ?? null;
  const overrun = estSec != null && trackedSec > estSec;

  // Hide row entirely when there's nothing to show
  if (!editing && !estSec && trackedSec === 0) return null;

  async function save() {
    const d = Number(duration.replace(',', '.'));
    if (!Number.isFinite(d) || d < 0) { setEditing(false); return; }
    setSaving(true);
    await supabase
      .from('tasks')
      .update({ estimated_duration: d > 0 ? d : null, duration_unit: unit })
      .eq('id', taskId);
    setSaving(false);
    qc.invalidateQueries({ queryKey: ['task_estimate_vs_actual', taskId] });
    qc.invalidateQueries({ queryKey: ['tasks'] });
    setEditing(false);
  }

  return (
    <div
      className="rounded-card px-2 py-1.5 mb-2 text-meta flex items-center justify-between gap-2"
      style={{
        background: overrun ? 'var(--warning-bg, #fff3d6)' : 'var(--surface-mist)',
        color: overrun ? 'var(--ink)' : 'var(--text-muted)',
        fontSize: 11,
      }}
    >
      <span>
        ⏱ İzlənmiş: <strong style={{ color: 'var(--text)' }}>{formatDuration(trackedSec)}</strong>
        {estSec != null && !editing ? <> / Plan: {formatDuration(estSec)}</> : null}
      </span>
      {editing ? (
        <span className="flex items-center gap-1">
          <input
            autoFocus
            type="number"
            min={0}
            step="0.25"
            className="input"
            style={{ height: 22, width: 60, fontSize: 11 }}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') setEditing(false);
            }}
            placeholder="0"
          />
          <select
            className="input"
            style={{ height: 22, fontSize: 11, padding: '0 4px' }}
            value={unit}
            onChange={(e) => setUnit(e.target.value as typeof unit)}
          >
            <option value="minutes">dəq</option>
            <option value="hours">saat</option>
            <option value="days">gün</option>
          </select>
          <button type="button" disabled={saving} onClick={save} className="chip" style={{ fontSize: 10, color: 'var(--brand-text)' }}>
            {saving ? '…' : '✓'}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="chip" style={{ fontSize: 10 }}>×</button>
        </span>
      ) : (
        <span className="flex items-center gap-2">
          {overrun ? <span>⚠ Aşılıb</span> : null}
          <button
            type="button"
            onClick={async () => {
              // Pre-fill input with current unit + value (read separately)
              const { data: task } = await supabase
                .from('tasks')
                .select('estimated_duration, duration_unit')
                .eq('id', taskId)
                .maybeSingle();
              const u = (task?.duration_unit as 'minutes' | 'hours' | 'days') ?? 'hours';
              setUnit(u);
              setDuration(task?.estimated_duration != null ? String(task.estimated_duration) : '');
              setEditing(true);
            }}
            className="chip"
            style={{ fontSize: 10, color: 'var(--text-muted)' }}
            title="Plan müddətini dəyiş"
          >
            ✎
          </button>
        </span>
      )}
    </div>
  );
}

// PRD §REQ-TASK — inline task description editor with autosave on blur
function TaskDescriptionEditor({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const desc = useQuery({
    queryKey: ['task_description', taskId],
    queryFn: async () => {
      const { data } = await supabase.from('tasks').select('description').eq('id', taskId).maybeSingle();
      return (data?.description ?? '') as string;
    },
  });
  const [val, setVal] = useState('');
  const [editing, setEditing] = useState(false);
  const initial = desc.data ?? '';
  useEffect(() => { if (!editing) setVal(initial); }, [initial, editing]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('tasks').update({ description: val.trim() || null }).eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task_description', taskId] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      setEditing(false);
    },
  });

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-meta text-left w-full px-2 py-1.5 rounded-btn hover:bg-surface-mist mb-2"
        style={{ color: initial ? 'var(--text)' : 'var(--text-muted)', fontStyle: initial ? 'normal' : 'italic', fontSize: 12 }}
      >
        {initial || '+ Təsvir əlavə et'}
      </button>
    );
  }
  return (
    <div className="mb-2">
      <textarea
        autoFocus
        className="input w-full"
        rows={3}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setVal(initial); setEditing(false); }
        }}
        style={{ fontSize: 12 }}
      />
      <div className="flex justify-end gap-1 mt-1">
        <button type="button" className="chip" onClick={() => { setVal(initial); setEditing(false); }} style={{ fontSize: 11 }}>Ləğv</button>
        <button
          type="button"
          className="chip"
          style={{ color: 'var(--brand-text)', fontSize: 11 }}
          disabled={save.isPending || val === initial}
          onClick={() => save.mutate()}
        >
          {save.isPending ? '…' : 'Saxla'}
        </button>
      </div>
    </div>
  );
}
