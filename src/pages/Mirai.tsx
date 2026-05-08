import { useEffect, useMemo, useRef, useState } from 'react';
import { MiraiSphere } from '@/components/MiraiSphere';
import { Mascot } from '@/components/Mascot';
import {
  MIRAI_PERSONAS,
  MIRAI_PERSONA_LABEL,
  streamMiraiChat,
  useMiraiConversations,
  useMiraiHandoff,
  useMiraiMessages,
  type MiraiPersonaKey,
  type MiraiSource,
} from '@/lib/mirai';
import { useAuth } from '@/lib/store';

const SUGGESTIONS = [
  'Bu həftəki tapşırıqları yığ',
  'Hansı debitorlar gecikib?',
  'Aksent kontraktının statusunu yoxla',
  'Cash forecast 30 gün',
];

type Msg = { role: 'user' | 'assistant'; content: string; sources?: MiraiSource[] };

export function MiraiPage() {
  const { isAdmin } = useAuth();
  const [persona, setPersona] = useState<MiraiPersonaKey>('general');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [thinking, setThinking] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const conversations = useMiraiConversations();
  const history = useMiraiMessages(conversationId);

  // Realtime handoff — PRD §3.4. Same-user inserts on another tab/device
  // wake the message list (reload on the next read).
  useMiraiHandoff(conversationId);

  // Hydrate the message list from the server when a conversation is resumed
  // or when Realtime invalidation fires. Skipped while the user is mid-stream
  // (thinking) so we don't clobber the in-progress assistant draft.
  useEffect(() => {
    if (thinking) return;
    if (!conversationId || !history.data) return;
    setMsgs(
      history.data
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    );
  }, [conversationId, history.data, thinking]);

  const visiblePersonas = useMemo(
    () => MIRAI_PERSONAS.filter((p) => !p.admin || isAdmin),
    [isAdmin],
  );

  function startNewConversation(nextPersona: MiraiPersonaKey = persona) {
    abortRef.current?.abort();
    setPersona(nextPersona);
    setConversationId(null);
    setMsgs([]);
    setThinking(false);
  }

  function onPersonaSwitch(next: MiraiPersonaKey) {
    if (next === persona) return;
    // Persona is per-conversation (PRD §7.2 doesn't address mid-thread
    // switching; treating persona as a session property keeps semantics
    // clean and aligns with how mirai_conversations.persona is stored).
    startNewConversation(next);
  }

  async function ask(text: string) {
    if (!text.trim()) return;
    setMsgs((m) => [...m, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    setQ('');
    setThinking(true);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    await streamMiraiChat(
      { message: text, persona, conversation_id: conversationId },
      {
        onMeta: (meta) => {
          setConversationId(meta.conversation_id);
          setMsgs((m) => updateLastAssistant(m, (last) => ({ ...last, sources: meta.sources })));
        },
        onDelta: (delta) => {
          setMsgs((m) => updateLastAssistant(m, (last) => ({ ...last, content: last.content + delta })));
        },
        onDone: () => setThinking(false),
        onError: (err) => {
          setMsgs((m) =>
            updateLastAssistant(m, (last) => ({
              ...last,
              content: last.content || `Bunu mənbədən təsdiqləyə bilmirəm — ${err}`,
            })),
          );
          setThinking(false);
        },
      },
      abortRef.current.signal,
    );
  }

  return (
    <div
      className="-mx-6 lg:-mx-10 -my-6 min-h-screen flex"
      style={{ background: 'var(--mirai-surface)', color: 'var(--canvas)' }}
    >
      {/* Conversation history sidebar */}
      <aside
        className="hidden md:flex flex-col w-[260px] shrink-0 border-r"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <div className="p-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <button
            type="button"
            className="btn-primary w-full"
            onClick={() => startNewConversation()}
          >
            + Yeni söhbət
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {conversations.isLoading ? (
            <div className="px-4 py-3 text-meta opacity-70">Yüklənir…</div>
          ) : (conversations.data ?? []).length === 0 ? (
            <div className="px-4 py-3 text-meta opacity-70">Hələ söhbət yoxdur.</div>
          ) : (
            (conversations.data ?? []).map((c) => {
              const active = c.id === conversationId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    abortRef.current?.abort();
                    setConversationId(c.id);
                    setPersona(c.persona);
                    setThinking(false);
                  }}
                  className="w-full text-left px-4 py-2"
                  style={{
                    background: active ? 'rgba(173,251,73,0.08)' : 'transparent',
                    color: 'var(--canvas)',
                  }}
                >
                  <div className="text-body truncate">
                    {MIRAI_PERSONA_LABEL[c.persona] ?? c.persona}
                  </div>
                  <div className="text-meta opacity-60">
                    {new Date(c.last_message_at ?? c.started_at).toLocaleString('az-Latn-AZ', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Main chat */}
      <div className="flex-1 px-6 lg:px-10 py-10 flex flex-col items-center">
        <MiraiSphere
          size={Math.min(280, typeof window !== 'undefined' ? window.innerWidth - 320 : 280)}
        />
        <h1 className="text-hero mt-4" style={{ letterSpacing: '-0.02em' }}>MIRAI</h1>
        <p className="text-ui mt-2 opacity-70 max-w-md text-center">
          {MIRAI_PERSONA_LABEL[persona]}
        </p>

        {/* Persona chips — PRD §7.2 */}
        <div className="flex flex-wrap gap-2 mt-5 max-w-[720px] justify-center">
          {visiblePersonas.map((p) => {
            const active = p.key === persona;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => onPersonaSwitch(p.key)}
                className="chip"
                style={{
                  background: active ? 'var(--brand-action)' : 'rgba(255,255,255,0.04)',
                  color: active ? 'var(--brand-text)' : 'var(--canvas)',
                  border: active ? '1px solid var(--brand-action)' : '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="w-full max-w-[720px] mt-8">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(q);
            }}
            className="flex gap-2"
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="MIRAI-dən soruş…"
              className="flex-1 h-12 rounded-btn px-4 text-body"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--canvas)',
              }}
            />
            <button type="submit" className="btn-primary">Göndər</button>
          </form>

          {msgs.length === 0 ? (
            <div className="flex flex-wrap gap-2 mt-3">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => ask(s)}
                  className="chip"
                  style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--canvas)' }}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-8 space-y-3">
            {thinking ? (
              <div className="flex items-center gap-3">
                <Mascot size={48} />
                <span className="text-ui opacity-80">MIRAI düşünür…</span>
              </div>
            ) : null}
            {msgs.slice().reverse().map((m, i) => (
              <article
                key={i}
                className="rounded-card p-4"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  marginLeft: m.role === 'user' ? 'auto' : 0,
                  maxWidth: '85%',
                }}
              >
                {m.role === 'assistant' ? (
                  <span
                    className="inline-block mb-2 px-2 h-[22px] leading-[22px] rounded-chip text-tiny"
                    style={{ background: 'rgba(173,251,73,0.08)', color: 'var(--brand-action)' }}
                  >
                    {MIRAI_PERSONA_LABEL[persona]}
                  </span>
                ) : null}
                <div className="text-body whitespace-pre-wrap">{m.content || '…'}</div>
                {m.sources && m.sources.length ? (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {m.sources.map((s, j) => (
                      <span
                        key={j}
                        className="chip"
                        style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--canvas)' }}
                        title={s.similarity != null ? `Oxşarlıq: ${(s.similarity * 100).toFixed(0)}%` : undefined}
                      >
                        Mənbə: {s.source_pdf} · Maddə {s.chunk_index}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function updateLastAssistant(msgs: Msg[], fn: (m: Msg) => Msg): Msg[] {
  const next = msgs.slice();
  const last = next[next.length - 1];
  if (last && last.role === 'assistant') next[next.length - 1] = fn(last);
  return next;
}
