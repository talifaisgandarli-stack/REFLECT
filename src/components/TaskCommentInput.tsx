/**
 * Comment composer with @mention picker (slice 121, REQ-TASK-07).
 *
 * The textarea is plain text; on every keystroke we re-parse the cursor
 * neighbourhood via findMentionTrigger() and pop a profile-search list
 * when the user is mid-`@`. Clicking a profile inserts `@<uuid> ` so the
 * 0004 + 0021 DB triggers find a real user id and fan out a notification
 * (with the task title in payload, since slice 112).
 *
 * The dropdown navigates with ArrowUp/ArrowDown/Enter and closes on
 * Escape — matches the rest of Reflect's overlay surfaces (Cmd+K bell).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { useT } from '@/lib/i18n';
import { applyMention, findMentionTrigger, type MentionTrigger } from '@/lib/mentionPicker';

type Profile = { id: string; full_name: string | null; email: string };

type Props = { taskId: string };

export function TaskCommentInput({ taskId }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [body, setBody] = useState('');
  const [trigger, setTrigger] = useState<MentionTrigger | null>(null);
  const [hover, setHover] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);

  // Re-measure the textarea on every render where the picker is open
  // so the portaled dropdown stays glued to it during scroll/resize.
  useLayoutEffect(() => {
    if (!trigger || !ref.current) {
      setAnchor(null);
      return;
    }
    function measure() {
      if (!ref.current) return;
      const r = ref.current.getBoundingClientRect();
      setAnchor({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [trigger]);

  // Close the picker if the user clicks anywhere outside the textarea
  // + portal.
  useEffect(() => {
    if (!trigger) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      // The portal nodes carry a data attr we can match.
      if (
        target instanceof HTMLElement &&
        target.closest('[data-mention-picker]')
      ) {
        return;
      }
      setTrigger(null);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [trigger]);

  const profiles = useQuery({
    queryKey: ['mention-picker', 'profiles'],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const matches = useMemo<Profile[]>(() => {
    if (!trigger) return [];
    const q = trigger.query.trim().toLowerCase();
    const all = profiles.data ?? [];
    if (!q) return all.slice(0, 6);
    return all
      .filter((p) => {
        const label = `${p.full_name ?? ''} ${p.email}`.toLowerCase();
        return label.includes(q);
      })
      .slice(0, 6);
  }, [trigger, profiles.data]);

  function recomputeTrigger(value: string, caret: number) {
    setTrigger(findMentionTrigger(value, caret));
    setHover(0);
  }

  const send = useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error('no_session');
      const trimmed = body.trim();
      if (!trimmed) return;
      const { error } = await supabase
        .from('task_comments')
        .insert({ task_id: taskId, user_id: profile.id, body: trimmed });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody('');
      setTrigger(null);
      qc.invalidateQueries({ queryKey: ['cmdk-task-comments', taskId] });
      qc.invalidateQueries({ queryKey: ['task-comments', taskId] });
    },
  });

  function pickProfile(p: Profile) {
    if (!trigger) return;
    const { next, caret } = applyMention(body, trigger, p.id);
    setBody(next);
    setTrigger(null);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }

  return (
    <form
      className="mt-3"
      onSubmit={(e) => {
        e.preventDefault();
        send.mutate();
      }}
    >
      <textarea
        ref={ref}
        className="input"
        value={body}
        placeholder={t('task.comments.placeholder')}
        style={{ minHeight: 72, padding: '12px 14px', whiteSpace: 'pre-wrap' }}
        onChange={(e) => {
          const v = e.target.value;
          setBody(v);
          recomputeTrigger(v, e.target.selectionStart ?? v.length);
        }}
        onKeyUp={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            const el = e.currentTarget;
            recomputeTrigger(el.value, el.selectionStart ?? el.value.length);
          }
        }}
        onKeyDown={(e) => {
          if (!trigger || matches.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHover((h) => (h + 1) % matches.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHover((h) => (h - 1 + matches.length) % matches.length);
          } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            pickProfile(matches[hover]);
          } else if (e.key === 'Escape') {
            setTrigger(null);
          }
        }}
      />

      {trigger && anchor
        ? createPortal(
            <ul
              role="listbox"
              data-mention-picker
              aria-label={t('task.comments.mention.aria')}
              className="rounded-card"
              style={{
                position: 'fixed',
                top: anchor.top,
                left: anchor.left,
                width: anchor.width,
                zIndex: 60,
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                boxShadow: '0 8px 24px rgba(14,22,17,0.12)',
                overflow: 'hidden',
              }}
            >
              {matches.length === 0 ? (
                <li
                  className="text-meta px-3 py-2"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {t('task.comments.mention.empty')}
                </li>
              ) : (
                matches.map((p, i) => (
                  <li
                    key={p.id}
                    role="option"
                    aria-selected={i === hover}
                    onMouseEnter={() => setHover(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickProfile(p);
                    }}
                    className="px-3 py-2 cursor-pointer text-body"
                    style={{
                      background: i === hover ? 'var(--brand-mist)' : 'transparent',
                      borderBottom: '1px solid var(--line-soft)',
                    }}
                  >
                    <div className="font-medium truncate">
                      {p.full_name || p.email}
                    </div>
                    {p.full_name ? (
                      <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                        {p.email}
                      </div>
                    ) : null}
                  </li>
                ))
              )}
            </ul>,
            document.body,
          )
        : null}

      <div className="flex justify-end mt-2">
        <button
          type="submit"
          className="btn-primary"
          disabled={send.isPending || !body.trim()}
        >
          {send.isPending ? t('task.comments.submitting') : t('task.comments.submit')}
        </button>
      </div>
    </form>
  );
}
