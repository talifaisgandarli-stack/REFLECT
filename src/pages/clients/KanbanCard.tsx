// Kanban card for the Clients pipeline view.
// One card per client — contains expandable project list, all card states:
// default / hover (quick-actions) / overdue (red border) / portfolio (dimmed).
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Client, ClientPipelineStage, ProjectStatus } from '@/types/db';
import { PROJECT_STATUS_LABEL } from '@/lib/labels';
import { TierBadge } from '@/pages/clients/AccountsTable';
import { formatAZN, relativeTime } from '@/lib/format';

export type DragPayload = { id: string; from: ClientPipelineStage };

// No interaction for this many days = overdue
const OVERDUE_DAYS = 30;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function AvatarInitials({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 999,
        background: 'var(--brand-soft)',
        color: 'var(--brand-text)',
        fontSize: 10,
        fontWeight: 700,
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {initials || '?'}
    </span>
  );
}

function MiniProgressBar({ pct }: { pct: number }) {
  return (
    <div style={{ height: 3, background: 'var(--line-soft)', borderRadius: 2, overflow: 'hidden' }}>
      <div
        style={{
          height: '100%',
          width: `${Math.min(100, Math.max(0, pct))}%`,
          background: 'var(--brand-action)',
          borderRadius: 2,
        }}
      />
    </div>
  );
}

type ProjectRow = { id: string; name: string; status: ProjectStatus };

function KanbanProjectsList({ clientId }: { clientId: string }) {
  const q = useQuery({
    queryKey: ['kanban-projects', clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from('projects')
        .select('id, name, status')
        .eq('client_id', clientId)
        .is('archived_at', null)
        .order('created_at', { ascending: false });
      return (data ?? []) as ProjectRow[];
    },
  });

  if (q.isLoading) {
    return (
      <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 0' }}>Yüklənir…</div>
    );
  }
  if (!q.data || q.data.length === 0) {
    return (
      <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 0' }}>
        Aktiv layihə yoxdur
      </div>
    );
  }

  return (
    <ul style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 5 }}>
      {q.data.map((p) => {
        const dotColor =
          p.status === 'active'
            ? 'var(--success-deep, #16794a)'
            : p.status === 'on_hold'
              ? 'var(--warning, #c47d00)'
              : 'var(--text-muted)';
        return (
          <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: dotColor,
                flexShrink: 0,
              }}
            />
            <a
              href={`/layihelər/${p.id}`}
              style={{
                color: 'var(--text)',
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                textDecoration: 'none',
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseOver={(e) =>
                ((e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline')
              }
              onMouseOut={(e) =>
                ((e.currentTarget as HTMLAnchorElement).style.textDecoration = 'none')
              }
            >
              {p.name}
            </a>
            <span style={{ color: dotColor, whiteSpace: 'nowrap', flexShrink: 0 }}>
              {PROJECT_STATUS_LABEL[p.status] ?? p.status}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ClientKanbanCard({
  c,
  stats,
  isAdmin,
  onOpen,
  onDelete,
}: {
  c: Client;
  stats: Map<string, { total: number; active: number }> | undefined;
  isAdmin: boolean;
  onOpen: (c: Client) => void;
  onDelete?: (c: Client) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [projExpanded, setProjExpanded] = useState(false);

  const st = stats?.get(c.id);
  const total = st?.total ?? 0;
  const active = st?.active ?? 0;

  const sinceDays = daysSince(c.last_interaction_at);
  const isOverdue = sinceDays !== null && sinceDays > OVERDUE_DAYS;
  const isPortfolio = c.pipeline_stage === 'portfolio';

  const hasTier = c.tier !== 'none';
  const hasIndustry = !!c.industry;
  const hasValue = isAdmin && (c.expected_value ?? 0) > 0;

  return (
    <div
      draggable={isAdmin}
      onDragStart={(e) =>
        e.dataTransfer.setData(
          'text/plain',
          JSON.stringify({ id: c.id, from: c.pipeline_stage } satisfies DragPayload),
        )
      }
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        background: 'var(--surface)',
        borderRadius: 8,
        border: '1px solid var(--line-soft)',
        borderLeft: isOverdue
          ? '3px solid var(--error, #c83b3b)'
          : '1px solid var(--line-soft)',
        padding: '10px 12px',
        cursor: isAdmin ? 'grab' : 'default',
        opacity: isPortfolio ? 0.7 : 1,
        boxShadow: hovered ? '0 2px 10px rgba(14,22,17,0.10)' : 'none',
        transition: 'box-shadow 0.15s, opacity 0.15s',
      }}
    >
      {/* Drag handle — admin, hover only */}
      {isAdmin ? (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 10,
            left: -4,
            color: 'var(--text-muted)',
            fontSize: 16,
            lineHeight: 1,
            userSelect: 'none',
            opacity: hovered ? 0.5 : 0,
            transition: 'opacity 0.15s',
            cursor: 'grab',
          }}
        >
          ⠿
        </span>
      ) : null}

      {/* Quick actions — visible on hover */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          display: 'flex',
          gap: 3,
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.15s',
          pointerEvents: hovered ? 'auto' : 'none',
        }}
      >
        <button
          type="button"
          title="Düzəlt"
          aria-label={`Düzəlt: ${c.name}`}
          style={{
            background: 'var(--surface-mist)',
            border: 'none',
            borderRadius: 4,
            width: 22,
            height: 22,
            cursor: 'pointer',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--brand-text)',
          }}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(c);
          }}
        >
          ✎
        </button>
        {isAdmin && onDelete ? (
          <button
            type="button"
            title="Sil"
            aria-label={`Sil: ${c.name}`}
            style={{
              background: 'var(--surface-mist)',
              border: 'none',
              borderRadius: 4,
              width: 22,
              height: 22,
              cursor: 'pointer',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--error-deep)',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(c);
            }}
          >
            🗑
          </button>
        ) : null}
      </div>

      {/* Header: name + avatar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          paddingRight: hovered ? 52 : 4,
          transition: 'padding-right 0.15s',
          cursor: 'pointer',
        }}
        onClick={() => onOpen(c)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onOpen(c)}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 13,
              lineHeight: 1.35,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {c.name}
          </div>
          {c.company ? (
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                marginTop: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {c.company}
            </div>
          ) : null}
        </div>
        <AvatarInitials name={c.name} />
      </div>

      {/* Tag row: tier + industry */}
      {hasTier || hasIndustry ? (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
          {hasTier ? <TierBadge tier={c.tier} /> : null}
          {hasIndustry ? (
            <span
              className="chip"
              style={{
                fontSize: 10,
                background: 'var(--surface-mist)',
                color: 'var(--text-muted)',
                padding: '0 6px',
              }}
            >
              {c.industry}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Value + project counts */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 8,
          gap: 4,
          fontSize: 11,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {hasValue ? (
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>
            {formatAZN(c.expected_value)}
          </span>
        ) : (
          <span />
        )}
        {total > 0 ? (
          <span style={{ color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--success-deep, #16794a)', fontWeight: 600 }}>
              {active} aktiv
            </span>
            {' / '}
            {total} cəmi
          </span>
        ) : (
          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Layihə yoxdur</span>
        )}
      </div>

      {/* Confidence progress bar */}
      <div style={{ marginTop: 7 }}>
        <MiniProgressBar pct={c.confidence_pct} />
      </div>

      {/* Last contact / overdue alert */}
      <div style={{ marginTop: 5, fontSize: 11 }}>
        {isOverdue ? (
          <span style={{ color: 'var(--error, #c83b3b)', fontWeight: 500 }}>
            ⚠ {sinceDays} gündür əlaqə yoxdur!
          </span>
        ) : c.last_interaction_at ? (
          <span style={{ color: 'var(--text-muted)' }}>
            Son əlaqə: {relativeTime(c.last_interaction_at)}
          </span>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>Son əlaqə yoxdur</span>
        )}
      </div>

      {/* Portfolio badge */}
      {isPortfolio ? (
        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--success-deep, #16794a)', fontWeight: 500 }}>
          ✓ Portfolio müştərisi
        </div>
      ) : null}

      {/* Expandable projects list */}
      {total > 0 ? (
        <div style={{ marginTop: 8, borderTop: '1px solid var(--line-soft)', paddingTop: 6 }}>
          <button
            type="button"
            aria-expanded={projExpanded}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
            onClick={(e) => {
              e.stopPropagation();
              setProjExpanded((x) => !x);
            }}
          >
            <span>LAYİHƏLƏR ({total})</span>
            <span aria-hidden style={{ fontSize: 8 }}>
              {projExpanded ? '▲' : '▼'}
            </span>
          </button>
          {projExpanded ? <KanbanProjectsList clientId={c.id} /> : null}
        </div>
      ) : null}
    </div>
  );
}
