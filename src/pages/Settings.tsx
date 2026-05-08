import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { PageHead } from '@/components/PageHead';
import { useMemo, useState } from 'react';
import {
  useDeleteTemplate,
  useTemplates,
  useUpsertTemplate,
} from '@/lib/hooks';
import type { Template } from '@/types/db';
import { useAuth } from '@/lib/store';

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

const TEMPLATE_CATEGORIES = ['Kontrakt', 'Faktura', 'Akt', 'Məktub', 'Sorğu'] as const;

function TemplatesSettings() {
  const { isAdmin } = useAuth();
  const { data: templates = [], isLoading } = useTemplates();
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const [previewing, setPreviewing] = useState<Template | null>(null);

  const grouped = useMemo(() => {
    const m = new Map<string, Template[]>();
    for (const t of templates) {
      const arr = m.get(t.category) ?? [];
      arr.push(t);
      m.set(t.category, arr);
    }
    return [...m.entries()];
  }, [templates]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-h3">Şablonlar</h3>
        {isAdmin ? (
          <button className="btn-primary" onClick={() => setEditing('new')}>
            + Yeni şablon
          </button>
        ) : null}
      </div>

      {isLoading ? (
        <p className="text-meta">Yüklənir…</p>
      ) : templates.length === 0 ? (
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Hələ şablon yoxdur. {isAdmin ? '"+ Yeni şablon" düyməsi ilə əlavə et.' : 'Admin əlavə edəndən sonra görünəcək.'}
        </p>
      ) : (
        <div className="space-y-5">
          {grouped.map(([cat, items]) => (
            <div key={cat}>
              <div
                className="text-tiny uppercase tracking-wider mb-2"
                style={{ color: 'var(--text-muted)' }}
              >
                {cat}
              </div>
              <ul className="space-y-2">
                {items.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between rounded-card p-3"
                    style={{ border: '1px solid var(--line-soft)' }}
                  >
                    <div className="min-w-0">
                      <div className="text-body font-medium truncate">{t.name}</div>
                      <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                        {t.variables.length === 0
                          ? 'Dəyişən yoxdur'
                          : `${t.variables.length} dəyişən: ${t.variables.slice(0, 4).join(', ')}${t.variables.length > 4 ? '…' : ''}`}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button className="btn-outline" onClick={() => setPreviewing(t)}>
                        Önizlə
                      </button>
                      {isAdmin ? (
                        <button className="btn-outline" onClick={() => setEditing(t)}>
                          Düzəliş
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {editing ? (
        <TemplateEditor
          template={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {previewing ? (
        <TemplatePreview template={previewing} onClose={() => setPreviewing(null)} />
      ) : null}
    </div>
  );
}

function TemplateEditor({
  template,
  onClose,
}: {
  template: Template | null;
  onClose: () => void;
}) {
  const upsert = useUpsertTemplate();
  const del = useDeleteTemplate();
  const [category, setCategory] = useState(template?.category ?? TEMPLATE_CATEGORIES[0]);
  const [name, setName] = useState(template?.name ?? '');
  const [body, setBody] = useState(template?.body ?? '');
  const [mimeType, setMimeType] = useState(template?.mime_type ?? 'text/plain');
  const [err, setErr] = useState<string | null>(null);

  const detected = useMemo(() => extractVars(body), [body]);

  function submit() {
    setErr(null);
    if (!name.trim()) {
      setErr('Ad boş ola bilməz.');
      return;
    }
    upsert.mutate(
      {
        id: template?.id,
        category,
        name: name.trim(),
        body,
        mime_type: mimeType || null,
      },
      { onSuccess: onClose, onError: (e) => setErr((e as Error).message) },
    );
  }

  return (
    <Modal title={template ? 'Şablonu düzəlt' : 'Yeni şablon'} onClose={onClose}>
      <Field label="Kateqoriya">
        <select className="input w-full" value={category} onChange={(e) => setCategory(e.target.value)}>
          {TEMPLATE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Ad">
        <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <Field label="MIME">
        <input className="input w-full" value={mimeType} onChange={(e) => setMimeType(e.target.value)} />
      </Field>
      <Field label="Mətn ({{variable}} sintaksisi)">
        <textarea
          className="input w-full"
          rows={10}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </Field>
      <div className="text-meta mb-3" style={{ color: 'var(--text-muted)' }}>
        Aşkarlanan dəyişənlər: {detected.length === 0 ? '—' : detected.join(', ')}
      </div>
      {err ? <div className="text-meta" style={{ color: 'var(--danger, #B91C1C)' }}>{err}</div> : null}
      <div className="flex justify-between mt-4">
        <div>
          {template ? (
            <button
              className="btn-outline"
              onClick={() => {
                if (!confirm('Şablonu silmək istəyirsiniz?')) return;
                del.mutate(template.id, { onSuccess: onClose });
              }}
              style={{ color: 'var(--danger, #B91C1C)' }}
            >
              Sil
            </button>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button className="btn-outline" onClick={onClose}>
            Ləğv et
          </button>
          <button className="btn-primary" disabled={upsert.isPending} onClick={submit}>
            {upsert.isPending ? 'Yazılır…' : 'Yadda saxla'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function TemplatePreview({ template, onClose }: { template: Template; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(template.variables.map((v) => [v, `{{${v}}}`])),
  );
  const filled = useMemo(() => fillTemplate(template.body ?? '', values), [template.body, values]);

  return (
    <Modal title={`Önizlə: ${template.name}`} onClose={onClose}>
      {template.variables.length === 0 ? (
        <p className="text-meta mb-3" style={{ color: 'var(--text-muted)' }}>
          Bu şablonda dəyişən yoxdur.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 mb-3">
          {template.variables.map((v) => (
            <label key={v} className="block">
              <div
                className="text-meta uppercase tracking-wider mb-1"
                style={{ color: 'var(--text-muted)' }}
              >
                {v}
              </div>
              <input
                className="input w-full"
                value={values[v] ?? ''}
                onChange={(e) => setValues((p) => ({ ...p, [v]: e.target.value }))}
              />
            </label>
          ))}
        </div>
      )}
      <div
        className="rounded-card p-3 text-body whitespace-pre-wrap"
        style={{ background: 'var(--surface-mist)', maxHeight: 320, overflowY: 'auto' }}
      >
        {filled || <span style={{ color: 'var(--text-muted)' }}>Mətn yoxdur.</span>}
      </div>
      <div className="flex justify-end mt-4">
        <button className="btn-outline" onClick={onClose}>
          Bağla
        </button>
      </div>
    </Modal>
  );
}

const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

function extractVars(body: string): string[] {
  const seen = new Set<string>();
  for (const m of body.matchAll(VAR_RE)) seen.add(m[1]);
  return [...seen];
}

function fillTemplate(body: string, values: Record<string, string>): string {
  return body.replace(VAR_RE, (_, name) => values[name] ?? `{{${name}}}`);
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(14,22,17,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-surface p-6 rounded-card w-[560px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-h2 mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <div
        className="text-meta uppercase tracking-wider mb-1"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}
function KnowledgeBaseSettings() {
  return <p className="text-body">Yüklənmiş PDF-lər və MIRAI RAG mənbələri — burada idarə olunur.</p>;
}
function NotificationsSettings() {
  return <p className="text-body">Email + Telegram bildiriş tərcihləri.</p>;
}
