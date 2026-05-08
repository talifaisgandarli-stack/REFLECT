import { useState } from 'react';
import { MiraiSphere } from '@/components/MiraiSphere';
import { Mascot } from '@/components/Mascot';
import { supabase } from '@/lib/supabase';

const SUGGESTIONS = [
  'Bu həftəki tapşırıqları yığ',
  'Hansı debitorlar gecikib?',
  'Aksent kontraktının statusunu yoxla',
  'Cash forecast 30 gün',
];

type Source = { source_pdf: string; chunk_index: number; similarity: number };
type Msg = { role: 'user' | 'assistant'; content: string; sources?: Source[] };

export function MiraiPage() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [streaming, setStreaming] = useState(false);

  async function ask(text: string) {
    if (!text.trim() || streaming) return;
    setMsgs((m) => [...m, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    setQ('');
    setStreaming(true);

    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;

    try {
      const res = await fetch('/api/mirai/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: text, persona: 'general' }),
      });
      if (!res.ok || !res.body) {
        const fallback =
          (await res.json().catch(() => ({}))).error ?? 'Hazırda cavab verə bilmirəm.';
        appendLast(fallback);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let collectedSources: Source[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const block of events) {
          const line = block.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          const payload = line.slice(6);
          if (!payload) continue;
          let evt: { type: string; text?: string; sources?: Source[]; message?: string };
          try {
            evt = JSON.parse(payload);
          } catch {
            continue;
          }
          if (evt.type === 'meta') {
            collectedSources = evt.sources ?? [];
            updateLastSources(collectedSources);
          } else if (evt.type === 'delta' && evt.text) {
            appendLastChunk(evt.text);
          } else if (evt.type === 'error') {
            appendLastChunk(`\n\n(xəta: ${evt.message ?? 'naməlum'})`);
          }
          // 'done' just closes the stream
        }
      }
    } catch {
      appendLast('Bunu mənbədən təsdiqləyə bilmirəm — əlaqə xətası.');
    } finally {
      setStreaming(false);
    }
  }

  function appendLast(text: string) {
    setMsgs((m) =>
      m.map((msg, i) =>
        i === m.length - 1 && msg.role === 'assistant' ? { ...msg, content: text } : msg,
      ),
    );
  }
  function appendLastChunk(text: string) {
    setMsgs((m) =>
      m.map((msg, i) =>
        i === m.length - 1 && msg.role === 'assistant'
          ? { ...msg, content: msg.content + text }
          : msg,
      ),
    );
  }
  function updateLastSources(sources: Source[]) {
    setMsgs((m) =>
      m.map((msg, i) =>
        i === m.length - 1 && msg.role === 'assistant' ? { ...msg, sources } : msg,
      ),
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
          {streaming && msgs.length > 0 && msgs[msgs.length - 1].content === '' ? (
            <div className="flex items-center gap-3">
              <Mascot size={48} />
              <span className="text-ui opacity-80">MIRAI yazır…</span>
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
              <div className="text-body whitespace-pre-wrap">
                {m.content || (m.role === 'assistant' && streaming ? '…' : '')}
              </div>
              {m.sources && m.sources.length ? (
                <div className="flex flex-wrap gap-2 mt-3">
                  {m.sources.map((s, j) => (
                    <span
                      key={j}
                      className="chip"
                      style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--canvas)' }}
                    >
                      {s.source_pdf} · maddə {s.chunk_index}
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
