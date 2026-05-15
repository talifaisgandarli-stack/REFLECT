/**
 * MIRAI page — PRD §7.
 * §7.2: Persona switcher — 6 admin personas + 1 user persona.
 * §7.4: RAG citations shown as source chips.
 * §7.6: Cost guardian warning banner + disabled state.
 * Conversation history loaded from mirai_conversations (last session per persona).
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MiraiSphere } from '@/components/MiraiSphere';
import { Mascot } from '@/components/Mascot';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';

type PersonaKey =
  | 'general'
  | 'operations_director'
  | 'project_manager'
  | 'legal'
  | 'cmo'
  | 'finance_analyst'
  | 'strategist'
  | 'team_assistant';

type PersonaMeta = { key: PersonaKey; label: string; adminOnly: boolean; hint: string };

// PRD §7.2 — 6 admin personas + 1 user persona
const PERSONAS: PersonaMeta[] = [
  { key: 'general', label: 'MIRAI', adminOnly: false, hint: 'Ümumi köməkçi' },
  { key: 'operations_director', label: 'Əməliyyat Direktoru', adminOnly: true, hint: 'Proses, resurs, kapasitə' },
  { key: 'project_manager', label: 'Layihə Mühəndisi', adminOnly: true, hint: 'Tapşırıq, deadline, faza' },
  { key: 'legal', label: 'Hüquqşünas', adminOnly: true, hint: 'AZ normativlər (RAG)' },
  { key: 'cmo', label: 'CMO', adminOnly: true, hint: 'Trend, mükafat, məzmun' },
  { key: 'finance_analyst', label: 'Maliyyə Analitiki', adminOnly: true, hint: 'Cash flow, P&L, forecast' },
  { key: 'strategist', label: 'Strateq', adminOnly: true, hint: 'Uzunmüddətli inkişaf' },
  { key: 'team_assistant', label: 'Komanda Köməkçisi', adminOnly: false, hint: 'Tapşırıqlar, məlumat' },
];

type Source = { name: string; page?: number };
type Msg = { role: 'user' | 'assistant'; content: string; sources?: Source[]; dbId?: string };
type Usage = { spent_usd: number; cap_usd: number; pct: number; warning: string | null };

const SUGGESTIONS: Record<PersonaKey, string[]> = {
  general: ['Bu həftəki tapşırıqları yığ', 'Ən yaxın deadline hansıdır?'],
  operations_director: ['Komandanın iş yükünü analiz et', 'Proseslərdə boşluq var mı?'],
  project_manager: ['Gecikmiş tapşırıqları göstər', 'Aktiv layihələrin fazaları'],
  legal: ['Ekspertiza üçün tələblər nədir?', 'Layihə müqaviləsinin əsas şərtləri'],
  cmo: ['Bu ay üçün məzmun ideyaları', 'Regional arxitektura mükafatları'],
  finance_analyst: ['Cash forecast 30 gün', 'Bu ayın balansı necədir?'],
  strategist: ['Rəqabət mövqeyimiz necədir?', '6 aylıq inkişaf planı'],
  team_assistant: ['Bugün nə etməliyəm?', 'Ən vacib tapşırığım hansıdır?'],
};

export function MiraiPage() {
  const { isAdmin, profile } = useAuth();
  const qc = useQueryClient();
  const [persona, setPersona] = useState<PersonaKey>(isAdmin ? 'general' : 'team_assistant');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [thinking, setThinking] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [budgetInput, setBudgetInput] = useState('');
  const [budgetSaved, setBudgetSaved] = useState(false);
  // REQ-7.9 — thumbs feedback keyed by message index in current thread
  const [feedbackGiven, setFeedbackGiven] = useState<Record<number, 'up' | 'down'>>({});

  // REQ-MIRAI-05 — admin reads/sets monthly budget cap from system_settings.
  // Stored as jsonb { usd: number } (must match api/mirai/chat.ts reader).
  const budgetSetting = useQuery({
    queryKey: ['system_settings', 'mirai_monthly_budget'],
    queryFn: async (): Promise<string> => {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'mirai_monthly_budget')
        .maybeSingle();
      const v = data?.value as { usd?: number } | null | undefined;
      return typeof v?.usd === 'number' ? String(v.usd) : '5';
    },
    enabled: !!isAdmin,
  });

  const saveBudget = useMutation({
    mutationFn: async (val: string) => {
      const num = Number(val);
      if (!Number.isFinite(num) || num <= 0) throw new Error('Düzgün məbləğ daxil edin');
      const { error } = await supabase
        .from('system_settings')
        .upsert({ key: 'mirai_monthly_budget', value: { usd: num } }, { onConflict: 'key' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system_settings'] });
      setBudgetSaved(true);
      setTimeout(() => setBudgetSaved(false), 2000);
    },
  });

  const availablePersonas = PERSONAS.filter((p) => isAdmin || !p.adminOnly);
  const budgetExhausted = !!(usage && usage.warning === null && usage.pct >= 1);

  // Load last conversation for this persona (PRD §7.2)
  useEffect(() => {
    setMsgs([]);
    setConversationId(null);
    setHistoryLoaded(false);
    setError(null);
    setFeedbackGiven({});

    let cancelled = false;
    async function loadHistory() {
      const { data: conv } = await supabase
        .from('mirai_conversations')
        .select('id')
        .eq('persona', persona)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!conv || cancelled) { setHistoryLoaded(true); return; }

      const { data: messages } = await supabase
        .from('mirai_messages')
        .select('id, role, content')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: true })
        .limit(20);

      if (cancelled) return;
      if (messages && messages.length) {
        setConversationId(conv.id);
        setMsgs(messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content, dbId: m.id })));
      }
      setHistoryLoaded(true);
    }
    loadHistory();
    return () => { cancelled = true; };
  }, [persona]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, thinking]);

  async function ask(text: string) {
    if (!text.trim() || budgetExhausted) return;
    setMsgs((m) => [...m, { role: 'user', content: text }]);
    setQ('');
    setThinking(true);
    setError(null);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('Sessiya tapılmadı — yenidən daxil ol.');

      // PRD §7.1 — SSE streaming (?stream=1); server yields delta events so
      // tokens render progressively instead of waiting for full response.
      const res = await fetch('/api/mirai/chat?stream=1', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: text, persona, conversation_id: conversationId }),
      });

      if (!res.ok || !res.body) {
        // Fallback: server returned error or no body — parse as JSON
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `MIRAI xətası (${res.status})`);
      }

      // Add a placeholder assistant message we'll stream into
      setMsgs((m) => [...m, { role: 'assistant', content: '' }]);
      setThinking(false); // cursor shown via empty content, stop spinner

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let metaSources: Source[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by \n\n
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? ''; // keep incomplete trailing frame

        for (const frame of frames) {
          const eventLine = frame.match(/^event: (\w+)/m)?.[1];
          const dataLine = frame.match(/^data: (.+)/ms)?.[1];
          if (!dataLine) continue;
          let payload: Record<string, unknown>;
          try { payload = JSON.parse(dataLine); } catch { continue; }

          if (eventLine === 'meta') {
            metaSources = (payload.sources as Source[]) ?? [];
          } else if (eventLine === 'delta') {
            // Append token to the last (assistant) message
            setMsgs((m) => {
              const next = [...m];
              const last = next[next.length - 1];
              if (last?.role === 'assistant') {
                next[next.length - 1] = { ...last, content: last.content + (payload.text as string ?? '') };
              }
              return next;
            });
          } else if (eventLine === 'done') {
            // Finalise: set sources + conversation_id + usage
            const conv = payload.conversation_id as string | undefined;
            if (conv) setConversationId(conv);
            if (payload.usage) setUsage(payload.usage as Usage);
            setMsgs((m) => {
              const next = [...m];
              const last = next[next.length - 1];
              if (last?.role === 'assistant') {
                next[next.length - 1] = {
                  ...last,
                  content: last.content || (payload.reply as string) || 'Hazırda cavab verə bilmirəm.',
                  sources: metaSources,
                };
              }
              return next;
            });
          } else if (eventLine === 'error') {
            throw new Error((payload.error as string) ?? 'MIRAI axın xətası');
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Xəta baş verdi.';
      setError(msg);
    } finally {
      setThinking(false);
    }
  }

  // REQ-7.9 — record thumbs up/down for assistant message
  async function giveFeedback(msgIndex: number, vote: 'up' | 'down', dbId?: string) {
    if (feedbackGiven[msgIndex]) return;
    setFeedbackGiven((prev) => ({ ...prev, [msgIndex]: vote }));
    await supabase.from('mirai_feedback').insert({
      user_id: profile?.id,
      conversation_id: conversationId,
      message_id: dbId ?? null,
      message_index: msgIndex,
      vote,
    });
  }

  function switchPersona(key: PersonaKey) {
    if (key === persona) return;
    setPersona(key);
  }

  const currentPersonaMeta = PERSONAS.find((p) => p.key === persona)!;

  return (
    <div
      className="min-h-screen -mx-6 lg:-mx-10 -my-6 px-4 lg:px-8 py-10 flex flex-col items-center"
      style={{ background: 'var(--mirai-surface)', color: 'var(--canvas)' }}
    >
      <MiraiSphere size={Math.min(280, typeof window !== 'undefined' ? window.innerWidth - 80 : 280)} />
      <h1 className="text-hero mt-4" style={{ letterSpacing: '-0.02em' }}>MIRAI</h1>
      <p className="text-ui mt-1 opacity-70 max-w-md text-center">
        {currentPersonaMeta.label} · {currentPersonaMeta.hint}
      </p>

      {/* Persona switcher — PRD §7.2 */}
      <div className="flex flex-wrap gap-2 justify-center mt-5 max-w-2xl">
        {availablePersonas.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => switchPersona(p.key)}
            className="chip"
            title={p.hint}
            style={{
              background: persona === p.key ? 'var(--brand-action)' : 'rgba(255,255,255,0.06)',
              color: persona === p.key ? 'var(--ink)' : 'var(--canvas)',
              fontWeight: persona === p.key ? 600 : 400,
              border: persona === p.key ? 'none' : '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="w-full max-w-[720px] mt-8">
        {/* Budget warning — PRD §7.6 */}
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
              Aylıq MIRAI büdcənin {Math.round((usage.pct) * 100)}%-i istifadə olunub
              ({usage.spent_usd.toFixed(2)}$ / {usage.cap_usd}$).
            </span>
            <span className="opacity-70">Növbəti ay sıfırlanacaq</span>
          </div>
        ) : null}

        {budgetExhausted ? (
          <div
            role="alert"
            className="rounded-card px-4 py-3 mb-4 text-body"
            style={{ background: 'rgba(185,28,28,0.15)', border: '1px solid rgba(185,28,28,0.4)', color: '#FCA5A5' }}
          >
            Bu ay MIRAI limitinə çatdınız. Növbəti ay yenilənəcək.
          </div>
        ) : null}

        {/* REQ-MIRAI-05 — admin budget cap editor */}
        {isAdmin ? (
          <div className="rounded-card px-4 py-3 mb-4 flex items-center gap-3 flex-wrap" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <span className="text-meta" style={{ color: 'rgba(255,255,255,0.5)' }}>Aylıq büdcə (USD):</span>
            <input
              type="number"
              className="input max-w-[90px]"
              style={{ height: 30, fontSize: 13, background: 'rgba(255,255,255,0.06)', color: 'var(--canvas)', border: '1px solid rgba(255,255,255,0.12)' }}
              value={budgetInput || budgetSetting.data || ''}
              onChange={(e) => setBudgetInput(e.target.value)}
              placeholder={budgetSetting.data ?? '10'}
            />
            <button
              className="chip"
              style={{ color: 'var(--canvas)', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
              disabled={saveBudget.isPending}
              onClick={() => saveBudget.mutate(budgetInput || budgetSetting.data || '10')}
            >
              {saveBudget.isPending ? '…' : 'Saxla'}
            </button>
            {budgetSaved ? <span className="text-meta" style={{ color: '#ADFB49' }}>✓</span> : null}
            {saveBudget.error ? <span className="text-meta" style={{ color: '#FCA5A5' }}>{(saveBudget.error as Error).message}</span> : null}
          </div>
        ) : null}

        {/* Input */}
        <form
          onSubmit={(e) => { e.preventDefault(); ask(q); }}
          className="flex gap-2"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`${currentPersonaMeta.label}-dən soruş…`}
            className="flex-1 h-12 rounded-btn px-4 text-body"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--canvas)',
            }}
            disabled={budgetExhausted}
          />
          <button type="submit" className="btn-primary" disabled={thinking || budgetExhausted}>
            {thinking ? '…' : 'Göndər'}
          </button>
        </form>

        {/* Suggestion chips */}
        <div className="flex flex-wrap gap-2 mt-3">
          {(SUGGESTIONS[persona] ?? []).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              className="chip"
              style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--canvas)' }}
              disabled={thinking || budgetExhausted}
            >
              {s}
            </button>
          ))}
        </div>

        {error ? (
          <p className="text-meta mt-3" style={{ color: '#F87171' }}>{error}</p>
        ) : null}

        {/* History loading placeholder */}
        {!historyLoaded ? (
          <div className="mt-6 text-meta opacity-50 text-center">Söhbət yüklənir…</div>
        ) : null}

        {/* Message thread */}
        <div className="mt-8 space-y-3">
          {msgs.map((m, i) => (
            <article
              key={i}
              className="rounded-card p-4"
              style={{
                background: m.role === 'user' ? 'rgba(255,255,255,0.06)' : 'rgba(173,251,73,0.04)',
                border: `1px solid ${m.role === 'user' ? 'rgba(255,255,255,0.08)' : 'rgba(173,251,73,0.12)'}`,
                marginLeft: m.role === 'user' ? 'auto' : 0,
                maxWidth: '88%',
              }}
            >
              {m.role === 'assistant' ? (
                <span
                  className="inline-block mb-2 px-2 h-[22px] leading-[22px] rounded-chip text-tiny"
                  style={{ background: 'rgba(173,251,73,0.08)', color: 'var(--brand-action)' }}
                >
                  {currentPersonaMeta.label}
                </span>
              ) : null}
              <div className="text-body whitespace-pre-wrap">{m.content}</div>
              {m.sources && m.sources.length ? (
                <div className="flex flex-wrap gap-2 mt-3">
                  {m.sources.map((s, j) => (
                    <span
                      key={j}
                      className="chip"
                      style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)', fontSize: 11 }}
                    >
                      {s.name}{s.page ? ` · s.${s.page}` : ''}
                    </span>
                  ))}
                </div>
              ) : null}
              {/* REQ-7.9 — thumbs up/down feedback (assistant only) */}
              {m.role === 'assistant' ? <div className="flex items-center gap-2 mt-3">
                {(['up', 'down'] as const).map((vote) => {
                  const icon = vote === 'up' ? '👍' : '👎';
                  const given = feedbackGiven[i];
                  const isChosen = given === vote;
                  const isDisabled = !!given;
                  return (
                    <button
                      key={vote}
                      type="button"
                      onClick={() => giveFeedback(i, vote, m.dbId)}
                      disabled={isDisabled}
                      aria-label={vote === 'up' ? 'Faydalı' : 'Faydasız'}
                      style={{
                        background: isChosen ? 'rgba(173,251,73,0.15)' : 'transparent',
                        border: `1px solid ${isChosen ? 'rgba(173,251,73,0.4)' : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: 6,
                        padding: '2px 8px',
                        fontSize: 13,
                        cursor: isDisabled ? 'default' : 'pointer',
                        opacity: isDisabled && !isChosen ? 0.35 : 1,
                        transition: 'opacity 0.15s',
                      }}
                    >
                      {icon}
                    </button>
                  );
                })}
              </div> : null}
            </article>
          ))}
          {thinking ? (
            <div className="flex items-center gap-3">
              <Mascot size={40} />
              <span className="text-ui opacity-80">MIRAI düşünür…</span>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
