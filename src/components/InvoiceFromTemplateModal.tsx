/**
 * US-FIN-08 — Generate invoice from template.
 * Fills {{variables}} from project data, auto-increments AZ-YYYY-NNNN,
 * inserts project_documents row with source='auto_generated' + share_token.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';

type Template = {
  id: string;
  name: string;
  body: string;
  variables: string[] | null;
  category: string;
};

type Project = {
  id: string;
  name: string;
  client_id: string | null;
};

type Client = { id: string; name: string };

const VAR_REGEX = /\{\{(\w+)\}\}/g;

function extractVars(body: string): string[] {
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(VAR_REGEX.source, 'g');
  while ((m = re.exec(body)) !== null) found.add(m[1]);
  return [...found];
}

function fillTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `AZ-${year}-`;
  const { data } = await supabase
    .from('incomes')
    .select('invoice_number')
    .like('invoice_number', `${prefix}%`)
    .order('invoice_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.invoice_number) {
    const n = parseInt(data.invoice_number.slice(prefix.length), 10);
    return `${prefix}${String((isNaN(n) ? 0 : n) + 1).padStart(4, '0')}`;
  }
  return `${prefix}0001`;
}

export function InvoiceFromTemplateModal({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [step, setStep] = useState<'pick' | 'fill' | 'done'>('pick');
  const [tpl, setTpl] = useState<Template | null>(null);
  const [projectId, setProjectId] = useState('');
  const [vars, setVars] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ invoiceNumber: string; shareToken: string } | null>(null);

  const templates = useQuery<Template[]>({
    queryKey: ['templates', 'invoice'],
    queryFn: async () =>
      ((await supabase.from('templates').select('id, name, body, variables, category').limit(50)).data ?? []) as Template[],
  });

  const projects = useQuery<Project[]>({
    queryKey: ['projects-slim'],
    queryFn: async () =>
      ((await supabase.from('projects').select('id, name, client_id').eq('status', 'active').limit(100)).data ?? []) as Project[],
  });

  const clients = useQuery<Client[]>({
    queryKey: ['clients-slim'],
    queryFn: async () =>
      ((await supabase.from('clients').select('id, name').limit(200)).data ?? []) as Client[],
  });

  const generate = useMutation({
    mutationFn: async () => {
      if (!tpl) throw new Error('Şablon seçilməyib');
      const invoiceNumber = await nextInvoiceNumber();
      const filledBody = fillTemplate(tpl.body, vars);
      const token = crypto.randomUUID();
      const project = (projects.data ?? []).find((p) => p.id === projectId);
      const { error } = await supabase.from('project_documents').insert({
        project_id: projectId || null,
        client_id: project?.client_id ?? null,
        category: 'invoice',
        title: `${invoiceNumber} — ${tpl.name}`,
        source: 'auto_generated',
        storage_path: null,
        external_link: null,
        share_token: token,
        shared_with: [],
        created_by: profile?.id ?? null,
      });
      if (error) throw error;
      return { invoiceNumber, shareToken: token, filledBody };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['project_documents'] });
      setResult({ invoiceNumber: data.invoiceNumber, shareToken: data.shareToken });
      setStep('done');
    },
  });

  function pickTemplate(t: Template) {
    setTpl(t);
    // Pre-fill date
    const today = new Date().toISOString().slice(0, 10);
    const project = (projects.data ?? []).find((p) => p.id === projectId);
    const client = project
      ? (clients.data ?? []).find((c) => c.id === project.client_id)
      : null;
    const initial: Record<string, string> = { date: today };
    if (client) initial.client_name = client.name;
    setVars(initial);
    setStep('fill');
  }

  const varNames = tpl ? extractVars(tpl.body) : [];

  const shareUrl = result
    ? `${window.location.origin}/docs/${result.shareToken}`
    : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(14,22,17,0.6)' }}
      onClick={onClose}
    >
      <div
        className="bg-surface p-6 rounded-card w-[520px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {step === 'pick' && (
          <>
            <h2 className="text-h2 mb-1">Faktura — şablon seç</h2>
            <p className="text-meta mb-4" style={{ color: 'var(--text-muted)' }}>
              Mövcud şablonlardan birini seçin.
            </p>

            <div className="mb-4">
              <label className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Layihə (ixtiyari)
              </label>
              <select
                className="input w-full"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">— seçin —</option>
                {(projects.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {templates.isLoading ? (
              <p className="text-meta" style={{ color: 'var(--text-muted)' }}>Yüklənir…</p>
            ) : (templates.data ?? []).length === 0 ? (
              <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
                Heç bir şablon tapılmadı. Parametrlər → Şablonlar bölməsindən əlavə edin.
              </p>
            ) : (
              <div className="space-y-2">
                {(templates.data ?? []).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => pickTemplate(t)}
                    className="w-full text-left rounded-card p-3 border transition-colors"
                    style={{
                      background: 'var(--surface-raised)',
                      border: '1px solid var(--line)',
                    }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-action)')
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLElement).style.borderColor = 'var(--line)')
                    }
                  >
                    <div className="font-medium">{t.name}</div>
                    <div className="text-meta mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {t.category}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="flex justify-end mt-5">
              <button className="btn-outline" onClick={onClose}>Bağla</button>
            </div>
          </>
        )}

        {step === 'fill' && tpl && (
          <>
            <h2 className="text-h2 mb-1">{tpl.name}</h2>
            <p className="text-meta mb-4" style={{ color: 'var(--text-muted)' }}>
              Dəyişənləri doldurun — boş qalsalar şablonda görünəcək.
            </p>

            <div className="space-y-3 mb-5">
              {varNames.map((v) => (
                <div key={v}>
                  <label className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                    {`{{${v}}}`}
                  </label>
                  <input
                    className="input w-full"
                    value={vars[v] ?? ''}
                    onChange={(e) => setVars((prev) => ({ ...prev, [v]: e.target.value }))}
                    placeholder={v}
                  />
                </div>
              ))}
            </div>

            {generate.error ? (
              <p className="text-meta mb-3" style={{ color: '#B91C1C' }}>
                {(generate.error as Error).message}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <button className="btn-outline" onClick={() => setStep('pick')}>Geri</button>
              <button
                className="btn-primary"
                disabled={generate.isPending}
                onClick={() => generate.mutate()}
              >
                {generate.isPending ? 'Hazırlanır…' : 'Faktura yarat'}
              </button>
            </div>
          </>
        )}

        {step === 'done' && result && (
          <>
            <h2 className="text-h2 mb-2">Faktura hazır</h2>
            <p className="text-body mb-1">
              <strong>Nömrə:</strong> {result.invoiceNumber}
            </p>
            <p className="text-meta mb-4" style={{ color: 'var(--text-muted)' }}>
              Sənəd layihənin Sənədlər tabında əlavə edildi.
            </p>

            <div
              className="rounded-card p-3 mb-4 flex items-center gap-2"
              style={{ background: 'var(--surface-raised)', border: '1px solid var(--line)' }}
            >
              <span className="flex-1 text-meta truncate" style={{ color: 'var(--text-muted)' }}>
                {shareUrl}
              </span>
              <button
                className="btn-outline"
                style={{ flexShrink: 0 }}
                onClick={() => navigator.clipboard.writeText(shareUrl)}
              >
                Kopyala
              </button>
            </div>

            <div className="flex justify-end">
              <button className="btn-primary" onClick={onClose}>Bağla</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
