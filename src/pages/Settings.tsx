import { useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { NotificationPreferencesPage } from './NotificationPreferences';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import type { Invitation, Role } from '@/types/db';

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

// §10.2 / US-SYS-01 — Templates CRUD with {{variable}} extraction + preview
function TemplatesSettings() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<null | { id?: string; category: string; name: string; body: string; mime_type: string }>(null);
  const [preview, setPreview] = useState(false);

  const templates = useQuery({
    queryKey: ['templates'],
    queryFn: async () => (await supabase.from('templates').select('*').order('created_at', { ascending: false })).data ?? [],
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

// §10.3 / US-SYS-02 — Knowledge Base PDF upload + chunk + embed pipeline
function KnowledgeBaseSettings() {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [uploadOk, setUploadOk] = useState<string | null>(null);

  const chunks = useQuery({
    queryKey: ['knowledge-base'],
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

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleUpload}
          disabled={uploading}
        />
        <span className="btn-primary">{uploading ? 'Yüklənir…' : 'PDF yüklə'}</span>
        <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Maks. 50 MB</span>
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
      if (!profile?.id) throw new Error('Sessiya tapılmadı');

      const expires = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      const token = crypto.randomUUID();

      // PRD edge case: re-invite same email → reuse and bump expiry
      const existing = (invitations.data ?? []).find(
        (i) => i.email.toLowerCase() === email.trim().toLowerCase(),
      );

      if (existing) {
        const { error } = await supabase
          .from('invitations')
          .update({ expires_at: expires, role_id: roleId, invited_by: profile.id })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('invitations').insert({
          email: email.trim().toLowerCase(),
          role_id: roleId,
          invited_by: profile.id,
          token,
          expires_at: expires,
        });
        if (error) throw error;
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
