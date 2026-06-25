/**
 * Müştərilər — CRM (PRD Module 6, redesigned visuals; client-based 2026-06-24).
 *
 * Two surfaces on one admin-gated page:
 *   • Aktiv pipeline  — a 4-column kanban of CLIENTS by sales stage (Pipeline.tsx)
 *   • Müştəri bazası  — a searchable card grid of all clients (ClientBase.tsx)
 *
 * Clients and architectural projects are SEPARATE: this page never creates or
 * boards projects — that belongs to the Layihələr module (PRD Module 3).
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonList } from '@/components/Skeleton';
import { useClients, useClientProjectStats, useProjectsByClient, useReceivablesByClient } from '@/lib/hooks';
import { formatAZN } from '@/lib/format';
import { useAuth } from '@/lib/store';
import type { Client, ClientPipelineStage } from '@/types/db';
import { Pipeline } from '@/pages/clients/Pipeline';
import { ClientBase } from '@/pages/clients/ClientBase';
import { ClientAnalytics } from '@/pages/clients/ClientAnalytics';
import { ClientModal } from '@/pages/clients/ClientModal';
import { ClientFormModal } from '@/pages/clients/ClientFormModal';

type View = 'pipeline' | 'base' | 'analytics';
type FormState =
  | { mode: 'create'; stage?: ClientPipelineStage }
  | { mode: 'edit'; client: Client }
  | null;

export function ClientsPage() {
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const viewParam = params.get('view');
  const view: View = viewParam === 'base' ? 'base' : viewParam === 'analytics' ? 'analytics' : 'pipeline';
  const setView = (v: View) => {
    const next = new URLSearchParams(params);
    next.set('view', v);
    setParams(next, { replace: true });
  };

  const clients = useClients();
  const statsQuery = useClientProjectStats();
  const projectsQuery = useProjectsByClient();
  const receivablesQuery = useReceivablesByClient();
  const [form, setForm] = useState<FormState>(null);
  const [openClientId, setOpenClientId] = useState<string | null>(null);

  const stats = statsQuery.data ?? new Map<string, { total: number; active: number }>();
  const projectsByClient = projectsQuery.data ?? new Map();
  const receivablesByClient = receivablesQuery.data ?? new Map();
  const openClient = useMemo(
    () => clients.data?.find((c) => c.id === openClientId) ?? null,
    [clients.data, openClientId],
  );

  const loading = clients.isLoading;
  const totalExpected = (clients.data ?? []).reduce((s, c) => s + (c.expected_value ?? 0), 0);

  return (
    <>
      <PageHead
        meta={`${clients.data?.length ?? 0} müştəri`}
        title="Müştərilər"
        actions={
          isAdmin ? (
            <button className="btn-primary" onClick={() => setForm({ mode: 'create' })}>
              + Yeni müştəri
            </button>
          ) : null
        }
      />

      <div className="flex gap-1 mb-3" role="tablist" aria-label="Görünüş">
        {([['pipeline', 'Aktiv pipeline'], ['base', 'Müştəri bazası'], ['analytics', 'Analitika']] as const).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            className="chip"
            style={view === v ? { background: 'var(--brand-action)', color: 'var(--brand-text)' } : undefined}
            onClick={() => setView(v)}
          >
            {label}
          </button>
        ))}
        {isAdmin && totalExpected > 0 ? (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
            Gözlənilən cəmi: {formatAZN(totalExpected)}
          </span>
        ) : null}
      </div>

      {loading ? (
        <SkeletonList />
      ) : (clients.data ?? []).length === 0 ? (
        <EmptyState
          title="Hələ müştəri yoxdur"
          body="İlk müştərini əlavə et — pipeline-da mərhələ üzrə görünəcək."
          cta={
            isAdmin ? (
              <button className="btn-primary" onClick={() => setForm({ mode: 'create' })}>
                + Yeni müştəri
              </button>
            ) : undefined
          }
        />
      ) : view === 'pipeline' ? (
        <Pipeline
          clients={clients.data ?? []}
          onOpenClient={(id) => setOpenClientId(id)}
          onAddClient={(stage) => setForm({ mode: 'create', stage })}
          onEditClient={(c) => setForm({ mode: 'edit', client: c })}
        />
      ) : view === 'base' ? (
        <ClientBase
          clients={clients.data ?? []}
          stats={stats}
          projectsByClient={projectsByClient}
          receivablesByClient={receivablesByClient}
          onOpenClient={(id) => setOpenClientId(id)}
          onEditClient={(c) => setForm({ mode: 'edit', client: c })}
        />
      ) : (
        <ClientAnalytics clients={clients.data ?? []} projectsByClient={projectsByClient} />
      )}

      {openClient ? (
        <ClientModal client={openClient} stat={stats.get(openClient.id)} onClose={() => setOpenClientId(null)} />
      ) : null}

      {form ? (
        <ClientFormModal
          mode={form.mode}
          client={form.mode === 'edit' ? form.client : undefined}
          defaultStage={form.mode === 'create' ? form.stage : undefined}
          onClose={() => setForm(null)}
        />
      ) : null}
    </>
  );
}
