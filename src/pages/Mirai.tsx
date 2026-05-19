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
import { useSlashFocus } from '@/lib/useSlashFocus';
import { announce } from '@/lib/a11y';

type PersonaKey =
  | 'general'
  | 'operations_director'
  | 'project_manager'
  | 'legal'
  | 'cmo'
  | 'finance_analyst'
  | 'strategist'
  | 'team_assistant';

type PersonaMeta = { key: PersonaKey; label: string; adminOnly: boolean; hint: string; icon: string };

// PRD §7.2 — 6 admin personas + 1 user persona. Icons give each persona
// a quick visual id in the switcher row and the active chip.
const PERSONAS: PersonaMeta[] = [
  { key: 'general', label: 'MIRAI', adminOnly: false, hint: 'Ümumi köməkçi', icon: '✦' },
  { key: 'operations_director', label: 'Əməliyyat Direktoru', adminOnly: true, hint: 'Proses, resurs, kapasitə', icon: '⚙️' },
  { key: 'project_manager', label: 'Layihə Mühəndisi', adminOnly: true, hint: 'Tapşırıq, deadline, faza', icon: '📐' },
  { key: 'legal', label: 'Hüquqşünas', adminOnly: true, hint: 'AZ normativlər (RAG)', icon: '⚖️' },
  { key: 'cmo', label: 'CMO', adminOnly: true, hint: 'Trend, mükafat, məzmun', icon: '📢' },
  { key: 'finance_analyst', label: 'Maliyyə Analitiki', adminOnly: true, hint: 'Cash flow, P&L, forecast', icon: '💰' },
  { key: 'strategist', label: 'Strateq', adminOnly: true, hint: 'Uzunmüddətli inkişaf', icon: '🧭' },
  { key: 'team_assistant', label: 'Komanda Köməkçisi', adminOnly: false, hint: 'Tapşırıqlar, məlumat', icon: '🤝' },
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

// Post-response follow-up suggestions — surfaced after each assistant turn
// to keep the conversation moving. Distinct from SUGGESTIONS (which seed an
// empty thread): these are "and then what?" prompts.
const FOLLOWUPS: Record<PersonaKey, string[]> = {
  general: ['Daha ətraflı izah et', 'Misal göstər', 'Kim məsuldur?'],
  operations_director: ['Risk faktorları hansılardır?', 'Avtomatlaşdırmaq olar mı?', 'Ölçülə bilən KPI təklif et'],
  project_manager: ['Növbəti 7 günə fokus', 'Hansı tapşırıqları paralel etmək olar?', 'Buraxılış planı yarat'],
  legal: ['Mənbəni göstər', 'İstisnalar varmı?', 'Bənzər digər maddə varmı?'],
  cmo: ['Sosial şəbəkə üçün uyğunlaşdır', 'Hashtag təklif et', 'Hədəf auditoriyası kimdir?'],
  finance_analyst: ['Trend qrafiki ver', 'Risk ssenariləri (90% / 50% / 10%)', 'Müqayisə: keçən ay'],
  strategist: ['Başlıca maneələr nədir?', '3 ay vs 12 ay', 'Rəqib analizi təklif et'],
  team_assistant: ['Növbəti addım?', 'Necə başlamağa kömək et', 'Bənzər keçmiş tapşırıqlar'],
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  // When the user picks a past conversation we set persona AND msgs together,
  // so the persona-change useEffect must NOT clobber by auto-loading the latest.
  const skipAutoLoadRef = useRef(false);

  // PRD §7 — list user's recent conversations across all personas so they can
  // resume previous threads (current behavior auto-loads only the latest).
  const conversationHistory = useQuery({
    queryKey: ['mirai-conversations', profile?.id],
    enabled: !!profile?.id && historyOpen,
    queryFn: async () => {
      // PRD §7 — pinned conversations sort first, then by recent activity.
      // Postgrest can't multi-key sort easily, so sort client-side.
      // Fetch conversations + a Postgrest-counted nested message total
      // so list shows "12 mesaj" without an extra round-trip per row.
      const { data } = await supabase
        .from('mirai_conversations')
        .select('id, persona, title, started_at, last_message_at, pinned_at, mirai_messages(count)')
        .eq('user_id', profile!.id)
        .is('archived_at', null)
        .order('last_message_at', { ascending: false })
        .limit(30);
      const rows = ((data ?? []) as Array<{
        id: string;
        persona: string;
        title: string | null;
        started_at: string;
        last_message_at: string;
        pinned_at: string | null;
        mirai_messages?: Array<{ count: number }> | null;
      }>).map((r) => ({
        ...r,
        message_count: r.mirai_messages?.[0]?.count ?? 0,
      })) as Array<{
        id: string;
        persona: string;
        title: string | null;
        started_at: string;
        last_message_at: string;
        pinned_at: string | null;
        message_count: number;
      }>;
      // Pinned first (newer pin first), then everything else by last_message_at desc
      return rows.sort((a, b) => {
        if (a.pinned_at && !b.pinned_at) return -1;
        if (!a.pinned_at && b.pinned_at) return 1;
        if (a.pinned_at && b.pinned_at) return b.pinned_at.localeCompare(a.pinned_at);
        return b.last_message_at.localeCompare(a.last_message_at);
      });
    },
  });

  // Pin/unpin a conversation (toggle pinned_at)
  const togglePin = useMutation({
    mutationFn: async (input: { id: string; pinned: boolean }) => {
      const { error } = await supabase
        .from('mirai_conversations')
        .update({ pinned_at: input.pinned ? new Date().toISOString() : null })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mirai-conversations'] }),
  });

  // PRD §7 — rename a conversation (title column added in migration 0038)
  const renameConv = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase
        .from('mirai_conversations')
        .update({ title: title.trim() || null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mirai-conversations'] }),
  });

  // Soft-delete: archived_at stamp keeps the row + messages for audit; history
  // query already filters `.is('archived_at', null)` so it disappears from UI.
  const deleteConv = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('mirai_conversations')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['mirai-conversations'] });
      // If user deleted the currently-open conversation, clear the thread
      if (id === conversationId) {
        setMsgs([]);
        setConversationId(null);
      }
    },
  });

  // Per-row UI state for the history dropdown
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // PRD §7 — client-side search across history (title + persona label)
  const [historySearch, setHistorySearch] = useState('');
  const historySearchRef = useRef<HTMLInputElement>(null);
  useSlashFocus(historySearchRef);

  async function switchToConversation(conv: { id: string; persona: string }) {
    skipAutoLoadRef.current = true; // suppress the persona-change auto-loader
    setPersona(conv.persona as PersonaKey);
    setHistoryOpen(false);
    setError(null);
    setFeedbackGiven({});
    setHistoryLoaded(false);

    const { data: messages } = await supabase
      .from('mirai_messages')
      .select('id, role, content')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true })
      .limit(50);

    setConversationId(conv.id);
    setMsgs((messages ?? []).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
      dbId: m.id,
    })));
    setHistoryLoaded(true);
  }
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
  // PRD §6.3 — "N" key starts a fresh MIRAI conversation (skip while typing)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'n' && e.key !== 'N') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement).tagName;
      const editing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable;
      if (editing) return;
      e.preventDefault();
      setMsgs([]);
      setConversationId(null);
      setError(null);
      setFeedbackGiven({});
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    // If switchToConversation just set this persona we already loaded the
    // chosen thread — don't clobber it by auto-loading the latest.
    if (skipAutoLoadRef.current) {
      skipAutoLoadRef.current = false;
      return;
    }
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

  // PRD §7 — abort controller for the active SSE stream so users can stop generation mid-way
  const abortRef = useRef<AbortController | null>(null);
  const [streaming, setStreaming] = useState(false);
  function stopGeneration() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setThinking(false);
  }

  async function ask(text: string, opts: { replay?: boolean } = {}) {
    if (!text.trim() || budgetExhausted) return;
    // replay=true is used by regenerate() — caller has already pruned the
    // assistant response and wants a fresh attempt for the same user message
    // already present in msgs.
    if (!opts.replay) {
      setMsgs((m) => [...m, { role: 'user', content: text }]);
      setQ('');
    }
    setThinking(true);
    setStreaming(true);
    // Create AbortController so the user can stop the stream
    abortRef.current = new AbortController();
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
        body: JSON.stringify({
          message: text,
          persona,
          conversation_id: conversationId,
          // PRD §7 — last 8 turns of context so MIRAI sees the conversation
          // (server formerly only had the new message; no follow-up coherence).
          recent_messages: msgs.slice(-8).map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: abortRef.current?.signal,
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
      // AbortError = user pressed Stop; not an error
      if (e instanceof Error && (e.name === 'AbortError' || e.message.includes('aborted'))) {
        // Suppress error UI when user aborted intentionally
      } else {
        const msg = e instanceof Error ? e.message : 'Xəta baş verdi.';
        setError(msg);
      }
    } finally {
      setThinking(false);
      setStreaming(false);
      abortRef.current = null;
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
    // PRD §6.6 — announce persona change so screen reader users know context shifted
    const next = PERSONAS.find((p) => p.key === key);
    if (next) announce(`MIRAI persona dəyişdi: ${next.label}`);
  }

  const currentPersonaMeta = PERSONAS.find((p) => p.key === persona)!;

  // PRD §7 — regenerate the last assistant response. Removes the current tail
  // (assistant + any trailing) then re-asks with the most-recent user message.
  function regenerateLast() {
    if (thinking || budgetExhausted) return;
    // Find the last user message; everything before it stays, the rest is dropped
    let lastUserIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx === -1) return;
    const prompt = msgs[lastUserIdx].content;
    // Truncate to (and including) the last user message — drops the prior reply
    setMsgs((m) => m.slice(0, lastUserIdx + 1));
    // Replay without re-pushing the user message
    void ask(prompt, { replay: true });
  }

  // PRD §7 — export the active conversation as Markdown so users can paste
  // into emails, meeting notes, or external docs. Pure-client; no API call.
  function exportConversation() {
    if (msgs.length === 0) return;
    const dt = new Date().toLocaleString('az-AZ', { timeZone: 'Asia/Baku' });
    const header =
      `# MIRAI — ${currentPersonaMeta.label}\n` +
      `> ${dt} · ${profile?.full_name ?? profile?.email ?? '—'}\n\n`;
    const body = msgs
      .map((m) => {
        const who = m.role === 'user' ? '**Sən:**' : `**MIRAI (${currentPersonaMeta.label}):**`;
        const content = m.content.trim();
        const sources = m.sources && m.sources.length
          ? '\n\n_Mənbələr:_ ' + m.sources.map((s) => `${s.name}${s.page != null ? ` · ${s.page}` : ''}`).join('; ')
          : '';
        return `${who}\n${content}${sources}`;
      })
      .join('\n\n---\n\n');
    const md = header + body + '\n';

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = (currentPersonaMeta.label || 'mirai').replace(/[^\p{L}\p{N}_-]+/gu, '_');
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `mirai-${slug}-${stamp}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

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
            <span aria-hidden style={{ marginRight: 4 }}>{p.icon}</span>{p.label}
          </button>
        ))}
        {/* PRD §7 — past conversation switcher */}
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          className="chip"
          title="Keçmiş söhbətlər"
          style={{
            background: 'rgba(255,255,255,0.06)',
            color: 'var(--canvas)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          ⏱ Tarixçə
        </button>
        {/* PRD §7.6 — live cost-so-far for active conversation (sums mirai_messages.cost_usd) */}
        {conversationId ? <ConversationCostChip conversationId={conversationId} /> : null}
        {/* PRD §7.1 — model name chip so users see which model answers */}
        <span
          className="chip"
          title="MIRAI Anthropic Claude Haiku 4.5 ilə işləyir"
          style={{
            background: 'rgba(255,255,255,0.04)',
            color: 'var(--text-muted)',
            border: '1px solid rgba(255,255,255,0.06)',
            fontSize: 11,
            opacity: 0.8,
          }}
        >
          Haiku 4.5
        </span>
        {/* PRD §7.6 — monthly budget chip (always visible once usage data lands).
            Admin sees it as a link to the cost dashboard in Settings. */}
        {usage && usage.cap_usd > 0 ? (
          isAdmin ? (
            <a
              href="/parametrlər/bildirişlər"
              className="chip"
              title={`Aylıq MIRAI büdcə: $${usage.spent_usd.toFixed(2)} / $${usage.cap_usd} — detallar üçün klik`}
              style={{
                background: usage.pct >= 0.8
                  ? 'var(--error-deep, #b3261e)'
                  : usage.pct >= 0.5
                  ? 'rgba(217,119,6,0.18)'
                  : 'rgba(255,255,255,0.06)',
                color: usage.pct >= 0.8
                  ? 'white'
                  : usage.pct >= 0.5
                  ? 'var(--warning, #c47d00)'
                  : 'var(--canvas)',
                border: '1px solid rgba(255,255,255,0.08)',
                fontVariantNumeric: 'tabular-nums',
                fontSize: 11,
              }}
            >
              🪙 {Math.round(usage.pct * 100)}%
            </a>
          ) : (
            <span
              className="chip"
              title={`Aylıq MIRAI büdcə: $${usage.spent_usd.toFixed(2)} / $${usage.cap_usd}`}
              style={{
                background: usage.pct >= 0.8
                  ? 'var(--error-deep, #b3261e)'
                  : usage.pct >= 0.5
                  ? 'rgba(217,119,6,0.18)'
                  : 'rgba(255,255,255,0.06)',
                color: usage.pct >= 0.8
                  ? 'white'
                  : usage.pct >= 0.5
                  ? 'var(--warning, #c47d00)'
                  : 'var(--canvas)',
                border: '1px solid rgba(255,255,255,0.08)',
                fontVariantNumeric: 'tabular-nums',
                fontSize: 11,
              }}
            >
              🪙 {Math.round(usage.pct * 100)}%
            </span>
          )
        ) : null}
        {/* PRD §7 — export current conversation as Markdown */}
        {msgs.length > 0 ? (
          <button
            type="button"
            onClick={exportConversation}
            className="chip"
            title="Söhbəti Markdown olaraq endir"
            style={{
              background: 'rgba(255,255,255,0.06)',
              color: 'var(--canvas)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            ↓ İxrac
          </button>
        ) : null}
        {/* PRD §7 — clear conversation (keep persona) */}
        {msgs.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Söhbəti təmizləmək istədiyinizdən əminsiniz? (söhbət DB-də qalır)')) {
                setMsgs([]);
                setConversationId(null);
                setError(null);
              }
            }}
            className="chip"
            title="Söhbəti təmizlə (yeni mesajdan başla)"
            style={{
              background: 'rgba(255,255,255,0.06)',
              color: 'var(--canvas)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            🧹 Təmizlə
          </button>
        ) : null}
      </div>

      {/* Conversation history dropdown */}
      {historyOpen ? (
        <div
          className="w-full max-w-[720px] mt-3 rounded-card p-3"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'var(--canvas)',
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-meta opacity-70">Keçmiş söhbətlər (son 30)</span>
            <button
              type="button"
              className="text-meta opacity-70 hover:opacity-100"
              onClick={() => setHistoryOpen(false)}
            >
              ×
            </button>
          </div>
          {/* PRD §7 — client-side conversation search */}
          <input
            type="text"
            className="w-full mb-2 px-2 py-1.5 rounded-btn text-meta"
            style={{
              background: 'rgba(255,255,255,0.06)',
              color: 'var(--canvas)',
              border: '1px solid rgba(255,255,255,0.08)',
              fontSize: 12,
            }}
            ref={historySearchRef}
            placeholder="Söhbətdə axtar (ad, persona)… (/)"
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
          />
          {conversationHistory.isLoading ? (
            <div className="text-meta opacity-50 py-2 text-center">Yüklənir…</div>
          ) : (conversationHistory.data ?? []).length === 0 ? (
            <div className="text-meta opacity-50 py-2 text-center">Hələ söhbət yoxdur</div>
          ) : (
            <ul className="max-h-[320px] overflow-y-auto divide-y" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              {(() => {
                const q = historySearch.trim().toLowerCase();
                const filtered = (conversationHistory.data ?? []).filter((c) => {
                  if (!q) return true;
                  const personaLabel = PERSONAS.find((p) => p.key === c.persona)?.label ?? c.persona;
                  const hay = `${c.title ?? ''} ${personaLabel}`.toLowerCase();
                  return hay.includes(q);
                });
                if (filtered.length === 0) {
                  return (
                    <li className="text-meta opacity-50 py-3 text-center" style={{ listStyle: 'none' }}>
                      Heç nə tapılmadı
                    </li>
                  );
                }
                return filtered.map((c) => {
                const personaLabel = PERSONAS.find((p) => p.key === c.persona)?.label ?? c.persona;
                const dt = new Date(c.last_message_at);
                const isCurrent = c.id === conversationId;
                const isRenaming = renamingId === c.id;
                const isConfirming = confirmDeleteId === c.id;
                const displayTitle = c.title?.trim() || personaLabel;
                return (
                  <li key={c.id}>
                    {isRenaming ? (
                      <div className="py-2 px-2 flex items-center gap-2">
                        <input
                          autoFocus
                          className="flex-1 text-body bg-transparent border-b focus:outline-none"
                          style={{ borderColor: 'rgba(255,255,255,0.2)', color: 'var(--canvas)' }}
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              renameConv.mutate({ id: c.id, title: renameDraft });
                              setRenamingId(null);
                            } else if (e.key === 'Escape') {
                              setRenamingId(null);
                            }
                          }}
                          placeholder={personaLabel}
                        />
                        <button
                          type="button"
                          className="chip text-meta"
                          onClick={() => { renameConv.mutate({ id: c.id, title: renameDraft }); setRenamingId(null); }}
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          className="chip text-meta"
                          onClick={() => setRenamingId(null)}
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <div
                        className="py-2 px-2 hover:bg-white/5 rounded-btn flex items-center justify-between gap-2"
                        style={{ background: isCurrent ? 'rgba(173, 251, 73, 0.08)' : undefined }}
                      >
                        <button
                          type="button"
                          className="text-left flex-1 min-w-0"
                          onClick={() => switchToConversation(c)}
                        >
                          <div className="text-body truncate flex items-center gap-2">
                            {/* PRD §7.2 — persona icon prefix so the list mirrors the switcher */}
                            <span aria-hidden style={{ opacity: 0.7 }}>
                              {PERSONAS.find((p) => p.key === c.persona)?.icon ?? '✦'}
                            </span>
                            <span className="truncate">{displayTitle}</span>
                          </div>
                          <div className="text-meta opacity-60" style={{ fontSize: 11 }}>
                            {c.title ? `${personaLabel} · ` : ''}
                            {dt.toLocaleString('az-AZ', { timeZone: 'Asia/Baku' })}
                            {/* PRD §7 — message count so user gauges conversation depth */}
                            {c.message_count > 0 ? (
                              <span style={{ marginLeft: 6, opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>
                                · {c.message_count} mesaj
                              </span>
                            ) : null}
                          </div>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          {isCurrent ? (
                            <span className="text-meta" style={{ color: 'var(--brand-action)', fontSize: 11, marginRight: 4 }}>
                              aktiv
                            </span>
                          ) : null}
                          {isConfirming ? (
                            <>
                              <button
                                type="button"
                                className="chip text-meta"
                                style={{ background: 'rgba(239,68,68,0.4)', color: 'white' }}
                                onClick={() => deleteConv.mutate(c.id)}
                              >
                                Bəli
                              </button>
                              <button
                                type="button"
                                className="chip text-meta"
                                onClick={() => setConfirmDeleteId(null)}
                              >
                                Ləğv
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="chip text-meta opacity-60 hover:opacity-100"
                                title={c.pinned_at ? 'Açma' : 'Üstdə sabitlə'}
                                style={c.pinned_at ? { color: 'var(--brand-action)', opacity: 1 } : undefined}
                                onClick={() => togglePin.mutate({ id: c.id, pinned: !c.pinned_at })}
                              >
                                {c.pinned_at ? '★' : '☆'}
                              </button>
                              <button
                                type="button"
                                className="chip text-meta opacity-60 hover:opacity-100"
                                title="Adını dəyiş"
                                onClick={() => { setRenameDraft(c.title ?? ''); setRenamingId(c.id); }}
                              >
                                ✎
                              </button>
                              <button
                                type="button"
                                className="chip text-meta opacity-60 hover:opacity-100"
                                title="Söhbəti sil"
                                style={{ color: '#ff8585' }}
                                onClick={() => setConfirmDeleteId(c.id)}
                              >
                                🗑
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
                });
              })()}
            </ul>
          )}
        </div>
      ) : null}

      <div className="w-full max-w-[720px] mt-8">
        {/* Budget warning — PRD §7.6 */}
        {usage?.warning === 'budget_80pct' ? (
          <div
            role="status"
            className="rounded-card px-4 py-3 mb-4 text-meta flex items-center justify-between"
            style={{
              background: 'rgba(217, 119, 6, 0.12)',
              border: '1px solid rgba(217, 119, 6, 0.4)',
              color: 'var(--mirai-warning)',
            }}
          >
            <span>
              Aylıq MIRAI büdcənin {Math.round((usage.pct) * 100)}%-i istifadə olunub
              ({usage.spent_usd.toFixed(2)}$ / {usage.cap_usd}$).
            </span>
            <span className="opacity-70 flex items-center gap-2">
              Növbəti ay sıfırlanacaq
              {/* PRD §7.6 — admin can adjust cap or inspect breakdown in Settings */}
              {isAdmin ? (
                <a
                  href="/parametrlər/umumi"
                  style={{ color: 'var(--brand-text)', textDecoration: 'underline' }}
                  title="Aylıq MIRAI büdcəsi parametrlərini aç"
                >
                  Parametrlər →
                </a>
              ) : null}
            </span>
          </div>
        ) : null}

        {budgetExhausted ? (
          <div
            role="alert"
            className="rounded-card px-4 py-3 mb-4 text-body"
            style={{ background: 'var(--mirai-error-bg)', border: '1px solid var(--mirai-error-border)', color: 'var(--mirai-error-text)' }}
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
            {saveBudget.error ? <span className="text-meta" style={{ color: 'var(--mirai-error-text)' }}>{(saveBudget.error as Error).message}</span> : null}
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
            placeholder={`${currentPersonaMeta.label}-dən soruş… (Cmd/Ctrl+/ açır)`}
            className="flex-1 h-12 rounded-btn px-4 text-body"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--canvas)',
            }}
            disabled={budgetExhausted}
          />
          {streaming ? (
            <button
              type="button"
              className="btn-primary"
              onClick={stopGeneration}
              style={{ background: 'var(--error-deep, #b3261e)', color: 'white' }}
              title="Cavabı dayandır"
            >
              ⏹ Dayandır
            </button>
          ) : null}
          <button type="submit" className="btn-primary" disabled={thinking || budgetExhausted || streaming}>
            {thinking ? '…' : 'Göndər'}
          </button>
        </form>

        {/* PRD §7.2 — persona hint under input so user remembers active focus */}
        <p
          className="text-meta mt-1 px-1"
          style={{ color: 'var(--text-muted)', fontSize: 11, opacity: 0.8 }}
        >
          <span aria-hidden style={{ marginRight: 4 }}>{currentPersonaMeta.icon}</span>
          {currentPersonaMeta.label} · {currentPersonaMeta.hint}
        </p>

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
          <p className="text-meta mt-3" style={{ color: 'var(--mirai-error-text-alt)' }}>{error}</p>
        ) : null}

        {/* History loading placeholder */}
        {!historyLoaded ? (
          <div className="mt-6 text-meta opacity-50 text-center">Söhbət yüklənir…</div>
        ) : null}

        {/* Message thread */}
        <div className="mt-8 space-y-3">
          {/* PRD §7 — persona-aware welcome card when conversation is empty */}
          {msgs.length === 0 && !thinking ? (
            <div
              className="rounded-card p-5 text-center"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px dashed rgba(255,255,255,0.1)',
                color: 'var(--canvas)',
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 8 }} aria-hidden>
                {currentPersonaMeta.icon}
              </div>
              <div className="text-h3">{currentPersonaMeta.label}</div>
              <p className="text-meta mt-1" style={{ opacity: 0.7, fontSize: 12 }}>
                {currentPersonaMeta.hint}
              </p>
              <p className="text-meta mt-2" style={{ opacity: 0.6, fontSize: 11 }}>
                Aşağıda sual ver və ya təklif olunan başlanğıclardan birini seç.
              </p>
            </div>
          ) : null}
          {/* PRD §7 — message count when thread is non-empty + scroll-to-top */}
          {msgs.length > 0 ? (
            <div className="text-meta opacity-60 text-center flex items-center justify-center gap-3" style={{ fontSize: 11 }}>
              <span>{msgs.length} mesaj{conversationId ? ' · DB-də saxlanılır' : ''}</span>
              {msgs.length >= 5 ? (
                <button
                  type="button"
                  className="chip"
                  style={{ fontSize: 10, padding: '0 8px' }}
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                  title="Yuxarıya qayıt"
                >
                  ↑ Yuxarı
                </button>
              ) : null}
            </div>
          ) : null}
          {msgs.map((m, i) => (
            <article
              key={i}
              className="rounded-card p-4"
              style={{
                background: m.role === 'user' ? 'rgba(255,255,255,0.06)' : 'var(--brand-glow-xs)',
                border: `1px solid ${m.role === 'user' ? 'rgba(255,255,255,0.08)' : 'var(--brand-glow-lg)'}`,
                marginLeft: m.role === 'user' ? 'auto' : 0,
                maxWidth: '88%',
              }}
            >
              {m.role === 'assistant' ? (
                <span
                  className="inline-block mb-2 px-2 h-[22px] leading-[22px] rounded-chip text-tiny"
                  style={{ background: 'var(--mirai-glow)', color: 'var(--brand-action)' }}
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
              {/* REQ-7.9 — thumbs up/down feedback + copy (assistant only) */}
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
                        background: isChosen ? 'var(--brand-glow-xl)' : 'transparent',
                        border: `1px solid ${isChosen ? 'var(--brand-glow-active)' : 'rgba(255,255,255,0.1)'}`,
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
                {/* Copy-to-clipboard for assistant responses */}
                <CopyMessageButton text={m.content} />
                {/* PRD §7 — regenerate ↻ on the LAST assistant message only */}
                {i === msgs.length - 1 ? (
                  <button
                    type="button"
                    onClick={regenerateLast}
                    disabled={thinking || budgetExhausted}
                    aria-label="Cavabı yenidən yarat"
                    title="Cavabı yenidən yarat"
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 6,
                      padding: '2px 8px',
                      fontSize: 13,
                      cursor: thinking ? 'not-allowed' : 'pointer',
                      opacity: thinking ? 0.4 : 1,
                    }}
                  >
                    ↻
                  </button>
                ) : null}
              </div> : null}

              {/* PRD §7 — suggested follow-ups (only after the last assistant message) */}
              {m.role === 'assistant' && i === msgs.length - 1 && !thinking ? (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {(FOLLOWUPS[persona] ?? []).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => ask(q)}
                      disabled={budgetExhausted}
                      className="chip"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        color: 'rgba(255,255,255,0.7)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        fontSize: 11,
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
          {thinking ? (
            <div className="flex items-center gap-3">
              <span className="thinking-pulse"><Mascot size={40} /></span>
              <span className="text-ui opacity-80">MIRAI düşünür…</span>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

// Reusable click-to-copy button for MIRAI assistant messages
// PRD §7.6 Cost Guardian — live $-so-far chip for the active conversation.
// Refetches when conversationId changes; tanstack will also pick up new msgs
// via the broader cache invalidation when mirai_messages is touched elsewhere.
function ConversationCostChip({ conversationId }: { conversationId: string }) {
  const cost = useQuery({
    queryKey: ['mirai-conv-cost', conversationId],
    enabled: !!conversationId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('mirai_messages')
        .select('cost_usd')
        .eq('conversation_id', conversationId);
      return (data ?? []).reduce((sum, r) => sum + Number((r as { cost_usd?: number }).cost_usd ?? 0), 0);
    },
  });
  const total = cost.data ?? 0;
  if (total <= 0) return null;
  return (
    <span
      className="chip"
      title="Bu söhbətin AI maliyyəti (Anthropic)"
      style={{
        background: 'rgba(255,255,255,0.06)',
        color: 'var(--canvas)',
        border: '1px solid rgba(255,255,255,0.08)',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 11,
      }}
    >
      💸 ${total.toFixed(4)}
    </span>
  );
}

function CopyMessageButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API requires secure context; fall back gracefully
      window.prompt('Kopyalamaq üçün seçin:', text);
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Cavabı kopyala"
      title="Cavabı kopyala"
      style={{
        background: copied ? 'var(--brand-glow-xl)' : 'transparent',
        border: `1px solid ${copied ? 'var(--brand-glow-active)' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 6,
        padding: '2px 8px',
        fontSize: 13,
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
    >
      {copied ? '✓' : '📋'}
    </button>
  );
}
