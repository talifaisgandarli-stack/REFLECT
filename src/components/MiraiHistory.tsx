/**
 * MIRAI conversation history drawer — slides in from the left of the
 * dark MIRAI surface. Lists the user's recent mirai_conversations with
 * the first user message as a preview, persona tag, and last_message_at
 * timestamp. Selecting a row loads its messages into the parent page so
 * the user can resume.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { relativeTime } from '@/lib/format';

type Persona = 'general' | 'project_manager' | 'finance_analyst' | 'cmo' | 'hr_partner';

type Conversation = {
  id: string;
  persona: Persona;
  started_at: string;
  last_message_at: string | null;
  preview: string | null;
};

type Source = { name: string; page?: number };
type Msg = { role: 'user' | 'assistant'; content: string; sources?: Source[] };

const PERSONA_LABEL: Record<Persona, string> = {
  general: 'Köməkçi',
  project_manager: 'Layihə Mühəndisi',
  finance_analyst: 'Maliyyə Analitiki',
  cmo: 'CMO',
  hr_partner: 'HR',
};

type Props = {
  userId: string;
  open: boolean;
  onClose: () => void;
  onLoad: (input: { conversationId: string; persona: Persona; messages: Msg[] }) => void;
};

export function MiraiHistory({ userId, open, onClose, onLoad }: Props) {
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const conversations = useQuery({
    queryKey: ['mirai-history', userId, showArchived ? 'archived' : 'active'],
    enabled: open && !!userId,
    queryFn: async (): Promise<Conversation[]> => {
      let q = supabase
        .from('mirai_conversations')
        .select('id, persona, started_at, last_message_at')
        .eq('user_id', userId)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(20);
      q = showArchived
        ? q.not('archived_at', 'is', null)
        : q.is('archived_at', null);
      const { data: convs, error } = await q;
      if (error) throw error;
      const list = (convs ?? []) as Array<Omit<Conversation, 'preview'>>;
      if (list.length === 0) return [];

      // First user message per conversation as the preview line.
      const ids = list.map((c) => c.id);
      const { data: previews } = await supabase
        .from('mirai_messages')
        .select('conversation_id, content, role, created_at')
        .in('conversation_id', ids)
        .eq('role', 'user')
        .order('created_at', { ascending: true });
      const firstByConv = new Map<string, string>();
      for (const m of (previews ?? []) as Array<{
        conversation_id: string;
        content: string;
      }>) {
        if (!firstByConv.has(m.conversation_id)) {
          firstByConv.set(m.conversation_id, m.content);
        }
      }
      return list.map((c) => ({
        ...c,
        preview: firstByConv.get(c.id) ?? null,
      }));
    },
  });

  const archiveToggle = useMutation({
    mutationFn: async (input: { id: string; archive: boolean }) => {
      const { error } = await supabase
        .from('mirai_conversations')
        .update({ archived_at: input.archive ? new Date().toISOString() : null })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mirai-history'] }),
  });

  async function selectConversation(c: Conversation) {
    const { data, error } = await supabase
      .from('mirai_messages')
      .select('role, content, created_at')
      .eq('conversation_id', c.id)
      .order('created_at', { ascending: true });
    if (error) {
      // Don't block the user — just close.
      onClose();
      return;
    }
    const messages: Msg[] = ((data ?? []) as Array<{ role: string; content: string }>)
      .filter((r) => r.role === 'user' || r.role === 'assistant')
      .map((r) => ({ role: r.role as 'user' | 'assistant', content: r.content }));
    onLoad({ conversationId: c.id, persona: c.persona, messages });
    onClose();
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="MIRAI tarixçə"
      className="fixed inset-0 z-50"
      style={{ background: 'rgba(14,22,17,0.5)' }}
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="h-full w-[360px] max-w-[92vw] overflow-y-auto"
        style={{
          background: 'var(--mirai-surface)',
          color: 'var(--canvas)',
          borderRight: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <header
          className="px-5 py-4 flex items-center justify-between gap-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="flex items-center gap-2">
            <h2 className="text-h3" style={{ color: 'var(--canvas)' }}>
              Tarixçə
            </h2>
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="text-tiny"
              style={{
                background: showArchived ? 'rgba(173,251,73,0.18)' : 'rgba(255,255,255,0.06)',
                color: showArchived ? 'var(--brand-action)' : 'var(--canvas)',
                padding: '4px 10px',
                borderRadius: 6,
                border: 0,
                cursor: 'pointer',
                opacity: showArchived ? 1 : 0.7,
              }}
            >
              {showArchived ? 'Arxiv' : 'Aktiv'}
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Bağla"
            style={{
              color: 'var(--canvas)',
              opacity: 0.7,
              fontSize: 22,
              lineHeight: 1,
              background: 'transparent',
              border: 0,
            }}
          >
            ×
          </button>
        </header>

        {conversations.isLoading ? (
          <p className="px-5 py-4 opacity-70">Yüklənir…</p>
        ) : (conversations.data ?? []).length === 0 ? (
          <p className="px-5 py-4 opacity-70">Hələ söhbət yoxdur.</p>
        ) : (
          <ul>
            {(conversations.data ?? []).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => selectConversation(c)}
                  className="w-full text-left px-5 py-3"
                  style={{
                    background: 'transparent',
                    border: 0,
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    color: 'var(--canvas)',
                    cursor: 'pointer',
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className="text-tiny"
                      style={{
                        background: 'rgba(173,251,73,0.1)',
                        color: 'var(--brand-action)',
                        padding: '2px 8px',
                        borderRadius: 6,
                      }}
                    >
                      {PERSONA_LABEL[c.persona]}
                    </span>
                    <span className="text-meta opacity-60">
                      {relativeTime(c.last_message_at ?? c.started_at)}
                    </span>
                  </div>
                  <p
                    className="text-body"
                    style={{
                      color: 'var(--canvas)',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {c.preview ?? '— başlıq yoxdur —'}
                  </p>
                </button>
                <div className="px-5 pb-3 -mt-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      archiveToggle.mutate({ id: c.id, archive: !showArchived })
                    }
                    disabled={archiveToggle.isPending}
                    className="text-meta"
                    style={{
                      background: 'transparent',
                      border: 0,
                      color: 'var(--canvas)',
                      opacity: 0.55,
                      cursor: 'pointer',
                    }}
                  >
                    {showArchived ? 'Bərpa et' : 'Arxivə'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
