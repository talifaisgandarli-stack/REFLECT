/**
 * Şablon Mərkəzi (PRD §10.2) — CRUD over `templates` with a live preview
 * panel that renders the body through the registry resolver. Variable
 * tokens flagged inline so authors see what's known/unknown before save.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import {
  TEMPLATE_CATEGORIES,
  VARIABLE_REGISTRY,
  type VariableKey,
  extractVariables,
  renderTemplate,
} from '@/lib/templates';
import { downloadCsv, printSection } from '@/lib/export';
import { buildRtf, downloadRtf } from '@/lib/rtf';
import { useT } from '@/lib/i18n';

type TemplateRow = {
  id: string;
  category: string;
  name: string;
  body: string | null;
  variables: Record<string, unknown>;
  mime_type: string | null;
  created_at: string;
};

const SAMPLE_BODY = `Hörmətli {{client_name}},

{{project_name}} layihəsi üzrə {{invoice_number}} nömrəli faktura
{{invoice_amount}} məbləğində {{invoice_date}} tarixində təqdim olundu.

Hörmətlə,
{{user_name}}
{{firm_name}}`;

export function TemplatesManager() {
  const t = useT();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['templates'],
    queryFn: async (): Promise<TemplateRow[]> => {
      const { data, error } = await supabase
        .from('templates')
        .select('id, category, name, body, variables, mime_type, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TemplateRow[];
    },
  });

  const selected =
    selectedId === 'new'
      ? null
      : (list.data ?? []).find((t) => t.id === selectedId) ?? null;

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('templates')
        .insert({
          name: t('templates.new_default_name'),
          category: TEMPLATE_CATEGORIES[0],
          body: SAMPLE_BODY,
          variables: { sample: true },
          created_by: profile?.id ?? null,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      setSelectedId(row.id);
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      setSelectedId(null);
    },
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-5">
      <aside>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-h3">{t('templates.aside.title')}</h3>
          <span className="flex gap-1">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                const rows = (list.data ?? []).map((row) => [
                  row.name,
                  row.category,
                  (row.body ?? '').replace(/\s+/g, ' ').slice(0, 200),
                ]);
                downloadCsv(
                  t('templates.export.csv_filename'),
                  [
                    t('templates.export.col.name'),
                    t('templates.export.col.category'),
                    t('templates.export.col.body'),
                  ],
                  rows,
                );
              }}
              style={{ height: 32, padding: '0 10px' }}
              title={t('templates.csv.title')}
            >
              CSV
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => create.mutate()}
              disabled={create.isPending}
              style={{ height: 32, padding: '0 12px' }}
            >
              +
            </button>
          </span>
        </div>
        {list.isLoading ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            {t('common.loading')}
          </p>
        ) : (list.data ?? []).length === 0 ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            {t('templates.empty')}
          </p>
        ) : (
          <ul className="space-y-1">
            {(list.data ?? []).map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 rounded-btn"
                  style={{
                    background: selectedId === row.id ? 'var(--surface-mist)' : 'transparent',
                    border: '1px solid var(--line-soft)',
                  }}
                  onClick={() => setSelectedId(row.id)}
                >
                  <div className="text-body font-medium truncate">{row.name}</div>
                  <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                    {row.category}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section>
        {selected ? (
          <TemplateEditor
            template={selected}
            onDelete={() => remove.mutate(selected.id)}
            deleting={remove.isPending}
          />
        ) : (
          <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
            {t('templates.placeholder_intro')}
          </div>
        )}
        <RegistryHelp />
      </section>
    </div>
  );
}

function TemplateEditor({
  template,
  onDelete,
  deleting,
}: {
  template: TemplateRow;
  onDelete: () => void;
  deleting: boolean;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [name, setName] = useState(template.name);
  const [category, setCategory] = useState(template.category);
  const [body, setBody] = useState(template.body ?? '');

  const usedVars = useMemo(() => extractVariables(body), [body]);
  const unknown = usedVars.filter((k) => !(k in VARIABLE_REGISTRY));
  const sampleCtx = useMemo(
    () => ({
      firmName: 'Reflect',
      client: { name: 'Aksent Group', company: 'Aksent LLC', email: 'info@aksent.az' },
      project: { name: 'Yasamal Tower', deadline: '2026-12-15' },
      invoice: { number: 'INV-2026-001', amount: 15000, date: new Date().toISOString() },
      user: { full_name: 'Talifa İsgəndərli', email: 't@reflect.studio' },
    }),
    [],
  );

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('templates')
        .update({
          name: name.trim() || t('templates.untitled'),
          category,
          body,
          variables: { detected: usedVars },
        })
        .eq('id', template.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });

  return (
    <div className="card space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-[1fr,200px] gap-3">
        <label className="block">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
            {t('templates.editor.name')}
          </span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
            {t('templates.editor.category')}
          </span>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {TEMPLATE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
            {t('templates.editor.body')}
          </span>
          <textarea
            className="input font-mono"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            style={{ minHeight: 280, padding: '12px 14px', whiteSpace: 'pre-wrap' }}
          />
        </label>
        <div>
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
            {t('templates.editor.preview')}
          </span>
          <div
            data-print-root
            className="rounded-btn p-3 text-body"
            style={{
              background: 'var(--surface-mist)',
              border: '1px solid var(--line)',
              minHeight: 280,
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
            }}
          >
            {renderTemplate(body, sampleCtx)}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
          {t('templates.editor.used_vars')}
        </span>
        {usedVars.length === 0 ? (
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            {t('templates.editor.no_vars')}
          </span>
        ) : (
          usedVars.map((v) => {
            const known = v in VARIABLE_REGISTRY;
            return (
              <span
                key={v}
                className="chip"
                style={{
                  background: known ? 'var(--brand-mist)' : 'var(--state-error-soft)',
                  color: known ? 'var(--brand-text)' : 'var(--state-error)',
                }}
                title={
                  known
                    ? VARIABLE_REGISTRY[v as VariableKey].label
                    : t('templates.editor.unknown_tooltip')
                }
              >
                {`{{${v}}}`}
              </span>
            );
          })
        )}
      </div>
      {unknown.length > 0 ? (
        <p className="text-meta" style={{ color: 'var(--state-error)' }}>
          {t(
            unknown.length > 1
              ? 'templates.editor.unknown_var_many'
              : 'templates.editor.unknown_var_one',
            { names: unknown.join(', ') },
          )}
        </p>
      ) : null}

      <div className="flex justify-between items-center gap-2 flex-wrap">
        <button
          type="button"
          className="btn-ghost"
          onClick={onDelete}
          disabled={deleting}
          style={{ color: 'var(--state-error)' }}
        >
          {t('templates.editor.delete')}
        </button>
        <span className="flex gap-2 flex-wrap">
          <button
            type="button"
            className="btn-outline"
            onClick={() => {
              const rtf = buildRtf({
                title: name.trim() || t('templates.export.rtf_title'),
                body: renderTemplate(body, sampleCtx),
                firmName: 'Reflect',
              });
              downloadRtf(`reflect-${(name || 'sablon').replace(/\s+/g, '_')}`, rtf);
            }}
            title={t('templates.editor.export_word_tooltip')}
          >
            {t('templates.editor.export_word')}
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={() => printSection()}
            title={t('templates.editor.export_pdf_tooltip')}
          >
            {t('templates.editor.export_pdf')}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => save.mutate()}
            disabled={save.isPending}
          >
            {save.isPending ? t('templates.editor.saving') : t('templates.editor.save')}
          </button>
        </span>
      </div>
      {save.error ? (
        <p className="text-meta" style={{ color: 'var(--state-error)' }}>
          {(save.error as Error).message}
        </p>
      ) : null}
    </div>
  );
}

function RegistryHelp() {
  const t = useT();
  const entries = Object.entries(VARIABLE_REGISTRY) as Array<
    [VariableKey, (typeof VARIABLE_REGISTRY)[VariableKey]]
  >;
  const headers = [
    t('templates.registry.col.token'),
    t('templates.registry.col.label'),
    t('templates.registry.col.example'),
  ];
  return (
    <details className="card mt-4" open>
      <summary className="text-h4 cursor-pointer">{t('templates.registry.title')}</summary>
      <table className="w-full text-body mt-3">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--line)' }}>
            {headers.map((h) => (
              <th
                key={h}
                className="text-meta text-left py-2 px-3"
                style={{
                  color: 'var(--text-muted)',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map(([k, v]) => (
            <tr key={k} style={{ borderBottom: '1px solid var(--line-soft)' }}>
              <td className="py-2 px-3">
                <code style={{ background: 'var(--surface-mist)', padding: '2px 6px', borderRadius: 4 }}>
                  {`{{${k}}}`}
                </code>
              </td>
              <td className="py-2 px-3">{v.label}</td>
              <td className="py-2 px-3 text-meta" style={{ color: 'var(--text-muted)' }}>
                {v.example}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
