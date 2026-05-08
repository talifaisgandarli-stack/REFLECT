import { useState } from 'react';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useClients } from '@/lib/hooks';
import { CLIENT_STAGE_LABEL, CLIENT_STAGE_CONFIDENCE } from '@/lib/labels';
import type { Client, ClientPipelineStage } from '@/types/db';
import { formatAZN, relativeTime } from '@/lib/format';
import { ClientModal } from '@/components/ClientModal';
import { InteractionLogPanel } from '@/components/InteractionLogPanel';
import { useCreateSurvey } from '@/lib/crm';

const STAGES: ClientPipelineStage[] = [
  'lead', 'proposal', 'negotiation', 'signed', 'in_progress', 'portfolio', 'lost', 'archived',
];

export function ClientsPage() {
  const { data: clients = [], isLoading } = useClients();
  const [active, setActive] = useState<Client | null>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const createSurvey = useCreateSurvey();
  const [surveyLink, setSurveyLink] = useState<string | null>(null);

  async function onSendSurvey(client: Client) {
    setSurveyLink(null);
    const row = await createSurvey.mutateAsync({ client_id: client.id });
    setSurveyLink(`${window.location.origin}/survey/${row.share_token}`);
  }
  const grouped: Record<ClientPipelineStage, Client[]> = STAGES.reduce(
    (acc, s) => ({ ...acc, [s]: [] }),
    {} as Record<ClientPipelineStage, Client[]>,
  );
  for (const c of clients) grouped[c.pipeline_stage].push(c);

  const totalValue = STAGES.reduce((sum, s) => {
    const stageVal = grouped[s].reduce((sub, c) => sub + (c.expected_value ?? 0) * (CLIENT_STAGE_CONFIDENCE[s] / 100), 0);
    return sum + stageVal;
  }, 0);

  return (
    <>
      <PageHead
        meta={`${clients.length} müştəri · pipeline ${formatAZN(totalValue)}`}
        title="Müştərilər"
        actions={
          <>
            <input className="input max-w-[240px]" placeholder="Axtar…" />
            <button className="btn-primary" onClick={() => setOpenCreate(true)}>+ Yeni müştəri</button>
          </>
        }
      />

      {isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : clients.length === 0 ? (
        <EmptyState
          title="Müştəri yoxdur"
          body="İlk müştərini əlavə et — Lead → Müzakirə → İmzalanıb axını avtomatlaşdırılmışdır."
          cta={<button className="btn-primary">+ Yeni müştəri</button>}
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {STAGES.slice(0, 6).map((s) => (
            <div key={s} className="rounded-card p-3" style={{ border: '1px dashed var(--line)' }}>
              <h3 className="text-tiny uppercase mb-3 tracking-wider" style={{ color: 'var(--text-muted)' }}>
                {CLIENT_STAGE_LABEL[s]} · {grouped[s].length}
              </h3>
              <div className="space-y-2">
                {grouped[s].map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActive(c)}
                    className="card text-left w-full"
                    style={{ padding: 12 }}
                  >
                    <div className="font-medium text-body">{c.name}</div>
                    <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                      {c.company ?? '—'} · {formatAZN(c.expected_value)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {active ? (
        <div
          className="fixed inset-0 z-40 flex justify-end"
          style={{ background: 'rgba(14,22,17,0.4)' }}
          onClick={() => setActive(null)}
        >
          <aside
            className="w-[480px] h-full bg-surface p-6 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-h2">{active.name}</h2>
            <div className="text-meta mb-4" style={{ color: 'var(--text-muted)' }}>
              {active.company ?? '—'}
            </div>
            <dl className="text-body space-y-2 mb-4">
              <div className="flex justify-between"><dt>Mərhələ</dt><dd>{CLIENT_STAGE_LABEL[active.pipeline_stage]}</dd></div>
              <div className="flex justify-between"><dt>Etibar %</dt><dd>{active.confidence_pct}%</dd></div>
              <div className="flex justify-between"><dt>Dəyər</dt><dd>{formatAZN(active.expected_value)}</dd></div>
              <div className="flex justify-between"><dt>Email</dt><dd>{active.email ?? '—'}</dd></div>
              <div className="flex justify-between"><dt>Telefon</dt><dd>{active.phone ?? '—'}</dd></div>
              <div className="flex justify-between"><dt>Son əlaqə</dt><dd>{relativeTime(active.last_interaction_at)}</dd></div>
            </dl>
            <div className="flex flex-wrap gap-2 mb-5">
              <button
                type="button"
                className="btn-outline"
                onClick={() => onSendSurvey(active)}
                disabled={createSurvey.isPending}
              >
                {createSurvey.isPending ? 'Yaradılır…' : 'Retro sorğusu göndər'}
              </button>
              <button className="btn-ghost" onClick={() => setActive(null)}>Bağla</button>
            </div>

            {surveyLink ? (
              <div
                className="card mb-5 text-meta"
                style={{ padding: 12, background: 'var(--surface-mist)', border: '1px solid var(--line-soft)' }}
              >
                Sorğu linki yaradıldı:
                <input
                  readOnly
                  value={surveyLink}
                  className="input mt-2"
                  onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
                />
                <p className="mt-2" style={{ color: 'var(--text-muted)' }}>
                  Linki müştəriyə email/WhatsApp ilə göndər. Anonim doldurula bilər.
                </p>
              </div>
            ) : null}

            <InteractionLogPanel clientId={active.id} />
          </aside>
        </div>
      ) : null}

      {openCreate ? <ClientModal onClose={() => setOpenCreate(false)} /> : null}
    </>
  );
}
