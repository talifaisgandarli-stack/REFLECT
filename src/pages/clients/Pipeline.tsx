/**
 * Surface 1 — Aktiv pipeline (PRD Module 6, client-based). A 4-column kanban of
 * CLIENTS that drag between sales stages (lead → təklif → müzakirə → icrada).
 * Stage lives on the client (`pipeline_stage`); architectural projects are a
 * SEPARATE module and never appear here. `signed` folds into the İcrada column;
 * portfolio/lost/archived are terminal (off-board).
 */
import { useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Client, ClientPipelineStage } from '@/types/db';
import { CLIENT_STAGE_LABEL, PIPELINE_COLUMNS, clientStageStyle, clientValueLabel } from '@/lib/labels';
import { formatAZN, formatAZNCompact, contactHealth } from '@/lib/format';
import { useUpdateClientStage, useUpdateClientField } from '@/lib/hooks';
import { useAuth } from '@/lib/store';
import { ClientBadge, InlineNumber, TierBadge } from './crmShared';

// signed clients render inside the İcrada column (display fold, PRD §441 override)
function columnOf(stage: ClientPipelineStage): ClientPipelineStage | null {
  if (stage === 'signed') return 'in_progress';
  return PIPELINE_COLUMNS.includes(stage) ? stage : null;
}

export function Pipeline({
  clients,
  onOpenClient,
  onAddClient,
  onEditClient,
}: {
  clients: Client[];
  onOpenClient: (clientId: string) => void;
  onAddClient: (stage: ClientPipelineStage) => void;
  onEditClient: (client: Client) => void;
}) {
  const updateStage = useUpdateClientStage();
  // Moving a card to "Ləğv edilib" requires a reason (REQ-CRM-01), so a drop
  // there opens a small prompt instead of mutating immediately.
  const [lostFor, setLostFor] = useState<Client | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const byCol = useMemo(() => {
    const m: Record<string, Client[]> = Object.fromEntries(PIPELINE_COLUMNS.map((s) => [s, [] as Client[]]));
    for (const c of clients) {
      const col = columnOf(c.pipeline_stage);
      if (col) m[col].push(c);
    }
    return m;
  }, [clients]);

  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const to = e.over?.id as ClientPipelineStage | undefined;
    if (!to) return;
    const c = clients.find((x) => x.id === id);
    if (!c || c.pipeline_stage === to) return;
    if (to === 'lost') {
      setLostFor(c);
      return;
    }
    updateStage.mutate({ id, to });
  }

  // Summary metrics describe the ACTIVE pipeline — lost/cancelled deals stay on
  // the board (their own column) but must not inflate pipeline value or counts.
  const activeOnBoard = clients.filter(
    (c) => columnOf(c.pipeline_stage) !== null && c.pipeline_stage !== 'lost',
  );

  return (
    <div>
      <SummaryBar clients={activeOnBoard} />
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${PIPELINE_COLUMNS.length}, minmax(240px, 1fr))`,
            gap: 12,
            alignItems: 'start',
            overflowX: 'auto',
          }}
        >
          {PIPELINE_COLUMNS.map((stage) => (
            <Column
              key={stage}
              stage={stage}
              items={byCol[stage]}
              onOpenClient={onOpenClient}
              onAddClient={onAddClient}
              onEditClient={onEditClient}
            />
          ))}
        </div>
      </DndContext>
      {lostFor ? (
        <LostReasonModal
          client={lostFor}
          pending={updateStage.isPending}
          onCancel={() => setLostFor(null)}
          onConfirm={(reason) =>
            updateStage.mutate(
              { id: lostFor.id, to: 'lost', lostReason: reason },
              { onSuccess: () => setLostFor(null) },
            )
          }
        />
      ) : null}
    </div>
  );
}

function LostReasonModal({
  client,
  pending,
  onCancel,
  onConfirm,
}: {
  client: Client;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const label = client.company?.trim() || client.name;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(14,22,17,0.4)' }} onClick={onCancel}>
      <form
        className="card w-full max-w-sm"
        style={{ padding: 24 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (reason.trim()) onConfirm(reason.trim()); }}
      >
        <h2 className="text-h2 mb-1">Ləğv edilib</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
          <strong>{label}</strong> nə üçün itirildi?
        </p>
        <input
          className="input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Məs. qiymət, vaxt, rəqib seçildi…"
          autoFocus
        />
        <div className="flex gap-2 mt-4 justify-end">
          <button type="button" className="btn-outline" onClick={onCancel}>Ləğv et</button>
          <button type="submit" className="btn-primary" disabled={!reason.trim() || pending}>
            {pending ? 'Saxlanır…' : 'Təsdiqlə'}
          </button>
        </div>
      </form>
    </div>
  );
}

function pipelineValue(clients: Client[]): number {
  // Raw sum of expected deal value — matches the per-column header sums and the
  // card figures (intuitive). (PRD REQ-CRM-02's confidence-weighted variant was
  // dropped from this metric as it confusingly differed from the column totals.)
  return clients.reduce((s, c) => s + (c.expected_value ?? 0), 0);
}

function SummaryBar({ clients }: { clients: Client[] }) {
  const overdue = clients.filter(
    (c) => contactHealth(c.last_interaction_at ?? c.created_at).level === 'red',
  ).length;
  const total = clients.length || 1;
  return (
    <div className="flex flex-wrap items-center gap-3 mb-3">
      <Metric label="Aktiv müştəri" value={String(clients.length)} />
      <Metric label="Pipeline dəyəri" value={formatAZN(Math.round(pipelineValue(clients)))} />
      <Metric label="Overdue" value={String(overdue)} danger={overdue > 0} />
      <div
        style={{ display: 'flex', height: 6, flex: 1, minWidth: 120, borderRadius: 4, overflow: 'hidden', background: 'var(--surface-mist)' }}
        aria-hidden
      >
        {PIPELINE_COLUMNS.map((stage) => {
          const count = clients.filter((c) => columnOf(c.pipeline_stage) === stage).length;
          return count ? (
            <span
              key={stage}
              title={`${CLIENT_STAGE_LABEL[stage]}: ${count}`}
              style={{ width: `${(count / total) * 100}%`, background: clientStageStyle(stage).color }}
            />
          ) : null;
        })}
      </div>
    </div>
  );
}

function Metric({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="card" style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 500, color: danger ? 'var(--error)' : 'var(--text)' }}>{value}</span>
    </div>
  );
}

function Column({
  stage,
  items,
  onOpenClient,
  onAddClient,
  onEditClient,
}: {
  stage: ClientPipelineStage;
  items: Client[];
  onOpenClient: (clientId: string) => void;
  onAddClient: (stage: ClientPipelineStage) => void;
  onEditClient: (client: Client) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const sum = items.reduce((s, c) => s + (c.expected_value ?? 0), 0);

  return (
    <div
      ref={setNodeRef}
      style={{ background: isOver ? 'var(--canvas-warm)' : 'transparent', borderRadius: 12, padding: 4, transition: 'background var(--dur-fast)', minHeight: 80 }}
    >
      <div className="flex items-center justify-between" style={{ padding: '4px 8px 8px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: clientStageStyle(stage).color }}>
            {CLIENT_STAGE_LABEL[stage]}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-mist)', borderRadius: 10, padding: '0 6px' }}>
            {items.length}
          </span>
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sum > 0 ? formatAZNCompact(sum) : ''}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((c) => (
          <ClientCard key={c.id} client={c} onOpenClient={onOpenClient} onEditClient={onEditClient} />
        ))}
        <button
          type="button"
          onClick={() => onAddClient(stage)}
          style={{
            border: '1px dashed var(--line)',
            borderRadius: 12,
            padding: '8px 10px',
            fontSize: 12,
            color: 'var(--text-muted)',
            background: 'none',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          + Müştəri
        </button>
      </div>
    </div>
  );
}

function ClientCard({
  client,
  onOpenClient,
  onEditClient,
}: {
  client: Client;
  onOpenClient: (id: string) => void;
  onEditClient: (client: Client) => void;
}) {
  const { isAdmin } = useAuth();
  const updateStage = useUpdateClientStage();
  const updateField = useUpdateClientField();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: client.id });

  const health = contactHealth(client.last_interaction_at ?? client.created_at);
  const overdue = health.level !== 'none';
  const neverContacted = client.last_interaction_at == null;
  const company = client.company?.trim();

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    borderLeft:
      health.level === 'red' ? '2.5px solid var(--error)' : health.level === 'amber' ? '2.5px solid var(--warning)' : undefined,
    cursor: 'grab',
    padding: 10,
  };

  return (
    <div ref={setNodeRef} className="card" style={style} {...attributes} {...listeners}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Hierarchy: company → orderer (contact) */}
        <div className="flex items-start justify-between" style={{ gap: 6 }}>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onOpenClient(client.id); }}
            style={{ textAlign: 'left', background: 'none', border: 0, padding: 0, cursor: 'pointer', fontSize: 14, fontWeight: 500, color: 'var(--text)', minWidth: 0 }}
          >
            {company || client.name}
          </button>
          <button
            type="button"
            aria-label="Redaktə et"
            className="chip"
            style={{ height: 20, padding: '0 6px', fontSize: 11, flexShrink: 0 }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onEditClient(client); }}
          >
            ✎
          </button>
        </div>
        <ClientBadge id={client.id} name={client.name} onClick={() => onOpenClient(client.id)} />

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          <TierBadge tier={client.tier} />
          {client.industry ? (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-mist)', borderRadius: 6, padding: '0 6px', height: 20, display: 'inline-flex', alignItems: 'center' }}>
              {client.industry}
            </span>
          ) : null}
        </div>

        <div className="flex items-center justify-between" style={{ marginTop: 2 }}>
          {isAdmin ? (
            <InlineNumber
              value={client.expected_value}
              ariaLabel={clientValueLabel(client.pipeline_stage)}
              format={(n) => formatAZN(n)}
              onSave={(v) => updateField.mutate({ id: client.id, patch: { expected_value: v } })}
            />
          ) : (
            <span style={{ fontSize: 13, fontWeight: 500 }}>{formatAZN(client.expected_value)}</span>
          )}
          {client.pipeline_stage === 'in_progress' || client.pipeline_stage === 'signed' ? (
            <button
              type="button"
              className="chip"
              style={{ height: 22, fontSize: 11 }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); updateStage.mutate({ id: client.id, to: 'portfolio' }); }}
            >
              ✓ Tamamlandı
            </button>
          ) : client.pipeline_stage === 'lost' ? (
            <button
              type="button"
              className="chip"
              style={{ height: 22, fontSize: 11 }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); updateStage.mutate({ id: client.id, to: 'negotiation' }); }}
            >
              ↩ Bərpa et
            </button>
          ) : null}
        </div>

        {overdue ? (
          <div style={{ fontSize: 11, color: health.level === 'red' ? 'var(--error)' : 'var(--warning)' }}>
            {neverContacted
              ? `${health.days} gündür əlaqə qeydə alınmayıb`
              : `${health.days} gündür əlaqə yoxdur!`}
          </div>
        ) : null}
      </div>
    </div>
  );
}
