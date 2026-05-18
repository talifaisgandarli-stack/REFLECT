import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { NotificationPreferencesPage } from './NotificationPreferences';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { downloadCsv } from '@/lib/csv';
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
      <FirmStatsRow />
      <BuildInfoFooter />
      <div className="grid grid-cols-1 lg:grid-cols-[200px,1fr] gap-6">
        <SettingsNav />
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

// PRD §UX — settings nav with pending-invite badge so admin sees
// outstanding invitations without opening the section.
function SettingsNav() {
  const pendingCount = useQuery({
    queryKey: ['settings-nav-pending-invites'],
    staleTime: 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from('invitations')
        .select('id', { count: 'exact', head: true })
        .is('accepted_at', null);
      return count ?? 0;
    },
  });
  // Total KB documents — surfaces growth without entering the section
  const kbCount = useQuery({
    queryKey: ['settings-nav-kb-count'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from('knowledge_base')
        .select('id', { count: 'exact', head: true });
      return count ?? 0;
    },
  });
  return (
    <nav className="space-y-1">
      {NAV.map((n) => {
        let badge = 0;
        if (n.to === 'dəvətlər') badge = pendingCount.data ?? 0;
        else if (n.to === 'bilik') badge = kbCount.data ?? 0;
        return (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              `flex items-center justify-between gap-2 px-3 py-2 rounded-btn text-ui ${isActive ? 'bg-surface-mist' : ''}`
            }
          >
            <span>{n.label}</span>
            {badge > 0 ? (
              <span
                className="text-ui rounded-full flex items-center justify-center"
                style={{
                  background: n.to === 'dəvətlər' ? 'var(--brand-action)' : 'var(--surface-mist)',
                  color: n.to === 'dəvətlər' ? 'var(--ink)' : 'var(--text-muted)',
                  fontWeight: n.to === 'dəvətlər' ? 700 : 500,
                  minWidth: 20,
                  height: 20,
                  padding: '0 6px',
                  fontSize: 11,
                  fontVariantNumeric: 'tabular-nums',
                }}
                aria-label={`${badge}`}
              >
                {badge}
              </span>
            ) : null}
          </NavLink>
        );
      })}
    </nav>
  );
}

// PRD §9.4 — show what's deployed so admins can correlate bug reports
// with a specific build. Values injected via vite.config.ts `define`.
function BuildInfoFooter() {
  const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '?';
  const commit = typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : '';
  const builtAt = typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : '';
  const builtFmt = builtAt
    ? new Date(builtAt).toLocaleString('az-AZ', { timeZone: 'Asia/Baku' })
    : '—';
  return (
    <div
      className="text-meta mb-3 flex items-center gap-3 flex-wrap"
      style={{ color: 'var(--text-muted)', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}
    >
      <span>v{version}</span>
      {commit ? (
        <span className="inline-flex items-center gap-1">
          ·{' '}
          <a
            href={`https://github.com/talifaisgandarli-stack/REFLECT/commit/${commit}`}
            target="_blank"
            rel="noreferrer noopener"
            style={{ color: 'var(--brand-text)', textDecoration: 'underline dotted' }}
            title="GitHub-da bu commit-ə bax"
          >
            {commit}
          </a>
          <button
            type="button"
            onClick={() => { void navigator.clipboard.writeText(commit).catch(() => {}); }}
            className="text-meta opacity-50 hover:opacity-100"
            style={{ fontSize: 10, padding: 0, background: 'none', border: 'none', cursor: 'pointer' }}
            title="Commit SHA-nı kopyala"
            aria-label="Commit SHA-nı kopyala"
          >
            📋
          </button>
        </span>
      ) : null}
      <span>· qurulub {builtFmt}</span>
    </div>
  );
}

// PRD §10.1 — at-a-glance firm size snapshot above the settings nav. Uses
// `count: 'exact', head: true` so we don't pull any rows — just the totals.
function FirmStatsRow() {
  const stats = useQuery({
    queryKey: ['settings-firm-stats'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [users, projects, clients, tasks] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'active').is('archived_at', null),
        supabase.from('clients').select('id', { count: 'exact', head: true }),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).is('archived_at', null).not('status', 'in', '("done","cancelled")'),
      ]);
      return {
        users: users.count ?? 0,
        projects: projects.count ?? 0,
        clients: clients.count ?? 0,
        tasks: tasks.count ?? 0,
      };
    },
  });
  const items: Array<[string, number]> = [
    ['Aktiv istifadəçi', stats.data?.users ?? 0],
    ['Aktiv layihə', stats.data?.projects ?? 0],
    ['Müştəri', stats.data?.clients ?? 0],
    ['Açıq tapşırıq', stats.data?.tasks ?? 0],
  ];
  return (
    <div className="card mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map(([label, n]) => (
        <div key={label}>
          <div className="text-meta" style={{ color: 'var(--text-muted)', fontSize: 11 }}>{label}</div>
          <div className="text-h2" style={{ fontVariantNumeric: 'tabular-nums' }}>{n}</div>
        </div>
      ))}
    </div>
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
  const [logoUrl, setLogoUrl] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoErr, setLogoErr] = useState<string | null>(null);
  const [currency, setCurrency] = useState('AZN');
  const [workHours, setWorkHours] = useState('8');
  const [holidaysEnabled, setHolidaysEnabled] = useState(true);

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
  if (loaded && logoUrl === '') {
    const raw = loaded.firm_logo_url;
    if (typeof raw === 'string' && raw) setLogoUrl(raw);
  }
  if (loaded && currency === 'AZN') {
    const raw = loaded.default_currency;
    if (typeof raw === 'string' && raw) setCurrency(raw);
  }
  if (loaded && workHours === '8') {
    const raw = loaded.working_hours_per_day;
    if (typeof raw === 'number') setWorkHours(String(raw));
    else if (typeof raw === 'string' && raw) setWorkHours(raw);
  }
  if (loaded) {
    const raw = loaded.az_public_holidays_enabled;
    if (typeof raw === 'boolean') setHolidaysEnabled(raw);
  }

  /** PRD §10.1 / REQ-SET-07 — Upload firm logo to Supabase Storage firm-assets bucket. */
  async function handleLogoUpload(file: File) {
    setLogoErr(null);
    if (!file.type.startsWith('image/')) {
      setLogoErr('Yalnız şəkil faylları qəbul edilir (JPEG, PNG, SVG…)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setLogoErr('Fayl ölçüsü 5 MB-dan az olmalıdır.');
      return;
    }
    setLogoUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? 'png';
      const path = `logo/firm-logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('firm-assets')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('firm-assets').getPublicUrl(path);
      const publicUrl = pub.publicUrl;
      const { error: settErr } = await supabase
        .from('system_settings')
        .upsert({ key: 'firm_logo_url', value: publicUrl }, { onConflict: 'key' });
      if (settErr) throw settErr;
      setLogoUrl(publicUrl);
      if (profile?.id) {
        await writeAudit(profile.id, 'settings.update', 'system_settings', { keys: ['firm_logo_url'] });
      }
    } catch (e) {
      setLogoErr((e as Error).message ?? 'Yükləmə xətası');
    } finally {
      setLogoUploading(false);
    }
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
        { key: 'default_currency', value: currency },
        { key: 'working_hours_per_day', value: Number(workHours) || 8 },
        { key: 'az_public_holidays_enabled', value: holidaysEnabled },
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
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Əsas valyuta</span>
          <div className="flex items-center gap-3 mt-1">
            <select className="input max-w-[140px]" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="AZN">AZN (₼)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
            </select>
            {/* PRD §UX — preview "12 345,67 ₼" so admin sees the exact format used */}
            <span
              className="text-meta"
              style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}
              title="Format nümunəsi"
            >
              {(12345.67).toLocaleString('az-AZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
              {currency === 'AZN' ? '₼' : currency === 'USD' ? '$' : '€'}
            </span>
          </div>
        </label>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Gündəlik iş saatı</span>
          <input
            type="number"
            min="1"
            max="24"
            className="input mt-1 max-w-[100px]"
            value={workHours}
            onChange={(e) => setWorkHours(e.target.value)}
            placeholder="8"
          />
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={holidaysEnabled}
            onChange={(e) => setHolidaysEnabled(e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          <span className="text-body">AZ dövlət bayramlarını qeyri-iş günü say</span>
        </label>
        {/* PRD §10.1 / REQ-SET-07 — Firm logo upload (Supabase Storage: firm-assets) */}
        <div>
          <span className="text-meta block mb-2" style={{ color: 'var(--text-muted)' }}>Şirkət logosu</span>
          <div className="flex items-center gap-4 flex-wrap">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Şirkət logosu"
                style={{ height: 56, maxWidth: 160, objectFit: 'contain', borderRadius: 8, background: 'var(--surface-mist)', padding: 6 }}
              />
            ) : (
              <div
                className="flex items-center justify-center text-meta rounded-card"
                style={{ width: 80, height: 56, background: 'var(--surface-mist)', color: 'var(--text-muted)', fontSize: 12 }}
              >
                Logo yoxdur
              </div>
            )}
            <label className="btn-outline cursor-pointer" style={{ display: 'inline-block' }}>
              {logoUploading ? 'Yüklənir…' : logoUrl ? 'Dəyişdir' : 'Logo yüklə'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                className="sr-only"
                disabled={logoUploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLogoUpload(f);
                  e.target.value = '';
                }}
              />
            </label>
            {logoUrl && !logoUploading && (
              <button
                type="button"
                className="text-meta hover:underline"
                style={{ color: 'var(--text-muted)', fontSize: 12 }}
                onClick={async () => {
                  await supabase.from('system_settings').delete().eq('key', 'firm_logo_url');
                  setLogoUrl('');
                }}
              >
                Sil
              </button>
            )}
          </div>
          {logoErr ? <p className="text-meta mt-1" style={{ color: 'var(--error-deep)', fontSize: 12 }}>{logoErr}</p> : null}
          <p className="text-meta mt-1" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
            Maks. 5 MB · JPEG, PNG, SVG
          </p>
        </div>

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
          {save.error ? <span className="text-meta" style={{ color: 'var(--error-deep)' }}>{(save.error as Error).message}</span> : null}
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
              style={{ color: 'var(--error-deep)', background: 'var(--error-bg)', fontSize: 12 }}
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
        {save.error ? <span className="text-meta" style={{ color: 'var(--error-deep)' }}>{(save.error as Error).message}</span> : null}
      </div>
    </div>
  );
}

// §10.2 / US-SYS-01 — Templates CRUD with {{variable}} extraction + preview
function TemplatesSettings() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<null | { id?: string; category: string; name: string; body: string; mime_type: string }>(null);
  const [preview, setPreview] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');

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
                <span key={v} className="chip" style={{ background: 'var(--brand-glow-md)', color: 'var(--brand-text)' }}>
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
        {save.error ? <p className="text-meta" style={{ color: 'var(--error-deep)' }}>{(save.error as Error).message}</p> : null}
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
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <h3 className="text-h3">Şablonlar</h3>
        <div className="flex gap-2 items-center">
          {/* PRD §10.2 — name/category search so the list stays usable as it grows */}
          <input
            className="input max-w-[200px]"
            placeholder="Axtar…"
            value={templateSearch}
            onChange={(e) => setTemplateSearch(e.target.value)}
            style={{ height: 32, fontSize: 12 }}
          />
          <button className="btn-primary" onClick={() => setEditing({ category: 'letter', name: '', body: '', mime_type: 'text/plain' })}>
            + Yeni şablon
          </button>
        </div>
      </div>
      {templates.isLoading ? <p className="text-meta">Yüklənir…</p> : null}
      {!templates.isLoading && (templates.data ?? []).length === 0 ? (
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>Hələ şablon yoxdur.</p>
      ) : null}
      <ul className="space-y-2">
        {((templates.data ?? []) as Array<{ id: string; name: string; category: string; body: string; mime_type: string }>)
          .filter((t) => !templateSearch.trim() || t.name.toLowerCase().includes(templateSearch.toLowerCase()) || t.category.toLowerCase().includes(templateSearch.toLowerCase()))
          .map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 py-2 border-b" style={{ borderColor: 'var(--line-soft)' }}>
            <div>
              <div className="text-body font-medium flex items-center gap-2">
                {t.name}
                {/* PRD §10.2 — variable count so admin sees template complexity at a glance */}
                {(() => {
                  const n = extractVars(t.body).length;
                  if (n === 0) return null;
                  return (
                    <span
                      className="chip"
                      style={{
                        background: 'var(--brand-glow-sm)',
                        color: 'var(--brand-text)',
                        fontSize: 10,
                        padding: '0 6px',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                      title={`${n} dəyişən: ${extractVars(t.body).join(', ')}`}
                    >
                      {`{{${n}}}`}
                    </span>
                  );
                })()}
              </div>
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
              <button className="chip" style={{ color: 'var(--error-deep)' }} onClick={() => del.mutate(t.id)}>
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
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [uploadOk, setUploadOk] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [kbDragOver, setKbDragOver] = useState(false);

  // PRD §10.3 — admin can prune obsolete PDF sources so RAG retrieval stays clean
  const deletePdf = useMutation({
    mutationFn: async (pdfName: string) => {
      const { error } = await supabase
        .from('knowledge_base')
        .delete()
        .eq('source_pdf', pdfName);
      if (error) throw error;
      if (profile?.id) {
        await supabase.from('audit_log').insert({
          actor_id: profile.id,
          action: 'knowledge_base.delete',
          resource: 'knowledge_base',
          ip: null,
          user_agent: navigator.userAgent,
          meta: { source_pdf: pdfName },
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge-base'] });
      setConfirmDelete(null);
    },
  });

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

  // PRD §10.3 — surface aggregate counts so admin sees corpus size at a glance
  const totalChunks = pdfs.reduce(
    (sum, [, meta]) => sum + ((meta as { count?: number }).count ?? 0), 0,
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-h3">Bilik Bazası (MIRAI RAG)</h3>
        {pdfs.length > 0 ? (
          <span
            className="text-meta"
            style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}
          >
            {pdfs.length} PDF · {totalChunks} hissə
          </span>
        ) : null}
      </div>
      <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
        AZ inşaat normaları, AZDNT sənədlərini yükləyin. MIRAI Hüquqşünas bu mənbələrə istinad edər.
      </p>
      {/* RAG axtarışı Postgres FTS ilə işləyir — heç bir xarici açar tələb olunmur. */}

      {/* PRD §10.3 — drag-and-drop zone for PDF uploads (also accepts click→file picker) */}
      <label
        className="flex items-center gap-3 cursor-pointer rounded-card p-4"
        style={{
          border: `1px dashed ${kbDragOver ? 'var(--brand-action)' : 'var(--line)'}`,
          background: kbDragOver ? 'var(--brand-glow-sm)' : 'transparent',
          transition: 'background 0.15s, border-color 0.15s',
        }}
        onDragOver={(e) => { e.preventDefault(); setKbDragOver(true); }}
        onDragLeave={() => setKbDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setKbDragOver(false);
          if (uploading) return;
          const file = e.dataTransfer.files?.[0];
          if (!file) return;
          // Mimic the input change event so existing handler runs
          const dt = new DataTransfer();
          dt.items.add(file);
          const ev = { target: { files: dt.files, value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>;
          void handleUpload(ev);
        }}
      >
        <input
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleUpload}
          disabled={uploading}
        />
        <span className="btn-primary">{uploading ? 'Yüklənir…' : 'PDF yüklə'}</span>
        <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
          və ya buraya sürükləyin · maks 4 MB (Vercel limiti)
        </span>
      </label>

      {uploadOk ? <p className="text-meta" style={{ color: 'var(--brand-text)' }}>{uploadOk}</p> : null}
      {uploadErr ? <p className="text-meta" style={{ color: 'var(--error-deep)' }}>{uploadErr}</p> : null}

      {/* PRD §10.3 — chunk content search across uploaded PDFs */}
      <KnowledgeBaseSearch />

      {chunks.isLoading ? <p className="text-meta">Yüklənir…</p> : null}

      {pdfs.length === 0 && !chunks.isLoading ? (
        <div
          className="rounded-card p-6 text-center"
          style={{ border: '1px dashed var(--line)', background: 'var(--surface-mist)' }}
        >
          <div className="text-h3 mb-2">📚 Bilik bazası boşdur</div>
          <p className="text-meta mb-3" style={{ color: 'var(--text-muted)' }}>
            PDF yükləyin — MIRAI RAG cavablar verərkən bu sənədlərə istinad edəcək.<br />
            Tipik istifadə: AZ normativləri, daxili siyasətlər, tender qaydaları.
          </p>
        </div>
      ) : null}

      {pdfs.length > 0 ? (
        <ul className="space-y-2">
          {pdfs.map(([pdf, meta]) => (
            <li
              key={pdf}
              className="flex items-center justify-between gap-3 py-2 border-b"
              style={{ borderColor: 'var(--line-soft)' }}
              title={`${pdf}\n${meta.count} hissə\nYüklənib: ${new Date(meta.uploaded_at).toLocaleString('az-AZ', { timeZone: 'Asia/Baku' })}`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-body font-medium truncate">{pdf}</div>
                <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                  {meta.count} hissə · {new Date(meta.uploaded_at).toLocaleDateString('az-AZ')}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="chip" style={{ background: 'var(--brand-glow-md)', color: 'var(--brand-text)' }}>
                  RAG
                </span>
                {confirmDelete === pdf ? (
                  <>
                    <button
                      type="button"
                      className="chip"
                      style={{ background: 'var(--error-deep)', color: 'white' }}
                      disabled={deletePdf.isPending}
                      onClick={() => deletePdf.mutate(pdf)}
                    >
                      {deletePdf.isPending ? 'Silinir…' : 'Bəli'}
                    </button>
                    <button
                      type="button"
                      className="chip"
                      onClick={() => setConfirmDelete(null)}
                    >
                      Ləğv
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="chip"
                    style={{ color: 'var(--error-deep)' }}
                    onClick={() => setConfirmDelete(pdf)}
                    title={`${meta.count} hissə silinəcək`}
                  >
                    Sil
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
function NotificationsSettings() {
  return (
    <div className="space-y-8">
      <NotificationPreferencesPage />
      {/* PRD §9.4 — admin MIRAI cost dashboard */}
      <MiraiCostDashboard />
      {/* PRD §9.4 — audit log retention */}
      <AuditLogRetentionSetting />
      {/* PRD §9.4 — admin audit log viewer */}
      <AuditLogViewer />
    </div>
  );
}

// PRD §9.4 — admin sets how long audit_log rows are kept (days, default 365)
function AuditLogRetentionSetting() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const setting = useQuery({
    queryKey: ['system_setting', 'audit_log_retention_days'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'audit_log_retention_days')
        .maybeSingle();
      return Number((data?.value as { days?: number } | null)?.days ?? 365);
    },
  });
  const [val, setVal] = useState<string>('');
  useEffect(() => {
    if (setting.data != null && val === '') setVal(String(setting.data));
  }, [setting.data, val]);
  const save = useMutation({
    mutationFn: async () => {
      const days = Math.max(30, Math.min(3650, Number(val) || 365));
      const { error } = await supabase.from('system_settings').upsert({
        key: 'audit_log_retention_days',
        value: { days },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system_setting', 'audit_log_retention_days'] });
    },
  });
  if (!isAdmin) return null;
  return (
    <section className="card flex items-center gap-3 flex-wrap" style={{ padding: 16 }}>
      <div className="flex-1 min-w-0">
        <h3 className="text-h3">Audit jurnalının saxlama müddəti</h3>
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Köhnə qeydlərin avtomatik silinməsi üçün gün sayı (30–3650). Cron işi
          bu dəyəri oxuyub uyğun sıraları arxivləyir.
        </p>
      </div>
      <input
        type="number"
        min={30}
        max={3650}
        className="input max-w-[120px]"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      />
      <button
        type="button"
        className="btn-primary"
        disabled={save.isPending || val === String(setting.data ?? '')}
        onClick={() => save.mutate()}
      >
        {save.isPending ? '…' : 'Saxla'}
      </button>
    </section>
  );
}

// PRD §10.3 — search across knowledge_base chunks (FTS-backed RPC)
function KnowledgeBaseSearch() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const results = useQuery({
    queryKey: ['kb-search', debounced],
    enabled: debounced.length >= 3,
    queryFn: async () => {
      const { data } = await supabase.rpc('match_knowledge_base', {
        query_text: debounced,
        match_count: 8,
      });
      return (data ?? []) as Array<{ source_pdf: string; chunk_index: number; content: string }>;
    },
  });
  return (
    <div className="mt-4">
      <input
        type="text"
        className="input w-full"
        placeholder="Bilik bazasında axtar (min 3 simvol)…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {debounced.length >= 3 ? (
        <ul className="mt-2 space-y-2">
          {results.isLoading ? (
            <li className="text-meta" style={{ color: 'var(--text-muted)' }}>Axtarılır…</li>
          ) : (results.data ?? []).length === 0 ? (
            <li className="text-meta" style={{ color: 'var(--text-muted)' }}>Nəticə tapılmadı</li>
          ) : (
            (results.data ?? []).map((r, i) => (
              <li
                key={`${r.source_pdf}-${r.chunk_index}-${i}`}
                className="rounded-card p-2 text-meta"
                style={{ background: 'var(--surface-mist)' }}
              >
                <div className="font-medium" style={{ color: 'var(--text)' }}>
                  {r.source_pdf} <span style={{ color: 'var(--text-muted)' }}>· Hissə {r.chunk_index}</span>
                </div>
                <div className="mt-1" style={{ color: 'var(--text-soft)' }}>
                  {r.content.slice(0, 240)}{r.content.length > 240 ? '…' : ''}
                </div>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

// PRD §9.4 — paginated audit_log viewer (admin only; route is RequireAdmin-gated)
function AuditLogViewer() {
  const { isAdmin } = useAuth();
  const [page, setPage] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const [actorId, setActorId] = useState('');
  const PAGE_SIZE = 30;

  // PRD §9.4 — actor dropdown for "what did user X do?" forensics
  const profilesForFilter = useQuery({
    queryKey: ['profiles', 'audit-actor-filter'],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .order('full_name');
      return (data ?? []) as Array<{ id: string; full_name: string | null; email: string }>;
    },
    staleTime: 5 * 60_000,
  });

  const audit = useQuery({
    queryKey: ['audit-log', page, actionFilter, actorId],
    enabled: isAdmin,
    queryFn: async () => {
      let q = supabase
        .from('audit_log')
        .select('id, actor_id, action, resource, ip, user_agent, meta, created_at, profile:profiles!audit_log_actor_id_fkey(full_name, email)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (actionFilter.trim()) q = q.ilike('action', `%${actionFilter.trim()}%`);
      if (actorId) q = q.eq('actor_id', actorId);
      const { data, count, error } = await q;
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  if (!isAdmin) return null;

  const rows = audit.data?.rows ?? [];
  const total = audit.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section>
      <h2 className="text-h2 mb-1">Audit jurnalı</h2>
      <p className="text-meta mb-4" style={{ color: 'var(--text-muted)' }}>
        Privileged əməliyyatların qeydi (PRD §9.4) — rol dəyişiklikləri, dəvətlər, ayar yeniləmələri.
      </p>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          className="input max-w-[260px]"
          placeholder="Action filter (məs: invitation, settings)"
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(0); }}
        />
        <select
          className="input max-w-[220px]"
          value={actorId}
          onChange={(e) => { setActorId(e.target.value); setPage(0); }}
          aria-label="Aktor filtri"
        >
          <option value="">Bütün aktorlar</option>
          {(profilesForFilter.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>
          ))}
        </select>
        {(actionFilter || actorId) ? (
          <button
            type="button"
            className="chip"
            onClick={() => { setActionFilter(''); setActorId(''); setPage(0); }}
          >
            Sıfırla
          </button>
        ) : null}
        <span className="text-meta" style={{ color: 'var(--text-muted)' }}>{total} qeyd</span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="chip"
          disabled={total === 0}
          onClick={async () => {
            // Export ALL filtered rows (not just current page) — admin needs the full set for forensics
            let q = supabase
              .from('audit_log')
              .select('id, actor_id, action, resource, ip, user_agent, meta, created_at, profile:profiles!audit_log_actor_id_fkey(full_name, email)')
              .order('created_at', { ascending: false })
              .limit(5000);
            if (actionFilter.trim()) q = q.ilike('action', `%${actionFilter.trim()}%`);
            if (actorId) q = q.eq('actor_id', actorId);
            const { data } = await q;
            const rows = (data ?? []).map((r) => {
              const actor = r.profile as unknown as { full_name?: string; email?: string } | null;
              return {
                Vaxt: new Date(r.created_at).toISOString(),
                Aktor: actor?.full_name ?? actor?.email ?? r.actor_id ?? 'Sistem',
                Action: r.action,
                Resource: r.resource ?? '',
                IP: r.ip ?? '',
                'User-Agent': r.user_agent ?? '',
                Meta: r.meta ? JSON.stringify(r.meta) : '',
              };
            });
            downloadCsv(
              `audit-log-${new Date().toISOString().slice(0, 10)}`,
              ['Vaxt', 'Aktor', 'Action', 'Resource', 'IP', 'User-Agent', 'Meta'],
              rows,
            );
          }}
        >
          ↓ CSV
        </button>
      </div>

      {audit.isLoading ? (
        <div className="text-meta" style={{ color: 'var(--text-muted)' }}>Yüklənir…</div>
      ) : rows.length === 0 ? (
        <EmptyState title="Hələ qeyd yoxdur" body="Privileged əməliyyatlar burada görünəcək." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-body" style={{ minWidth: 720 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  <th className="text-meta text-left py-2 pr-3" style={{ color: 'var(--text-muted)' }}>Vaxt</th>
                  <th className="text-meta text-left py-2 px-3" style={{ color: 'var(--text-muted)' }}>Aktor</th>
                  <th className="text-meta text-left py-2 px-3" style={{ color: 'var(--text-muted)' }}>Action</th>
                  <th className="text-meta text-left py-2 px-3" style={{ color: 'var(--text-muted)' }}>Resource</th>
                  <th className="text-meta text-left py-2 pl-3" style={{ color: 'var(--text-muted)' }}>Detallar</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const actor = (r.profile as unknown as { full_name?: string; email?: string } | null) ?? null;
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                      <td className="py-2 pr-3 text-meta" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {new Date(r.created_at).toLocaleString('az-AZ', { timeZone: 'Asia/Baku' })}
                      </td>
                      <td className="py-2 px-3">{actor?.full_name ?? actor?.email ?? r.actor_id?.slice(0, 8) ?? 'Sistem'}</td>
                      <td className="py-2 px-3">
                        <code style={{ background: 'var(--brand-glow-sm)', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>
                          {r.action}
                        </code>
                      </td>
                      <td className="py-2 px-3 text-meta" style={{ color: 'var(--text-muted)' }}>{r.resource ?? '—'}</td>
                      <td className="py-2 pl-3 text-meta" style={{ color: 'var(--text-muted)', maxWidth: 280 }}>
                        {r.meta ? (
                          <code className="block truncate" title={JSON.stringify(r.meta)} style={{ fontSize: 11 }}>
                            {JSON.stringify(r.meta)}
                          </code>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between mt-3">
              <button
                className="chip"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                ← Əvvəlki
              </button>
              <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
                Səhifə {page + 1} / {totalPages}
              </span>
              <button
                className="chip"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Sonrakı →
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

// PRD §9.4 — MIRAI cost dashboard (admin only; route already gated by RequireAdmin)
function MiraiCostDashboard() {
  const { isAdmin } = useAuth();

  const period = new Date().toISOString().slice(0, 7).replace('-', ''); // YYYYMM

  const usage = useQuery({
    queryKey: ['mirai-cost-dashboard', period],
    enabled: isAdmin,
    queryFn: async () => {
      const { data: usageRows } = await supabase
        .from('mirai_usage_log')
        .select('user_id, tokens_in, tokens_out, cost_usd')
        .eq('period_yyyymm', period);
      const ids = Array.from(new Set((usageRows ?? []).map((r) => r.user_id)));
      const { data: profileRows } = ids.length
        ? await supabase.from('profiles').select('id, full_name, email').in('id', ids)
        : { data: [] as Array<{ id: string; full_name: string | null; email: string }> };
      const profMap = new Map((profileRows ?? []).map((p) => [p.id, p]));
      return (usageRows ?? []).map((r) => ({
        user_id: r.user_id as string,
        tokens_in: (r.tokens_in ?? 0) as number,
        tokens_out: (r.tokens_out ?? 0) as number,
        cost_usd: (r.cost_usd ?? 0) as number,
        profile: profMap.get(r.user_id) ?? null,
      }));
    },
  });

  // PRD §9.4 — 30-day daily MIRAI cost trend
  const dailyTrend = useQuery({
    queryKey: ['mirai-cost-daily', period],
    enabled: isAdmin,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { data: msgs } = await supabase
        .from('mirai_messages')
        .select('cost_usd, created_at')
        .gte('created_at', since)
        .gt('cost_usd', 0);
      // Bucket by Asia/Baku date
      const buckets = new Map<string, number>();
      for (const m of msgs ?? []) {
        const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baku' })
          .format(new Date(m.created_at as string));
        buckets.set(day, (buckets.get(day) ?? 0) + (m.cost_usd ?? 0));
      }
      // Fill missing days with 0 so the line is continuous
      const out: Array<{ day: string; cost: number }> = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86_400_000);
        const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baku' }).format(d);
        out.push({ day: key.slice(5), cost: Number((buckets.get(key) ?? 0).toFixed(4)) });
      }
      return out;
    },
  });

  const personaBreakdown = useQuery({
    queryKey: ['mirai-cost-personas', period],
    enabled: isAdmin,
    queryFn: async () => {
      // Last 30 days of messages — fetch costs + conversation_id, then join personas in JS
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { data: msgs } = await supabase
        .from('mirai_messages')
        .select('cost_usd, conversation_id')
        .gte('created_at', since)
        .gt('cost_usd', 0);
      const convIds = Array.from(new Set((msgs ?? []).map((m) => m.conversation_id).filter(Boolean) as string[]));
      const { data: convs } = convIds.length
        ? await supabase.from('mirai_conversations').select('id, persona').in('id', convIds)
        : { data: [] as Array<{ id: string; persona: string }> };
      const personaMap = new Map((convs ?? []).map((c) => [c.id, c.persona]));
      const costMap = new Map<string, number>();
      for (const m of msgs ?? []) {
        const p = (m.conversation_id && personaMap.get(m.conversation_id)) || 'unknown';
        costMap.set(p, (costMap.get(p) ?? 0) + (m.cost_usd ?? 0));
      }
      return Array.from(costMap.entries())
        .map(([persona, cost]) => ({ persona, cost }))
        .sort((a, b) => b.cost - a.cost);
    },
  });

  if (!isAdmin) return null;

  const rows = usage.data ?? [];
  const totalCost = rows.reduce((s, r) => s + (r.cost_usd ?? 0), 0);
  const totalIn = rows.reduce((s, r) => s + (r.tokens_in ?? 0), 0);
  const totalOut = rows.reduce((s, r) => s + (r.tokens_out ?? 0), 0);

  // Default per-user budget — PRD §7.6 Cost Guardian (5 USD/user/month default)
  const userBudget = 5;

  return (
    <section>
      <h2 className="text-h2 mb-1">MIRAI xərc paneli</h2>
      <p className="text-meta mb-4" style={{ color: 'var(--text-muted)' }}>
        Bu ay ({period.slice(0, 4)}-{period.slice(4)}) — Anthropic Haiku 4.5 istifadəsi
      </p>

      {/* Summary tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="rounded-card p-4" style={{ background: 'var(--brand-glow-sm)' }}>
          <div className="text-meta" style={{ color: 'var(--text-muted)' }}>Bu ay xərc</div>
          <div className="text-h2" style={{ fontVariantNumeric: 'tabular-nums' }}>
            ${totalCost.toFixed(2)}
          </div>
        </div>
        <div className="rounded-card p-4" style={{ background: 'var(--brand-glow-sm)' }}>
          <div className="text-meta" style={{ color: 'var(--text-muted)' }}>Input tokens</div>
          <div className="text-h2" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {totalIn.toLocaleString('az-AZ')}
          </div>
        </div>
        <div className="rounded-card p-4" style={{ background: 'var(--brand-glow-sm)' }}>
          <div className="text-meta" style={{ color: 'var(--text-muted)' }}>Output tokens</div>
          <div className="text-h2" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {totalOut.toLocaleString('az-AZ')}
          </div>
        </div>
      </div>

      {/* 30-day daily cost trend */}
      {(dailyTrend.data ?? []).length > 0 ? (
        <div className="mb-6">
          <h3 className="text-h3 mb-2">Son 30 günlük xərc trendi</h3>
          <div style={{ width: '100%', height: 180 }}>
            <ResponsiveContainer>
              <LineChart data={dailyTrend.data ?? []} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <XAxis dataKey="day" stroke="var(--text-muted)" fontSize={10} interval={6} />
                <YAxis stroke="var(--text-muted)" fontSize={10} tickFormatter={(v) => `$${Number(v).toFixed(2)}`} />
                <RechartsTooltip
                  contentStyle={{
                    background: 'var(--ink)',
                    border: '1px solid var(--line)',
                    borderRadius: 8,
                    color: 'var(--canvas)',
                  }}
                  formatter={(v) => [`$${Number(v).toFixed(4)}`, 'Gündəlik xərc']}
                />
                <Line
                  type="monotone"
                  dataKey="cost"
                  stroke="var(--brand-action)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      {/* Per-user table */}
      <h3 className="text-h3 mb-2">İstifadəçi üzrə</h3>
      {usage.isLoading ? (
        <div className="text-meta" style={{ color: 'var(--text-muted)' }}>Yüklənir…</div>
      ) : rows.length === 0 ? (
        <EmptyState title="Bu ay üçün məlumat yoxdur" body="MIRAI istifadə olunduqdan sonra burada görünəcək." />
      ) : (
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-body" style={{ minWidth: 480 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <th className="text-meta text-left py-2 pr-3" style={{ color: 'var(--text-muted)' }}>İstifadəçi</th>
                <th className="text-meta text-right py-2 px-3" style={{ color: 'var(--text-muted)' }}>Input</th>
                <th className="text-meta text-right py-2 px-3" style={{ color: 'var(--text-muted)' }}>Output</th>
                <th className="text-meta text-right py-2 px-3" style={{ color: 'var(--text-muted)' }}>Xərc</th>
                <th className="text-meta text-right py-2 pl-3" style={{ color: 'var(--text-muted)' }}>Büdcə</th>
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .sort((a, b) => (b.cost_usd ?? 0) - (a.cost_usd ?? 0))
                .map((r) => {
                  const pct = Math.min(100, Math.round(((r.cost_usd ?? 0) / userBudget) * 100));
                  const colour = pct >= 100 ? 'var(--error-deep)' : pct >= 80 ? '#c47d00' : 'var(--brand-text)';
                  return (
                    <tr key={r.user_id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                      <td className="py-2 pr-3">{r.profile?.full_name ?? r.profile?.email ?? r.user_id.slice(0, 8)}</td>
                      <td className="py-2 px-3 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {(r.tokens_in ?? 0).toLocaleString('az-AZ')}
                      </td>
                      <td className="py-2 px-3 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {(r.tokens_out ?? 0).toLocaleString('az-AZ')}
                      </td>
                      <td className="py-2 px-3 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        ${(r.cost_usd ?? 0).toFixed(2)}
                      </td>
                      <td className="py-2 pl-3 text-right" style={{ fontVariantNumeric: 'tabular-nums', color: colour }}>
                        {pct}%
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-persona breakdown */}
      <h3 className="text-h3 mb-2">Persona üzrə (son 30 gün)</h3>
      {personaBreakdown.isLoading ? (
        <div className="text-meta" style={{ color: 'var(--text-muted)' }}>Yüklənir…</div>
      ) : (personaBreakdown.data ?? []).length === 0 ? (
        <div className="text-meta" style={{ color: 'var(--text-muted)' }}>Məlumat yoxdur</div>
      ) : (
        <ul className="space-y-1">
          {(personaBreakdown.data ?? []).map((p) => {
            const max = Math.max(...(personaBreakdown.data ?? []).map((x) => x.cost));
            const pct = max > 0 ? Math.round((p.cost / max) * 100) : 0;
            return (
              <li key={p.persona} className="flex items-center gap-3">
                <div className="text-body w-44 truncate">{p.persona}</div>
                <div className="flex-1 h-2 rounded-full" style={{ background: 'var(--line-soft)' }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--brand-action)' }} />
                </div>
                <div className="text-meta w-20 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  ${p.cost.toFixed(2)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
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

      // PRD §9.1 / §9.4 — audit privileged action
      if (profile?.id) {
        await writeAudit(profile.id, 'invitation.create', 'invitations', {
          email: email.trim().toLowerCase(),
          role_key: role.key,
        });
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
      // Look up invite first so we can record what was revoked
      const target = (invitations.data ?? []).find((i) => i.id === id);
      const { error } = await supabase.from('invitations').delete().eq('id', id);
      if (error) throw error;
      // PRD §9.1 / §9.4 — audit privileged action
      if (profile?.id) {
        await writeAudit(profile.id, 'invitation.revoke', 'invitations', {
          invitation_id: id,
          email: target?.email ?? null,
          role_key: target?.role?.key ?? null,
        });
      }
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
          <p className="text-meta mt-2" style={{ color: 'var(--error-deep)' }}>
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
                        style={{ color: expired ? 'var(--error-deep)' : 'var(--text-muted)' }}
                      >
                        {new Date(inv.expires_at).toLocaleDateString('az-AZ')}
                        {expired ? ' (vaxtı keçib)' : ''}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          className="btn-outline text-meta"
                          style={{ padding: '2px 10px', color: 'var(--error-deep)' }}
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
