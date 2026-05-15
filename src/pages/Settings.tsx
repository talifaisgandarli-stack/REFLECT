import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { NotificationPreferencesPage } from './NotificationPreferences';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import type { Invitation, Role } from '@/types/db';

async function writeAudit(actorId: string, action: string, resource: string, meta?: Record<string, unknown>) {
  await supabase.from('audit_log').insert({ actor_id: actorId, action, resource, ip: null, user_agent: navigator.userAgent, ...(meta ? { meta } : {}) });
}

const NAV = [
  { to: 'umumi', label: 'Ümumi' },
  { to: 'şablonlar', label: 'Şablonlar' },
  { to: 'bilik', label: 'Bilik Bazası' },
  { to: 'bildirişlər', label: 'Bildirişlər' },
  { to: 'dəvətlər', label: 'Dəvətlər' },
];

export function SettingsPage() {
  return (
    <>
      <PageHead meta="Yalnız admin" title="Parametrlər" />
      <div className="grid grid-cols-1 lg:grid-cols-[200px,1fr] gap-6">
        <nav className="space-y-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-btn text-ui ${isActive ? 'bg-surface-mist' : ''}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="card">
          <Routes>
            <Route index element={<Navigate to="umumi" replace />} />
            <Route path="umumi" element={<GeneralSettings />} />
            <Route path="şablonlar" element={<TemplatesSettings />} />
            <Route path="bilik" element={<KnowledgeBaseSettings />} />
            <Route path="bildirişlər" element={<NotificationsSettings />} />
            <Route path="dəvətlər" element={<InvitationsSettings />} />
          </Routes>
        </div>
      </div>
    </>
  );
}

// §10.1 / REQ-TG-03 — General settings incl. Telegram finance alert thresholds
function GeneralSettings() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  const settings = useQuery({
    queryKey: ['system_settings'],
    queryFn: async () => {
      const { data } = await supabase.from('system_settings').select('key, value');
      return Object.fromEntries((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
    },
  });

  const [incomeAlert, setIncomeAlert] = useState('');
  const [expenseAlert, setExpenseAlert] = useState('');
  const [miraiBudget, setMiraiBudget] = useState('');
  const [firmName, setFirmName] = useState('');
  const [saved, setSaved] = useState(false);

  // PRD §8.1 / REQ-TG-03: cron reads `finance_alert_income_threshold` and
  // `finance_alert_expense_threshold` (jsonb { azn: number }). Stay aligned.
  const loaded = settings.data;
  const readAzn = (v: unknown): string => {
    if (v && typeof v === 'object' && 'azn' in v) {
      const n = (v as { azn?: number }).azn;
      return typeof n === 'number' ? String(n) : '';
    }
    return '';
  };
  if (loaded && incomeAlert === '') {
    const v = readAzn(loaded.finance_alert_income_threshold);
    if (v) setIncomeAlert(v);
  }
  if (loaded && expenseAlert === '') {
    const v = readAzn(loaded.finance_alert_expense_threshold);
    if (v) setExpenseAlert(v);
  }
  if (loaded && miraiBudget === '') {
    const raw = loaded.mirai_monthly_budget;
    if (raw && typeof raw === 'object' && 'usd' in raw) {
      const n = (raw as { usd?: number }).usd;
      if (typeof n === 'number') setMiraiBudget(String(n));
    }
  }
  if (loaded && firmName === '') {
    const raw = loaded.firm_name;
    // firm_name is stored as a quoted JSON string in jsonb.
    if (typeof raw === 'string') setFirmName(raw);
  }

  const save = useMutation({
    mutationFn: async () => {
      const incomeNum = Number(incomeAlert) || 5000;
      const expenseNum = Number(expenseAlert) || 2000;
      const budgetNum = Number(miraiBudget) || 5;
      const rows: Array<{ key: string; value: unknown }> = [
        { key: 'finance_alert_income_threshold', value: { azn: incomeNum } },
        { key: 'finance_alert_expense_threshold', value: { azn: expenseNum } },
        { key: 'mirai_monthly_budget', value: { usd: budgetNum } },
        { key: 'firm_name', value: firmName.trim() || 'Reflect' },
      ];
      for (const row of rows) {
        const { error } = await supabase.from('system_settings').upsert(row, { onConflict: 'key' });
        if (error) throw error;
      }
      if (profile?.id) {
        await writeAudit(profile.id, 'settings.update', 'system_settings', {
          keys: rows.map((r) => r.key),
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system_settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <h3 className="text-h3">Şirkət</h3>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Şirkət adı</span>
          <input
            className="input mt-1 max-w-md"
            value={firmName}
            onChange={(e) => setFirmName(e.target.value)}
            placeholder="Reflect"
          />
        </label>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Region / Saat qurşağı</span>
          <input className="input mt-1 max-w-md" defaultValue="Asia/Baku" disabled />
        </label>
      </div>

      {/* REQ-TG-03 — Finance alert thresholds stored in system_settings */}
      <div className="space-y-3" style={{ paddingTop: 12, borderTop: '1px solid var(--line)' }}>
        <h3 className="text-h3">Telegram maliyyə bildirişləri</h3>
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Bu məbləğləri keçən gəlir / xərc hadisələri yalnız admin Telegram-ına göndərilir.
        </p>
        <div className="flex gap-4 flex-wrap">
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Gəlir hədd (AZN)</span>
            <input
              type="number"
              className="input max-w-[140px]"
              value={incomeAlert}
              onChange={(e) => setIncomeAlert(e.target.value)}
              placeholder="5000"
            />
          </label>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Xərc hədd (AZN)</span>
            <input
              type="number"
              className="input max-w-[140px]"
              value={expenseAlert}
              onChange={(e) => setExpenseAlert(e.target.value)}
              placeholder="2000"
            />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saxlanılır…' : 'Saxla'}
          </button>
          {saved ? <span className="text-meta" style={{ color: 'var(--brand-text)' }}>Saxlandı ✓</span> : null}
          {save.error ? <span className="text-meta" style={{ color: '#B91C1C' }}>{(save.error as Error).message}</span> : null}
        </div>
      </div>

      {/* PRD §7.6 — MIRAI monthly budget per user (USD). Default $5. */}
      <div className="space-y-3" style={{ paddingTop: 12, borderTop: '1px solid var(--line)' }}>
        <h3 className="text-h3">MIRAI aylıq büdcə</h3>
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Hər istifadəçinin aylıq MIRAI sərf limiti (USD). Limit dolanda istifadəçi 429 alır. Yaradıcı bu hədddən azaddır.
        </p>
        <label className="block">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Limit (USD)</span>
          <input
            type="number"
            min="0.5"
            step="0.5"
            className="input max-w-[140px]"
            value={miraiBudget}
            onChange={(e) => setMiraiBudget(e.target.value)}
            placeholder="5"
          />
        </label>
      </div>

      {/* PRD §8.5 — MIRAI CMO RSS feed sources stored in system_settings */}
      <RssFeedSettings settings={settings.data} onSaved={() => qc.invalidateQueries({ queryKey: ['system_settings'] })} />
    </div>
  );
}

// PRD §8.5 — Admin configures custom RSS feeds for MIRAI CMO weekly cron
// Default feeds (ArchDaily, Dezeen, Architizer, WAF) are hardcoded in the backend cron.
// Custom feeds stored as JSON array in system_settings[mirai_rss_feeds].
function RssFeedSettings({ settings, onSaved }: { settings: Record<string, unknown> | undefined; onSaved: () => void }) {
  const qc = useQueryClient();
  const defaultFeeds = ['https://www.archdaily.com/feed', 'https://www.dezeen.com/feed', 'https://www.architizer.com/feed'];
  const [feeds, setFeeds] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [saved, setSaved] = useState(false);

  // Populate once loaded
  useEffect(() => {
    if (!settings) return;
    try {
      const raw = settings.mirai_rss_feeds;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed) && parsed.length) setFeeds(parsed as string[]);
      else setFeeds([...defaultFeeds]);
    } catch {
      setFeeds([...defaultFeeds]);
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('system_settings').upsert(
        { key: 'mirai_rss_feeds', value: JSON.stringify(feeds) },
        { onConflict: 'key' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      onSaved();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  function addFeed() {
    const url = newUrl.trim();
    if (!url) return;
    if (!url.startsWith('http')) return;
    if (feeds.includes(url)) return;
    setFeeds((f) => [...f, url]);
    setNewUrl('');
  }

  return (
    <div className="space-y-3" style={{ paddingTop: 12, borderTop: '1px solid var(--line)' }}>
      <h3 className="text-h3">MIRAI CMO RSS mənbələri</h3>
      <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
        Həftəlik cron bu mənbələri çəkib MIRAI CMO vasitəsilə elanlar sırasına əlavə edir (PRD §8.5).
      </p>
      <ul className="space-y-1.5">
        {feeds.map((url) => (
          <li key={url} className="flex items-center gap-2">
            <span
              className="flex-1 text-meta font-mono truncate"
              style={{ color: 'var(--text-muted)', fontSize: 12 }}
            >
              {url}
            </span>
            <button
              className="chip"
              style={{ color: '#B91C1C', background: 'rgba(185,28,28,0.08)', fontSize: 12 }}
              onClick={() => setFeeds((f) => f.filter((x) => x !== url))}
            >
              Sil
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="https://example.com/feed"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFeed())}
        />
        <button className="btn-outline" onClick={addFeed} disabled={!newUrl.trim().startsWith('http')}>
          Əlavə et
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saxlanılır…' : 'Saxla'}
        </button>
        {saved ? <span className="text-meta" style={{ color: 'var(--brand-text)' }}>Saxlandı ✓</span> : null}
        {save.error ? <span className="text-meta" style={{ color: '#B91C1C' }}>{(save.error as Error).message}</span> : null}
      </div>
    </div>
  );
}

// §10.2 / US-SYS-01 — Templates CRUD with {{variable}} extraction + preview
function TemplatesSettings() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<null | { id?: string; category: string; name: string; body: string; mime_type: string }>(null);
  const [preview, setPreview] = useState(false);

  const templates = useQuery({
    queryKey: ['templates'],
    queryFn: async () =>
      (await supabase
        .from('templates')
        .select('*')
        .not('name', 'like', '\\_deprecated\\_%')
        .order('created_at', { ascending: false })
      ).data ?? [],
  });

  function extractVars(body: string): string[] {
    return [...new Set([...body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))];
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const vars = extractVars(editing.body);
      const payload = {
        category: editing.category,
        name: editing.name,
        body: editing.body,
        mime_type: editing.mime_type || 'text/plain',
        variables: Object.fromEntries(vars.map((v) => [v, ''])),
      };
      if (editing.id) {
        const { error } = await supabase.from('templates').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('templates').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['templates'] }); setEditing(null); },
  });

  const del = useMutation({
    mutationFn: async (id: string) => { await supabase.from('templates').update({ name: `_deprecated_${Date.now()}` }).eq('id', id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });

  /** PRD §10.2 — export template body as plain-text file for Word/Excel. */
  function downloadTemplate(name: string, body: string) {
    const blob = new Blob([body], { type: 'text/plain; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/[^a-zA-Zа-яА-Яəüöçşğı\s]/g, '_').trim() || 'sablon'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (editing) {
    const vars = extractVars(editing.body);
    return (
      <div className="space-y-4">
        <h3 className="text-h3">{editing.id ? 'Şablonu redaktə et' : 'Yeni şablon'}</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Ad</span>
            <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>Kateqoriya</span>
            <select className="input" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
              {['letter', 'invoice', 'act', 'survey', 'contract', 'other'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
            Mətn (&#123;&#123;dəyişən_adı&#125;&#125; formatı)
          </span>
          <textarea
            className="input w-full font-mono"
            style={{ minHeight: 200, fontSize: 13 }}
            value={editing.body}
            onChange={(e) => setEditing({ ...editing, body: e.target.value })}
          />
        </label>
        {vars.length ? (
          <div>
            <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Dəyişənlər:</span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {vars.map((v) => (
                <span key={v} className="chip" style={{ background: 'rgba(173,251,73,0.1)', color: 'var(--brand-text)' }}>
                  {`{{${v}}}`}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {vars.length && preview ? (
          <div className="card p-4 font-mono text-body whitespace-pre-wrap" style={{ fontSize: 13, background: 'var(--surface-mist)' }}>
            {editing.body.replace(/\{\{(\w+)\}\}/g, (_, k) => `[${k}]`)}
          </div>
        ) : null}
        {save.error ? <p className="text-meta" style={{ color: '#B91C1C' }}>{(save.error as Error).message}</p> : null}
        <div className="flex gap-2">
          <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saxlanılır…' : 'Saxla'}
          </button>
          {vars.length ? (
            <button className="btn-outline" onClick={() => setPreview((p) => !p)}>
              {preview ? 'Önizləməni gizlət' : 'Önizlə'}
            </button>
          ) : null}
          {editing.body ? (
            <button
              className="btn-outline"
              onClick={() => downloadTemplate(editing.name || 'sablon', editing.body)}
              title="TXT kimi yüklə"
            >
              ↓ Yüklə
            </button>
          ) : null}
          <button className="btn-outline" onClick={() => setEditing(null)}>Ləğv</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-h3">Şablonlar</h3>
        <button className="btn-primary" onClick={() => setEditing({ category: 'letter', name: '', body: '', mime_type: 'text/plain' })}>
          + Yeni şablon
        </button>
      </div>
      {templates.isLoading ? <p className="text-meta">Yüklənir…</p> : null}
      {!templates.isLoading && (templates.data ?? []).length === 0 ? (
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>Hələ şablon yoxdur.</p>
      ) : null}
      <ul className="space-y-2">
        {(templates.data ?? []).map((t: { id: string; name: string; category: string; body: string; mime_type: string }) => (
          <li key={t.id} className="flex items-center justify-between gap-3 py-2 border-b" style={{ borderColor: 'var(--line-soft)' }}>
            <div>
              <div className="text-body font-medium">{t.name}</div>
              <div className="text-meta" style={{ color: 'var(--text-muted)' }}>{t.category}</div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button className="chip" onClick={() => setEditing({ id: t.id, category: t.category, name: t.name, body: t.body, mime_type: t.mime_type })}>
                Redaktə
              </button>
              <button
                className="chip"
                onClick={() => downloadTemplate(t.name, t.body)}
                title="TXT kimi yüklə"
              >
                ↓
              </button>
              <button className="chip" style={{ color: '#B91C1C' }} onClick={() => del.mutate(t.id)}>
                Sil
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// §10.3 / US-SYS-02 — Knowledge Base PDF upload + chunk + embed pipeline.
// Gracefully hides upload UI when RAG is disabled server-side (no OpenAI key),
// so admins don't see a feature that only ever returns errors.
function KnowledgeBaseSettings() {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [uploadOk, setUploadOk] = useState<string | null>(null);

  const diag = useQuery({
    queryKey: ['diag', 'features'],
    queryFn: async () => {
      const res = await fetch('/api/diag/check');
      const j = (await res.json()) as { features?: { rag_enabled?: boolean } };
      return j.features ?? {};
    },
    staleTime: 5 * 60_000,
  });
  const ragEnabled = diag.data?.rag_enabled === true;

  const chunks = useQuery({
    queryKey: ['knowledge-base'],
    enabled: ragEnabled,
    queryFn: async () => {
      const { data } = await supabase
        .from('knowledge_base')
        .select('id, source_pdf, chunk_index, uploaded_at')
        .order('uploaded_at', { ascending: false });
      const byPdf: Record<string, { count: number; uploaded_at: string }> = {};
      for (const row of data ?? []) {
        if (!byPdf[row.source_pdf]) byPdf[row.source_pdf] = { count: 0, uploaded_at: row.uploaded_at };
        byPdf[row.source_pdf].count++;
      }
      return byPdf;
    },
  });

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadErr('Yalnız PDF fayllar qəbul edilir.');
      return;
    }
    setUploading(true);
    setUploadErr(null);
    setUploadOk(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('Sessiya yoxdur');

      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/knowledge-base/upload', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Yükləmə xətası (${res.status})`);

      setUploadOk(`"${file.name}" uğurla yükləndi — ${data?.chunks ?? '?'} hissəyə bölündü.`);
      qc.invalidateQueries({ queryKey: ['knowledge-base'] });
    } catch (err) {
      setUploadErr((err as Error).message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  const pdfs = Object.entries(chunks.data ?? {});

  return (
    <div className="space-y-5">
      <h3 className="text-h3">Bilik Bazası (MIRAI RAG)</h3>
      <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
        AZ inşaat normaları, AZDNT sənədlərini yükləyin. MIRAI Hüquqşünas bu mənbələrə istinad edər.
      </p>
      {/* RAG axtarışı Postgres FTS ilə işləyir — heç bir xarici açar tələb olunmur. */}

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleUpload}
          disabled={uploading}
        />
        <span className="btn-primary">{uploading ? 'Yüklənir…' : 'PDF yüklə'}</span>
        <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Maks. 4 MB (Vercel limiti)</span>
      </label>

      {uploadOk ? <p className="text-meta" style={{ color: 'var(--brand-text)' }}>{uploadOk}</p> : null}
      {uploadErr ? <p className="text-meta" style={{ color: '#B91C1C' }}>{uploadErr}</p> : null}

      {chunks.isLoading ? <p className="text-meta">Yüklənir…</p> : null}

      {pdfs.length === 0 && !chunks.isLoading ? (
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>Hələ PDF yüklənməyib.</p>
      ) : null}

      {pdfs.length > 0 ? (
        <ul className="space-y-2">
          {pdfs.map(([pdf, meta]) => (
            <li
              key={pdf}
              className="flex items-center justify-between gap-3 py-2 border-b"
              style={{ borderColor: 'var(--line-soft)' }}
            >
              <div>
                <div className="text-body font-medium truncate max-w-xs">{pdf}</div>
                <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                  {meta.count} hissə · {new Date(meta.uploaded_at).toLocaleDateString('az-AZ')}
                </div>
              </div>
              <span className="chip" style={{ background: 'rgba(173,251,73,0.1)', color: 'var(--brand-text)' }}>
                RAG
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
function NotificationsSettings() {
  return <NotificationPreferencesPage />;
}

// ---------------------------------------------------------------------------
// REQ-AUTH-02 — Invite-only registration (PRD §5 Module 1)
// ---------------------------------------------------------------------------
type InviteWithRole = Invitation & { role?: Pick<Role, 'id' | 'key' | 'name'> };

function InvitationsSettings() {
  const { profile } = useAuth();
  const qc = useQueryClient();

  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [formError, setFormError] = useState('');

  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: async (): Promise<Role[]> => {
      const { data, error } = await supabase.from('roles').select('*').order('level');
      if (error) throw error;
      return data ?? [];
    },
  });

  const invitations = useQuery({
    queryKey: ['invitations'],
    queryFn: async (): Promise<InviteWithRole[]> => {
      const { data, error } = await supabase
        .from('invitations')
        .select('*, role:roles(id, key, name)')
        .is('accepted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as InviteWithRole[];
    },
  });

  const invite = useMutation({
    mutationFn: async () => {
      if (!email.trim() || !roleId) throw new Error('Email və rol tələb olunur');
      const role = (roles.data ?? []).find((r) => r.id === roleId);
      if (!role) throw new Error('Rol tapılmadı');

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('Sessiya tapılmadı');

      const res = await fetch('/api/invitations/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: email.trim().toLowerCase(), role_key: role.key }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Dəvət göndərilmədi');
      }
    },
    onSuccess: () => {
      setEmail('');
      setRoleId('');
      setFormError('');
      qc.invalidateQueries({ queryKey: ['invitations'] });
    },
    onError: (e) => setFormError((e as Error).message),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('invitations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invitations'] }),
  });

  const pending = (invitations.data ?? []).filter((i) => !i.accepted_at);
  const now = new Date();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-h3 mb-3">Yeni dəvət</h3>
        <form
          className="flex flex-col sm:flex-row gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate();
          }}
        >
          <input
            type="email"
            className="input flex-1"
            placeholder="email@domain.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-label="Dəvət e-poçtu"
          />
          <select
            className="input"
            style={{ minWidth: 160 }}
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            required
            aria-label="Rol"
          >
            <option value="">Rol seçin…</option>
            {(roles.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary" disabled={invite.isPending}>
            {invite.isPending ? 'Göndərilir…' : 'Dəvət et'}
          </button>
        </form>
        {formError ? (
          <p className="text-meta mt-2" style={{ color: '#B91C1C' }}>
            {formError}
          </p>
        ) : null}
      </div>

      <div>
        <h3 className="text-h3 mb-3">Gözləyən dəvətlər</h3>
        {invitations.isLoading ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Yüklənir…
          </p>
        ) : pending.length === 0 ? (
          <EmptyState title="Aktiv dəvət yoxdur" body="Komanda üzvlərini e-poçt ilə dəvət edin." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-body" style={{ minWidth: 480 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  {(['Email', 'Rol', 'Bitmə tarixi', ''] as const).map((h) => (
                    <th
                      key={h}
                      className="text-meta text-left py-2 pr-4"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pending.map((inv) => {
                  const expired = new Date(inv.expires_at) < now;
                  return (
                    <tr key={inv.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                      <td className="py-2 pr-4" style={{ color: 'var(--text)' }}>
                        {inv.email}
                      </td>
                      <td className="py-2 pr-4">
                        <span className="chip">{inv.role?.name ?? '—'}</span>
                      </td>
                      <td
                        className="py-2 pr-4 text-meta"
                        style={{ color: expired ? '#B91C1C' : 'var(--text-muted)' }}
                      >
                        {new Date(inv.expires_at).toLocaleDateString('az-AZ')}
                        {expired ? ' (vaxtı keçib)' : ''}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          className="btn-outline text-meta"
                          style={{ padding: '2px 10px', color: '#B91C1C' }}
                          onClick={() => revoke.mutate(inv.id)}
                          disabled={revoke.isPending}
                          aria-label={`${inv.email} dəvətini ləğv et`}
                        >
                          Ləğv et
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
