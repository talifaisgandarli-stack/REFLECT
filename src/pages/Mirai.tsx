import { useRef, useState } from 'react';
import { MiraiSphere } from '@/components/MiraiSphere';
import { Mascot } from '@/components/Mascot';
import { streamMiraiChat, useMiraiHandoff, type MiraiSource } from '@/lib/mirai';

const SUGGESTIONS = [
  'Bu həftəki tapşırıqları yığ',
  'Hansı debitorlar gecikib?',
  'Aksent kontraktının statusunu yoxla',
  'Cash forecast 30 gün',
];

type Msg = { role: 'user' | 'assistant'; content: string; sources?: MiraiSource[] };

export function MiraiPage() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [thinking, setThinking] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Realtime handoff — PRD §3.4. Same-user inserts on another tab/device
  // wake the message list (reload on the next read).
  useMiraiHandoff(conversationId);

  async function ask(text: string) {
    if (!text.trim()) return;
    setMsgs((m) => [...m, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    setQ('');
    setThinking(true);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    await streamMiraiChat(
      { message: text, persona: 'general', conversation_id: conversationId },
      {
        onMeta: (meta) => {
          setConversationId(meta.conversation_id);
          setMsgs((m) => {
            const next = m.slice();
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = { ...last, sources: meta.sources };
            }
            return next;
          });
        },
        onDelta: (delta) => {
          setMsgs((m) => {
            const next = m.slice();
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = { ...last, content: last.content + delta };
            }
            return next;
          });
        },
        onDone: () => setThinking(false),
        onError: (err) => {
          setMsgs((m) => {
            const next = m.slice();
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = {
                ...last,
                content: last.content || `Bunu mənbədən təsdiqləyə bilmirəm — ${err}`,
              };
            }
            return next;
          });
          setThinking(false);
        },
      },
      abortRef.current.signal,
    );
  }

  return (
    <div
      className="min-h-screen -mx-6 lg:-mx-10 -my-6 px-6 lg:px-10 py-12 flex flex-col items-center"
      style={{ background: 'var(--mirai-surface)', color: 'var(--canvas)' }}
    >
      <MiraiSphere size={Math.min(360, typeof window !== 'undefined' ? window.innerWidth - 80 : 360)} />
      <h1 className="text-hero mt-6" style={{ letterSpacing: '-0.02em' }}>MIRAI</h1>
      <p className="text-ui mt-2 opacity-70 max-w-md text-center">
        Sənin layihə rəhbərin, maliyyə analitikin, və CMO-n. Soruş.
      </p>

      <div className="w-full max-w-[720px] mt-10">
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
                  MIRAI
                </span>
              ) : null}
              <div className="text-body whitespace-pre-wrap">{m.content}</div>
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
  );
}
