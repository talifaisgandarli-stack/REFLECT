import { useState } from 'react';
import { useUI } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { MiraiSphere } from './MiraiSphere';
import { Mascot } from './Mascot';

type Msg = { role: 'user' | 'assistant'; content: string };
type Usage = { spent_usd: number; cap_usd: number; pct: number; warning: string | null };

export function MiraiDrawer() {
  const { miraiPanelOpen, toggleMirai } = useUI();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [thinking, setThinking] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    const text = q.trim();
    if (!text) return;
    setMsgs((m) => [...m, { role: 'user', content: text }]);
    setQ('');
    setThinking(true);
    setError(null);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('Sessiya tapılmadı — yenidən daxil ol.');

      const res = await fetch('/api/mirai/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: text, persona: 'general', conversation_id: conversationId }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `MIRAI xətası (${res.status})`);

      const reply = data?.reply ?? 'Hazırda cavab verə bilmirəm.';
      setMsgs((m) => [...m, { role: 'assistant', content: reply }]);
      if (data?.conversation_id) setConversationId(data.conversation_id);
      if (data?.usage) setUsage(data.usage as Usage);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Xəta baş verdi.';
      setError(msg);
      setMsgs((m) => [...m, { role: 'assistant', content: msg }]);
    } finally {
      setThinking(false);
    }
  }

  return (
    <aside
      className="fixed top-0 right-0 bottom-0 w-[420px] z-40 flex flex-col"
      style={{ background: 'var(--mirai-surface)', color: 'var(--canvas)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <MiraiSphere size={32} particles={80} />
          <span className="text-h4">MIRAI</span>
        </div>
        <button onClick={toggleMirai} className="text-meta opacity-70 hover:opacity-100">
          Bağla
        </button>
      </div>

      {/* Budget warning — PRD §7.6 80% soft threshold */}
      {usage?.warning === 'budget_80pct' ? (
        <div
          role="status"
          className="px-4 py-2 text-tiny flex items-center justify-between"
          style={{
            background: 'rgba(217, 119, 6, 0.15)',
            borderBottom: '1px solid rgba(217, 119, 6, 0.3)',
            color: '#FFD9A8',
          }}
        >
          <span>Büdcənin {Math.round(usage.pct * 100)}%-i istifadə olunub</span>
          <span className="opacity-70">{usage.spent_usd.toFixed(2)}$ / {usage.cap_usd}$</span>
        </div>
      ) : null}

      {/* Messages */}
      <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3">
        {msgs.length === 0 && !thinking ? (
          <p className="text-ui opacity-70">
            Sual ver — tapşırıqlar, layihələr, maliyyə, müştərilər haqqında.
          </p>
        ) : null}
        {msgs.map((m, i) => (
          <div
            key={i}
            className="rounded-card p-3 text-body whitespace-pre-wrap"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.07)',
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '90%',
            }}
          >
            {m.role === 'assistant' ? (
              <span
                className="inline-block mb-1 px-1.5 text-tiny rounded"
                style={{ background: 'rgba(173,251,73,0.08)', color: 'var(--brand-action)' }}
              >
                MIRAI
              </span>
            ) : null}
            <div>{m.content}</div>
          </div>
        ))}
        {thinking ? (
          <div className="flex items-center gap-3">
            <Mascot size={36} />
            <span className="text-ui opacity-80">MIRAI düşünür…</span>
          </div>
        ) : null}
        {error ? (
          <p className="text-tiny" style={{ color: '#F87171' }}>{error}</p>
        ) : null}
      </div>

      {/* Input */}
      <form onSubmit={ask} className="p-4 border-t border-white/5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="MIRAI-dən soruş…"
          disabled={thinking}
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
