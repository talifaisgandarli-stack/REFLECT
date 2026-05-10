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

// ── Document Templates — PRD §10.2 / US-SYS-01 ──────────────────────────────

const TEMPLATE_CATEGORIES = ['Kontrakt', 'Akt', 'Faktura', 'Sorğu', 'Digər'] as const;

type TemplateRow = {
  id: string;
  category: string;
  name: string;
  body: string;
  variables: Record<string, string>;
  created_at: string;
};

/** Extract {{variable_name}} tokens from template body. */
function extractVariables(body: string): string[] {
  const matches = body.match(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

/** Substitute {{var}} with sample values for preview. */
function renderPreview(body: string, vars: string[]): string {
  let out = body;
  for (const v of vars) {
    out = out.replace(new RegExp(`\\{\\{${v}\\}\\}`, 'g'), `[${v}]`);
  }
  return out;
}

function TemplatesSettings() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [creating, setCreating] = useState(false);

  const q = useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('templates')
        .select('id, category, name, body, variables, created_at')
        .order('category')
        .order('name');
      if (error) throw error;
      return (data ?? []) as TemplateRow[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });

  const rows = q.data ?? [];
  const byCategory = TEMPLATE_CATEGORIES.map((cat) => ({
    cat,
    items: rows.filter((r) => r.category === cat),
  })).filter((g) => g.items.length > 0 || creating);

  if (editing) {
    return (
      <TemplateEditor
        initial={editing}
        onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ['templates'] }); }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  if (creating) {
    return (
      <TemplateEditor
        initial={null}
        onSaved={() => { setCreating(false); qc.invalidateQueries({ queryKey: ['templates'] }); }}
        onCancel={() => setCreating(false)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-h3">Sənəd şablonları</h3>
        <button className="btn-primary" onClick={() => setCreating(true)}>+ Yeni şablon</button>
      </div>

      {q.isLoading ? (
        <p className="text-meta">Yüklənir…</p>
      ) : rows.length === 0 ? (
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Hələ şablon yoxdur. Kontrakt, akt və faktura şablonları əlavə edin.
        </p>
      ) : (
        byCategory.map(({ cat, items }) => (
          <div key={cat}>
            <h4 className="text-meta uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>{cat}</h4>
            <div className="space-y-2">
              {items.map((t) => {
                const vars = Object.keys(t.variables ?? {});
                return (
                  <div
                    key={t.id}
                    className="rounded-card p-3 flex items-start justify-between gap-3"
                    style={{ border: '1px solid var(--line-soft)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-body">{t.name}</div>
                      {vars.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {vars.map((v) => (
                            <span key={v} className="chip" style={{ fontSize: 11 }}>{`{{${v}}}`}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button className="chip" onClick={() => setEditing(t)}>Düzəlt</button>
                      <button
                        className="chip"
                        style={{ color: '#EF4444' }}
                        onClick={() => { if (confirm('Şablonu sil?')) del.mutate(t.id); }}
                      >
                        Sil
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

type TemplateEditorProps = {
  initial: TemplateRow | null;
  onSaved: () => void;
  onCancel: () => void;
};

function TemplateEditor({ initial, onSaved, onCancel }: TemplateEditorProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState<string>(initial?.category ?? 'Kontrakt');
  const [body, setBody] = useState(initial?.body ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const vars = extractVariables(body);

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Ad daxil edin');
      if (!body.trim()) throw new Error('Mətn daxil edin');
      const variables: Record<string, string> = Object.fromEntries(vars.map((v) => [v, '']));
      if (initial?.id) {
        const { error } = await supabase.from('templates').update({ name: name.trim(), category, body: body.trim(), variables }).eq('id', initial.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('templates').insert({ name: name.trim(), category, body: body.trim(), variables });
        if (error) throw error;
      }
    },
    onSuccess: onSaved,
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button className="chip" onClick={onCancel}>← Geri</button>
        <h3 className="text-h3">{initial ? 'Şablonu düzəlt' : 'Yeni şablon'}</h3>
      </div>

      <label className="block">
        <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Ad</span>
        <input className="input mt-1 w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Kontrakt — Standart" />
      </label>

      <label className="block">
        <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Kateqoriya</span>
        <select className="input mt-1" value={category} onChange={(e) => setCategory(e.target.value)}>
          {TEMPLATE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>

      <label className="block">
        <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Mətn — dəyişənlər üçün {'{{'}<span style={{ color: 'var(--brand-text)' }}>dəyişən_adı</span>{'}}'}
        </span>
        <textarea
          className="input mt-1 w-full font-mono"
          rows={12}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={`Hörmətli {{client_name}},\n\nBu müqavilə {{amount}} AZN məbləğində...`}
        />
      </label>

      {vars.length > 0 ? (
        <div>
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Aşkar edilmiş dəyişənlər: </span>
          <span className="text-meta">{vars.map((v) => `{{${v}}}`).join(', ')}</span>
        </div>
      ) : null}

      <button className="btn-outline" onClick={() => setShowPreview((p) => !p)}>
        {showPreview ? 'Redaktəyə qayıt' : 'Önbaxış'}
      </button>

      {showPreview && body ? (
        <div
          className="rounded-card p-4 text-body whitespace-pre-wrap"
          style={{ border: '1px solid var(--line-soft)', background: 'var(--surface-mist)', fontFamily: 'inherit' }}
        >
          {renderPreview(body, vars)}
        </div>
      ) : null}

      {err ? <p className="text-meta" style={{ color: '#EF4444' }}>{err}</p> : null}

      <div className="flex gap-2">
        <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saxlanılır…' : 'Saxla'}
        </button>
        <button className="btn-outline" onClick={onCancel}>Ləğv et</button>
      </div>
    </div>
  );
}
function KnowledgeBaseSettings() {
  return <p className="text-body">Yüklənmiş PDF-lər və MIRAI RAG mənbələri — burada idarə olunur.</p>;
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
