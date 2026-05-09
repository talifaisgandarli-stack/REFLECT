import { useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { NotificationPreferencesPage } from './NotificationPreferences';
import { supabase } from '@/lib/supabase';

const NAV = [
  { to: 'umumi', label: 'Ümumi' },
  { to: 'şablonlar', label: 'Şablonlar' },
  { to: 'bilik', label: 'Bilik Bazası' },
  { to: 'bildirişlər', label: 'Bildirişlər' },
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
          </Routes>
        </div>
      </div>
    </>
  );
}

function GeneralSettings() {
  return (
    <div className="space-y-3">
      <h3 className="text-h3">Şirkət</h3>
      <label className="block">
        <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Şirkət adı</span>
        <input className="input mt-1 max-w-md" defaultValue="Reflect" />
      </label>
      <label className="block">
        <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Region / Saat qurşağı</span>
        <input className="input mt-1 max-w-md" defaultValue="Asia/Baku" disabled />
      </label>
    </div>
  );
}

/**
 * Templates manager — PRD §10.3.
 * Variables system: body uses {{variable_name}}; declared variables are stored
 * as jsonb (label per key) so the runtime substitution can prompt for values.
 */
function TemplatesSettings() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const templates = useQuery({
    queryKey: ['templates'],
    queryFn: async () =>
      (
        (await supabase.from('templates').select('*').order('category')).data ?? []
      ) as Array<{
        id: string;
        category: string;
        name: string;
        body: string | null;
        variables: Record<string, string>;
      }>,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-h3">Sənəd şablonları</h3>
        <button className="btn-primary" onClick={() => setOpen(true)}>
          + Şablon
        </button>
      </div>

      {(templates.data ?? []).length === 0 ? (
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Hələ şablon yoxdur. Müqavilə, akt və faktura şablonlarını əlavə edin.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--line-soft)' }}>
          {(templates.data ?? []).map((t) => (
            <li key={t.id} className="py-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-body font-medium">{t.name}</div>
                  <div
                    className="text-meta"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {t.category}
                    {Object.keys(t.variables ?? {}).length > 0
                      ? ` · ${Object.keys(t.variables).length} dəyişən`
                      : ''}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <TemplateAddModal
          onClose={() => {
            setOpen(false);
            qc.invalidateQueries({ queryKey: ['templates'] });
          }}
        />
      ) : null}
    </div>
  );
}

function TemplateAddModal({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState('contract');
  const [name, setName] = useState('');
  const [body, setBody] = useState('');

  const submit = useMutation({
    mutationFn: async () => {
      // Auto-extract {{variable_name}} occurrences from body so the variables
      // jsonb is never empty when the template references any.
      const matches = Array.from(body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g));
      const variables: Record<string, string> = {};
      for (const m of matches) variables[m[1]] = m[1];
      const { error } = await supabase.from('templates').insert({
        category,
        name,
        body,
        variables,
      });
      if (error) throw error;
    },
    onSuccess: () => onClose(),
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
    >
      <div className="card max-w-lg w-full space-y-3">
        <h3 className="text-h3">Yeni şablon</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
              Kateqoriya
            </span>
            <select
              className="input mt-1 w-full"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {['contract', 'akt', 'invoice', 'price_protocol', 'other'].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
              Ad
            </span>
            <input
              className="input mt-1 w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        </div>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Mətn (dəyişənlər üçün {`{{variable_name}}`} formatından istifadə edin)
          </span>
          <textarea
            className="input mt-1 w-full"
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-outline" onClick={onClose}>
            Ləğv et
          </button>
          <button
            className="btn-primary"
            disabled={!name || submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? '…' : 'Yadda saxla'}
          </button>
        </div>
      </div>
    </div>
  );
}
/**
 * Bilik Bazası — PRD §10.3 + §7.4.
 * Text-paste ingest path. PDF parsing + embeddings are gaps in PRD §3.1
 * (no parser/embedding model approved); retrieval works today via FTS index.
 */
function KnowledgeBaseSettings() {
  const qc = useQueryClient();
  const [source, setSource] = useState('');
  const [text, setText] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const sources = useQuery({
    queryKey: ['kb', 'sources'],
    queryFn: async () => {
      const { data } = await supabase
        .from('knowledge_base')
        .select('source_pdf, chunk_index, uploaded_at')
        .order('uploaded_at', { ascending: false })
        .limit(500);
      const map = new Map<string, { count: number; uploaded_at: string }>();
      for (const r of (data ?? []) as Array<{
        source_pdf: string;
        uploaded_at: string;
      }>) {
        const cur = map.get(r.source_pdf);
        if (!cur) map.set(r.source_pdf, { count: 1, uploaded_at: r.uploaded_at });
        else cur.count++;
      }
      return Array.from(map.entries()).map(([source_pdf, v]) => ({
        source_pdf,
        ...v,
      }));
    },
  });

  const ingest = useMutation({
    mutationFn: async () => {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await fetch('/api/knowledge/ingest', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ source, text }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (j: { chunks: number }) => {
      setStatus(`Əlavə edildi · ${j.chunks} hissə`);
      setText('');
      setSource('');
      qc.invalidateQueries({ queryKey: ['kb', 'sources'] });
    },
    onError: (e: Error) => setStatus(`Xəta: ${e.message}`),
  });

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-h3 mb-3">Yeni mənbə əlavə et</h3>
        <p className="text-meta mb-3" style={{ color: 'var(--text-muted)' }}>
          Mətni yapışdır — server abzaslara bölüb knowledge_base-ə əlavə edəcək.
          PDF emalı və embedding PRD §3.1-də təsdiqlənmiş tech stack-də yoxdur,
          ona görə retrieval hələlik FTS (migration 0013) üzərindən işləyir.
        </p>
        <label className="block mb-2">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Mənbə adı (PDF / sənəd başlığı)
          </span>
          <input
            className="input mt-1 max-w-md"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="məs. Əmək Məcəlləsi 2024.pdf"
          />
        </label>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Mətn
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            className="w-full text-body mt-1"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 6,
              padding: 10,
            }}
          />
        </label>
        <div className="flex items-center gap-3 mt-3">
          <button
            className="btn-primary"
            disabled={!source.trim() || !text.trim() || ingest.isPending}
            onClick={() => ingest.mutate()}
          >
            {ingest.isPending ? '…' : 'Yüklə'}
          </button>
          {status ? (
            <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
              {status}
            </span>
          ) : null}
        </div>
      </div>

      <div>
        <h3 className="text-h3 mb-3">Mövcud mənbələr</h3>
        {(sources.data ?? []).length === 0 ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Hələ heç bir sənəd əlavə edilməyib.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--line-soft)' }}>
            {(sources.data ?? []).map((s) => (
              <li
                key={s.source_pdf}
                className="py-2 flex items-center justify-between gap-3"
              >
                <span className="text-body truncate">{s.source_pdf}</span>
                <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
                  {s.count} hissə
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
function NotificationsSettings() {
  return <NotificationPreferencesPage />;
}
