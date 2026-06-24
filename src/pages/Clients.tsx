/**
 * Müştərilər — CRM redesign (owner override 2026-06-24, migration 0075).
 *
 * Two surfaces on one admin-gated page:
 *   • Aktiv pipeline  — a 4-column kanban of PROJECTS (Pipeline.tsx)
 *   • Müştəri bazası  — a searchable card grid of all clients (ClientBase.tsx)
 *
 * Pipeline lives on the project; the client base never splits into stage
 * columns, so it stays clean. Both read usePipelineProjects() / useClientSummary().
 * See docs/clients-crm-spec-adapted.md §0 for the spec→build decisions.
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonList } from '@/components/Skeleton';
import { usePipelineProjects, useClientSummary } from '@/lib/hooks';
import { CLIENT_TIER_ORDER, CLIENT_TIER_DESC } from '@/lib/labels';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { isValidEmail, isValidPhone } from '@/lib/validation';
import type { ClientTier, Project } from '@/types/db';
import { Pipeline } from '@/pages/clients/Pipeline';
import { ClientBase } from '@/pages/clients/ClientBase';
import { ClientModal } from '@/pages/clients/ClientModal';
import { ProjectModal } from '@/pages/clients/ProjectModal';

type View = 'pipeline' | 'base';

export function ClientsPage() {
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'base' ? 'base' : 'pipeline';
  const setView = (v: View) => {
    const next = new URLSearchParams(params);
    next.set('view', v);
    setParams(next, { replace: true });
  };

  const projects = usePipelineProjects();
  const clients = useClientSummary();
  const [creating, setCreating] = useState(false);
  const [openClientId, setOpenClientId] = useState<string | null>(null);
  const [projectModal, setProjectModal] = useState<
    { mode: 'create' } | { mode: 'edit'; project: Project } | null
  >(null);

  const openClient = useMemo(
    () => clients.data?.find((c) => c.id === openClientId) ?? null,
    [clients.data, openClientId],
  );

  const loading = projects.isLoading || clients.isLoading;
  const totalValue = (clients.data ?? []).reduce((s, c) => s + (c.total_value ?? 0), 0);

  return (
    <>
      <PageHead
        meta={`${clients.data?.length ?? 0} müştəri · ${projects.data?.length ?? 0} layihə`}
        title="Müştərilər"
        actions={
          isAdmin ? (
            <>
              <button
                className="btn-outline"
                onClick={() => setProjectModal({ mode: 'create' })}
                disabled={(clients.data ?? []).length === 0}
                title={
                  (clients.data ?? []).length === 0
                    ? 'Əvvəlcə müştəri əlavə et'
                    : undefined
                }
              >
                + Yeni layihə
              </button>
              <button className="btn-primary" onClick={() => setCreating(true)}>
                + Yeni müştəri
              </button>
            </>
          ) : null
        }
      />

      {/* Surface toggle (§2 — two surfaces) */}
      <div className="flex gap-1 mb-3" role="tablist" aria-label="Görünüş">
        {(
          [
            ['pipeline', 'Aktiv pipeline'],
            ['base', 'Müştəri bazası'],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            className="chip"
            style={
              view === v
                ? { background: 'var(--brand-action)', color: 'var(--brand-text)' }
                : undefined
            }
            onClick={() => setView(v)}
          >
            {label}
          </button>
        ))}
        {isAdmin && totalValue > 0 ? (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
            Portfel dəyəri: {new Intl.NumberFormat('az-AZ', { style: 'currency', currency: 'AZN', maximumFractionDigits: 0 }).format(totalValue)}
          </span>
        ) : null}
      </div>

      {loading ? (
        <SkeletonList />
      ) : (projects.data ?? []).length === 0 && (clients.data ?? []).length === 0 ? (
        <EmptyState
          title="Hələ müştəri yoxdur"
          body="İlk müştərini əlavə et, sonra ona layihə yarat — layihə pipeline-da görünəcək."
          cta={
            isAdmin ? (
              <button className="btn-primary" onClick={() => setCreating(true)}>
                + Yeni müştəri
              </button>
            ) : undefined
          }
        />
      ) : view === 'pipeline' ? (
        <Pipeline
          projects={projects.data ?? []}
          onOpenClient={(id) => setOpenClientId(id)}
          onEditProject={(p) => setProjectModal({ mode: 'edit', project: p })}
        />
      ) : (
        <ClientBase
          clients={clients.data ?? []}
          projects={projects.data ?? []}
          onOpenClient={(id) => setOpenClientId(id)}
        />
      )}

      {openClient ? (
        <ClientModal client={openClient} onClose={() => setOpenClientId(null)} />
      ) : null}

      {creating ? <CreateClientModal onClose={() => setCreating(false)} /> : null}

      {projectModal ? (
        <ProjectModal
          mode={projectModal.mode}
          project={projectModal.mode === 'edit' ? projectModal.project : undefined}
          clients={clients.data ?? []}
          onClose={() => setProjectModal(null)}
        />
      ) : null}
    </>
  );
}

function CreateClientModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [tier, setTier] = useState<'' | ClientTier>('');

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Ad tələb olunur');
      if (email.trim() && !isValidEmail(email.trim())) throw new Error('Etibarsız email');
      if (phone.trim() && !isValidPhone(phone.trim())) throw new Error('Etibarsız telefon');
      const { error } = await supabase.from('clients').insert({
        name: name.trim(),
        company: company.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        tier: tier || null,
        // legacy pipeline columns kept for Finance/Dashboard compat (migration 0075).
        pipeline_stage: 'lead',
        confidence_pct: 10,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-summary'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      onClose();
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
        className="card w-full max-w-md"
        style={{ padding: 24 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <h2 className="text-h2 mb-4">Yeni müştəri</h2>
        <div className="space-y-3">
          <Field label="Ad *">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </Field>
          <Field label="Təşkilat">
            <input
              className="input"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Məs. Prezident İşlər İdarəsi"
            />
          </Field>
          <Field label="Email">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Telefon">
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Tier">
            <select className="input" value={tier} onChange={(e) => setTier(e.target.value as ClientTier | '')}>
              <option value="">Təyin edilməyib</option>
              {CLIENT_TIER_ORDER.map((t) => (
                <option key={t} value={t}>
                  {CLIENT_TIER_DESC[t]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {create.isError ? (
          <p style={{ color: 'var(--error)', fontSize: 12, marginTop: 8 }}>
            {(create.error as Error).message}
          </p>
        ) : null}
        <div className="flex gap-2 mt-5 justify-end">
          <button type="button" className="btn-outline" onClick={onClose}>
            Ləğv et
          </button>
          <button type="submit" className="btn-primary" disabled={create.isPending}>
            Yarat
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
        {label}
      </span>
      {children}
    </label>
  );
}
