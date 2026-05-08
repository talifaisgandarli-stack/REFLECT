import { useRef, useState } from 'react';
import { useUI } from '@/lib/store';
import { MiraiSphere } from './MiraiSphere';
import { Mascot } from './Mascot';
import { streamMiraiChat, useMiraiHandoff, type MiraiSource } from '@/lib/mirai';

type Msg = { role: 'user' | 'assistant'; content: string; sources?: MiraiSource[] };

export function MiraiDrawer() {
  const { miraiPanelOpen, toggleMirai } = useUI();
  const [q, setQ] = useState('');
  const [thinking, setThinking] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // PRD §3.4 cross-device handoff. Hook is safe to call when conversationId
  // is null — it no-ops until the first reply arrives.
  useMiraiHandoff(conversationId);

  if (!miraiPanelOpen) {
    return (
      <button
        type="button"
        onClick={toggleMirai}
        className="fixed bottom-6 right-6 rounded-full flex items-center justify-center shadow-card-hover"
        style={{
          width: 56,
          height: 56,
          background: 'var(--mirai-surface)',
          color: 'var(--canvas)',
        }}
        aria-label="MIRAI-dən soruş"
      >
        <MiraiSphere size={48} particles={120} />
      </button>
    );
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    const text = q;
    setQ('');
    setMsgs((m) => [...m, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    setThinking(true);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    await streamMiraiChat(
      { message: text, persona: 'general', conversation_id: conversationId },
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
              content: last.content || `Xəta: ${err}`,
            })),
          );
          setThinking(false);
        },
      },
      abortRef.current.signal,
    );
  }

  return (
    <aside
      className="fixed top-0 right-0 bottom-0 w-[420px] z-40 flex flex-col"
      style={{ background: 'var(--mirai-surface)', color: 'var(--canvas)' }}
    >
      <div className="flex items-center justify-between p-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <MiraiSphere size={32} particles={80} />
          <span className="text-h4">MIRAI</span>
        </div>
        <button onClick={toggleMirai} className="text-meta opacity-70 hover:opacity-100">
          Bağla
        </button>
      </div>
      <div className="flex-1 p-4 overflow-y-auto text-body space-y-3">
        {msgs.length === 0 ? (
          <p className="text-ui opacity-70">
            Sual ver — tapşırıqlar, layihələr, maliyyə, müştərilər haqqında.
          </p>
        ) : (
          msgs.map((m, i) => (
            <div
              key={i}
              className="rounded-card p-3"
              style={{
                background: m.role === 'user' ? 'rgba(173,251,73,0.08)' : 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                marginLeft: m.role === 'user' ? 'auto' : 0,
                maxWidth: '90%',
              }}
            >
              <div className="text-body whitespace-pre-wrap">{m.content || '…'}</div>
              {m.sources && m.sources.length ? (
                <div className="flex flex-wrap gap-1 mt-2">
                  {m.sources.map((s, j) => (
                    <span
                      key={j}
                      className="chip text-tiny"
                      style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--canvas)' }}
                    >
                      {s.source_pdf} · {s.chunk_index}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
        {thinking ? (
          <div className="flex items-center gap-3">
            <Mascot size={36} />
            <span className="text-ui opacity-80">MIRAI düşünür…</span>
          </div>
        ) : null}
      </div>
      <form onSubmit={ask} className="p-4 border-t border-white/5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="MIRAI-dən soruş…"
          className="w-full h-10 rounded-btn px-3 text-body"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'var(--canvas)',
          }}
        />
      </form>
    </aside>
  );
}

function updateLastAssistant(msgs: Msg[], fn: (m: Msg) => Msg): Msg[] {
  const next = msgs.slice();
  const last = next[next.length - 1];
  if (last && last.role === 'assistant') next[next.length - 1] = fn(last);
  return next;
}
