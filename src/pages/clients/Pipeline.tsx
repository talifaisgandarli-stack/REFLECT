/**
 * Surface 1 — Active pipeline (CRM redesign §4). A 4-column kanban of PROJECTS
 * (not clients). Cards drag between stages (@dnd-kit); finishing İcrada work
 * sends a project to Portfolio, where it drops off the board and lands in the
 * client base. Portfolio/Udulan are terminal — never columns here.
 */
import { useMemo } from 'react';
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
import { ACTIVE_STAGES, type Project, type ProjectStage } from '@/types/db';
import { PROJECT_STAGE_LABEL } from '@/lib/labels';
import { formatAZN, formatAZNCompact, contactHealth } from '@/lib/format';
import {
  useUpdateProjectStage,
  useUpdateProjectField,
  type ProjectWithClient,
} from '@/lib/hooks';
import {
  ClientBadge,
  InlineNumber,
  ServiceBadge,
  TierBadge,
} from './crmShared';

export function Pipeline({
  projects,
  onOpenClient,
  onEditProject,
}: {
  projects: ProjectWithClient[];
  onOpenClient: (clientId: string) => void;
  onEditProject: (project: Project) => void;
}) {
  const updateStage = useUpdateProjectStage();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Only the 4 active stages render as columns (§4).
  const board = projects.filter((p) => ACTIVE_STAGES.includes(p.stage));
  const byStage = useMemo(() => {
    const m: Record<ProjectStage, ProjectWithClient[]> = {
      lead: [], teklif: [], muzakire: [], icrada: [], portfolio: [], udulan: [],
    };
    for (const p of board) m[p.stage].push(p);
    return m;
  }, [board]);

  function onDragEnd(e: DragEndEvent) {
    const id = String(e.active.id);
    const overStage = e.over?.id as ProjectStage | undefined;
    if (!overStage) return;
    const proj = projects.find((p) => p.id === id);
    if (!proj || proj.stage === overStage) return;
    updateStage.mutate({ id, stage: overStage });
  }

  return (
    <div>
      <SummaryBar projects={board} />
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${ACTIVE_STAGES.length}, minmax(240px, 1fr))`,
            gap: 12,
            alignItems: 'start',
            overflowX: 'auto',
          }}
        >
          {ACTIVE_STAGES.map((stage) => (
            <Column
              key={stage}
              stage={stage}
              items={byStage[stage]}
              onOpenClient={onOpenClient}
              onEditProject={onEditProject}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function SummaryBar({ projects }: { projects: ProjectWithClient[] }) {
  const totalValue = projects.reduce((s, p) => s + (p.value || 0), 0);
  const clients = new Set(projects.map((p) => p.client_id)).size;
  const overdue = projects.filter(
    (p) => contactHealth(p.clients?.last_interaction_at).level === 'red',
  ).length;

  const proportions = ACTIVE_STAGES.map((stage) => ({
    stage,
    count: projects.filter((p) => p.stage === stage).length,
  }));
  const total = projects.length || 1;

  return (
    <div className="flex flex-wrap items-center gap-3 mb-3">
      <Metric label="Aktiv layihə" value={String(projects.length)} />
      <Metric label="Müştəri" value={String(clients)} />
      <Metric label="Pipeline dəyəri" value={formatAZN(totalValue)} />
      <Metric label="Overdue" value={String(overdue)} danger={overdue > 0} />
      <div
        style={{
          display: 'flex',
          height: 6,
          flex: 1,
          minWidth: 120,
          borderRadius: 4,
          overflow: 'hidden',
          background: 'var(--surface-mist)',
        }}
        aria-hidden
      >
        {proportions.map(({ stage, count }) =>
          count ? (
            <span
              key={stage}
              title={`${PROJECT_STAGE_LABEL[stage]}: ${count}`}
              style={{
                width: `${(count / total) * 100}%`,
                background: `var(--stage-${stage}-fg)`,
              }}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div
      className="card"
      style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 1 }}
    >
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
      <span
        style={{
          fontSize: 16,
          fontWeight: 500,
          color: danger ? 'var(--error)' : 'var(--text)',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Column({
  stage,
  items,
  onOpenClient,
  onEditProject,
}: {
  stage: ProjectStage;
  items: ProjectWithClient[];
  onOpenClient: (clientId: string) => void;
  onEditProject: (project: Project) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const sum = items.reduce((s, p) => s + (p.value || 0), 0);

  return (
    <div
      ref={setNodeRef}
      style={{
        background: isOver ? 'var(--canvas-warm)' : 'transparent',
        borderRadius: 12,
        padding: 4,
        transition: 'background var(--dur-fast)',
        minHeight: 80,
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{ padding: '4px 8px 8px' }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: `var(--stage-${stage}-fg)` }}>
            {PROJECT_STAGE_LABEL[stage]}
          </span>
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              background: 'var(--surface-mist)',
              borderRadius: 10,
              padding: '0 6px',
            }}
          >
            {items.length}
          </span>
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {sum > 0 ? formatAZNCompact(sum) : ''}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((p) => (
          <ProjectCard
            key={p.id}
            project={p}
            onOpenClient={onOpenClient}
            onEditProject={onEditProject}
          />
        ))}
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  onOpenClient,
  onEditProject,
}: {
  project: ProjectWithClient;
  onOpenClient: (clientId: string) => void;
  onEditProject: (project: Project) => void;
}) {
  const updateField = useUpdateProjectField();
  const updateStage = useUpdateProjectStage();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: project.id,
  });

  const health = contactHealth(project.clients?.last_interaction_at);
  // Stale-contact applies to every active card (keeps the board's "Overdue"
  // count and the per-card alert in sync).
  const overdue = health.level !== 'none';
  // Hierarchy (owner request): company → project → orderer (client contact).
  const company = project.clients?.company?.trim();
  const orderer = project.clients?.name ?? '';

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    borderLeft:
      health.level === 'red'
        ? '2.5px solid var(--error)'
        : health.level === 'amber'
          ? '2.5px solid var(--warning)'
          : undefined,
    cursor: 'grab',
    padding: 10,
  };

  return (
    <div ref={setNodeRef} className="card" style={style} {...attributes} {...listeners}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* 1 — Company (primary) */}
        <div className="flex items-start justify-between" style={{ gap: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', minWidth: 0 }}>
            {company || orderer || 'Şirkət yoxdur'}
          </div>
          {/* Edit affordance — stopPropagation so it never starts a drag */}
          <button
            type="button"
            aria-label="Redaktə et"
            className="chip"
            style={{ height: 20, padding: '0 6px', fontSize: 11, flexShrink: 0 }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onEditProject(project);
            }}
          >
            ✎
          </button>
        </div>

        {/* 2 — Project name (secondary) */}
        <div style={{ fontSize: 13, color: 'var(--text-soft)' }}>{project.name}</div>
        {project.region ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{project.region}</div>
        ) : null}

        {/* 3 — Orderer (client contact) */}
        {project.clients ? (
          <ClientBadge
            id={project.clients.id}
            name={orderer}
            onClick={() => onOpenClient(project.clients!.id)}
          />
        ) : null}

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          <ServiceBadge type={project.service_type} />
          <TierBadge tier={project.clients?.tier ?? null} />
        </div>

        <div className="flex items-center justify-between" style={{ marginTop: 2 }}>
          <InlineNumber
            value={project.value}
            ariaLabel="Layihə dəyəri"
            format={(n) => formatAZN(n)}
            onSave={(v) => updateField.mutate({ id: project.id, patch: { value: v } })}
          />
          {project.stage === 'icrada' ? (
            <button
              type="button"
              className="chip"
              style={{ height: 22, fontSize: 11 }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                updateStage.mutate({ id: project.id, stage: 'portfolio' });
              }}
            >
              ✓ Tamamlandı
            </button>
          ) : null}
        </div>

        {project.stage === 'icrada' ? (
          <div
            aria-hidden
            style={{ height: 3, borderRadius: 2, background: 'var(--surface-mist)' }}
          >
            <span
              style={{
                display: 'block',
                height: '100%',
                width: `${project.progress}%`,
                borderRadius: 2,
                background: 'var(--stage-icrada-fg)',
              }}
            />
          </div>
        ) : null}

        {overdue ? (
          <div style={{ fontSize: 11, color: health.level === 'red' ? 'var(--error)' : 'var(--warning)' }}>
            {health.days == null
              ? 'Əlaqə qeydə alınmayıb'
              : `${health.days} gündür əlaqə yoxdur!`}
          </div>
        ) : null}
      </div>
    </div>
  );
}
