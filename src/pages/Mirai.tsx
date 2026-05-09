import { useState } from 'react';
import { MiraiSphere } from '@/components/MiraiSphere';
import { Mascot } from '@/components/Mascot';
import { MiraiHistory } from '@/components/MiraiHistory';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';

type Persona = 'general' | 'project_manager' | 'finance_analyst' | 'cmo' | 'hr_partner';

const PERSONAS: Array<{ key: Persona; label: string; tagline: string; adminOnly?: boolean }> = [
  { key: 'general', label: 'Köməkçi', tagline: 'Universal — sual ver, kömək alın.' },
  { key: 'project_manager', label: 'Layihə Mühəndisi', tagline: 'Tapşırıq, deadline, faza.' },
  {
    key: 'finance_analyst',
    label: 'Maliyyə Analitiki',
    tagline: 'Cash flow, P&L, forecast.',
    adminOnly: true,
  },
  { key: 'cmo', label: 'CMO', tagline: 'Trend, mükafat, məzmun.', adminOnly: true },
  { key: 'hr_partner', label: 'HR', tagline: 'Karyera, performans.', adminOnly: true },
];

const SUGGESTIONS_BY_PERSONA: Record<Persona, string[]> = {
  general: [
    'Bu həftəki tapşırıqları yığ',
    'MIRAI nə edə bilər?',
    'Aktiv layihələrin statusu',
    'Bilik bazasından AZDNT 2.04 tap',
  ],
  project_manager: [
    'Bu həftə hansı tapşırıqlar gecikəcək?',
    'Aksent layihəsinin fazaları',
    'Boş icraçısı olan tapşırıqlar',
    'Ekspertiza gözləyənlər',
  ],
  finance_analyst: [
    'Cari ay gəliri',
    'Hansı debitorlar 30 gündən çoxdur?',
    'Cash forecast 60 gün',
    'Layihə üzrə P&L — ilk 5',
  ],
  cmo: [
    'Bu həftəki ArchDaily trend xülasəsi',
    'Yaxınlaşan mükafat müraciətləri',
    'Müştəri portfelinə tövsiyə',
    'Press release qaralaması',
  ],
  hr_partner: [
    'Bu il məzuniyyət balansı',
    'Performans (At Risk siyahısı)',
    'Karyera promosyon yolu',
    'Yeni dəvət göndər',
  ],
};

type Source = { name: string; page?: number };
type Msg = { role: 'user' | 'assistant'; content: string; sources?: Source[] };
type Usage = { spent_usd: number; cap_usd: number; pct: number; warning: string | null };

export function MiraiPage() {
  const { isAdmin, profile } = useAuth();
  const [persona, setPersona] = useState<Persona>('general');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [thinking, setThinking] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const SUGGESTIONS = SUGGESTIONS_BY_PERSONA[persona];

  function changePersona(next: Persona) {
    if (next === persona) return;
    // PRD §7.2 — "Persona switch starts a new conversation context"
    setPersona(next);
    setMsgs([]);
    setConversationId(null);
    setError(null);
  }

  async function ask(text: string) {
    if (!text.trim()) return;
    setMsgs((m) => [...m, { role: 'user', content: text }]);
    setQ('');
    setThinking(true);
    setError(null);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        throw new Error('Sessiya tapılmadı — yenidən daxil ol.');
      }

      const res = await fetch('/api/mirai/stream', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: text,
          persona,
          conversation_id: conversationId,
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `MIRAI xətası (${res.status})`);
      }

      // Insert an empty assistant bubble that we'll mutate in place as
      // tokens arrive — feels alive without keeping a separate state.
      let bubbleIndex = -1;
      setMsgs((m) => {
        bubbleIndex = m.length;
        return [...m, { role: 'assistant', content: '', sources: [] }];
      });
      // bubbleIndex is captured by the closure below

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let collected = '';
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let frame: { type: string; [k: string]: unknown };
          try {
            frame = JSON.parse(line);
          } catch {
            continue;
          }
          if (frame.type === 'delta' && typeof frame.text === 'string') {
            collected += frame.text;
            const snapshot = collected;
            setMsgs((m) =>
              m.map((msg, i) => (i === bubbleIndex ? { ...msg, content: snapshot } : msg)),
            );
          } else if (frame.type === 'sources' && Array.isArray(frame.items)) {
            const items = frame.items as Source[];
            setMsgs((m) =>
              m.map((msg, i) => (i === bubbleIndex ? { ...msg, sources: items } : msg)),
            );
          } else if (frame.type === 'done') {
            if (typeof frame.conversation_id === 'string') {
              setConversationId(frame.conversation_id);
            }
            if (frame.usage) setUsage(frame.usage as Usage);
          } else if (frame.type === 'error' && typeof frame.message === 'string') {
            throw new Error(frame.message);
          }
        }
      }
      if (!collected.trim()) {
        setMsgs((m) =>
          m.map((msg, i) =>
            i === bubbleIndex ? { ...msg, content: 'Cavab boş gəldi.' } : msg,
          ),
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Bunu mənbədən təsdiqləyə bilmirəm.';
      setError(msg);
      setMsgs((m) => [...m, { role: 'assistant', content: msg }]);
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
        {PERSONAS.find((p) => p.key === persona)?.tagline ??
          'Sənin layihə rəhbərin, maliyyə analitikin, və CMO-n. Soruş.'}
      </p>

      <div
        role="tablist"
        aria-label="MIRAI persona"
        className="flex flex-wrap justify-center gap-2 mt-6 max-w-[720px]"
      >
        {PERSONAS.filter((p) => !p.adminOnly || isAdmin).map((p) => {
          const active = persona === p.key;
          return (
            <button
              key={p.key}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => changePersona(p.key)}
              className="chip"
              style={{
                background: active
                  ? 'var(--brand-action)'
                  : 'rgba(255,255,255,0.04)',
                color: active ? 'var(--ink)' : 'var(--canvas)',
                height: 32,
                padding: '0 14px',
              }}
            >
              {p.label}
            </button>
          );
        })}
        {profile?.id ? (
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="chip"
            style={{
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--canvas)',
              height: 32,
              padding: '0 14px',
            }}
            title="Keçmiş söhbətlər"
          >
            Tarixçə
          </button>
        ) : null}
      </div>

      {profile?.id ? (
        <MiraiHistory
          userId={profile.id}
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          onLoad={({ conversationId: cid, persona: p, messages }) => {
            setPersona(p);
            setConversationId(cid);
            setMsgs(messages);
            setError(null);
          }}
        />
      ) : null}

      <div className="w-full max-w-[720px] mt-6">
        {usage?.warning === 'budget_80pct' ? (
          <div
            role="status"
            className="rounded-card px-4 py-3 mb-4 text-meta flex items-center justify-between"
            style={{
              background: 'rgba(217, 119, 6, 0.12)',
              border: '1px solid rgba(217, 119, 6, 0.4)',
              color: '#FFD9A8',
            }}
          >
            <span>
              Aylıq MIRAI büdcənin {Math.round(usage.pct * 100)}%-i istifadə olunub
              ({usage.spent_usd.toFixed(2)}$ / {usage.cap_usd}$).
            </span>
            <span className="opacity-70">Növbəti ay sıfırlanacaq</span>
          </div>
        ) : null}

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
          <button type="submit" className="btn-primary" disabled={thinking}>
            {thinking ? '…' : 'Göndər'}
          </button>
        </form>

        <div className="flex flex-wrap gap-2 mt-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              className="chip"
              style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--canvas)' }}
              disabled={thinking}
            >
              {s}
            </button>
          ))}
        </div>

        {error ? (
          <p className="text-meta mt-3" style={{ color: '#F87171' }}>
            {error}
          </p>
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
