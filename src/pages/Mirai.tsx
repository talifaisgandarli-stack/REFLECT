import { useState } from 'react';
import { MiraiSphere } from '@/components/MiraiSphere';
import { Mascot } from '@/components/Mascot';

const SUGGESTIONS = [
  'Bu həftəki tapşırıqları yığ',
  'Hansı debitorlar gecikib?',
  'Aksent kontraktının statusunu yoxla',
  'Cash forecast 30 gün',
];

type Msg = { role: 'user' | 'assistant'; content: string; sources?: { name: string; page?: number }[] };

export function MiraiPage() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [thinking, setThinking] = useState(false);

  async function ask(text: string) {
    if (!text.trim()) return;
    setMsgs((m) => [...m, { role: 'user', content: text }]);
    setQ('');
    setThinking(true);
    try {
      const res = await fetch('/api/mirai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text, persona: 'general' }),
      });
      const data = await res.json().catch(() => null);
      const reply = data?.reply ?? 'Hazırda cavab verə bilmirəm.';
      setMsgs((m) => [...m, { role: 'assistant', content: reply, sources: data?.sources ?? [] }]);
    } catch {
      setMsgs((m) => [
        ...m,
        { role: 'assistant', content: 'Bunu mənbədən təsdiqləyə bilmirəm — əlaqə xətası.' },
      ]);
    } finally {
      setThinking(false);
    }
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
                    <span key={j} className="chip" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--canvas)' }}>
                      {s.name}{s.page ? ` · s.${s.page}` : ''}
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
