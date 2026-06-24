/**
 * Shared CRM-redesign primitives (migration 0075): stage / tier / service
 * badges, the deterministic client badge, and the inline field editor used on
 * pipeline cards. Colours come from the CRM token scale (tokens.css) — no raw
 * hex scattered in components.
 */
import { useEffect, useRef, useState } from 'react';
import type { ClientTier, ProjectStage, ServiceType } from '@/types/db';
import {
  CLIENT_TIER_STYLE,
  PROJECT_STAGE_LABEL,
  PROJECT_STAGE_STYLE,
  SERVICE_TYPE_LABEL,
  SERVICE_TYPE_STYLE,
} from '@/lib/labels';

const pillBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  height: 20,
  padding: '0 8px',
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 500,
  whiteSpace: 'nowrap',
};

export function StageBadge({ stage }: { stage: ProjectStage }) {
  const s = PROJECT_STAGE_STYLE[stage];
  return (
    <span style={{ ...pillBase, color: s.color, background: s.bg }}>
      {PROJECT_STAGE_LABEL[stage]}
    </span>
  );
}

export function StageDot({ stage }: { stage: ProjectStage }) {
  return (
    <span
      aria-hidden
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: PROJECT_STAGE_STYLE[stage].color,
        flexShrink: 0,
      }}
    />
  );
}

export function TierBadge({ tier }: { tier: ClientTier | null }) {
  if (!tier) return null;
  const s = CLIENT_TIER_STYLE[tier];
  return <span style={{ ...pillBase, color: s.color, background: s.bg }}>Tier {tier}</span>;
}

export function ServiceBadge({ type }: { type: ServiceType | null }) {
  if (!type) return null;
  const s = SERVICE_TYPE_STYLE[type];
  return (
    <span style={{ ...pillBase, color: s.color, background: s.bg }}>
      {SERVICE_TYPE_LABEL[type]}
    </span>
  );
}

// Deterministic per-client colour so all of one client's project cards share
// the same badge tint (CRM redesign §4 — "user quickly sees which card is whose").
const CLIENT_PALETTE = [
  '#534AB7', '#185FA5', '#854F0B', '#3B6D11',
  '#0F6E56', '#993C1D', '#7C3AED', '#B91C1C',
];
export function clientColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CLIENT_PALETTE[h % CLIENT_PALETTE.length];
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/** Small coloured circle + name — identifies the client a project card belongs to. */
export function ClientBadge({
  id,
  name,
  onClick,
}: {
  id: string;
  name: string;
  onClick?: () => void;
}) {
  const color = clientColor(id);
  const body = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
      <span
        aria-hidden
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: color,
          color: '#fff',
          fontSize: 8,
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {initials(name)}
      </span>
      <span
        style={{
          fontSize: 12,
          color: 'var(--text-soft)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </span>
    </span>
  );
  if (!onClick) return body;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', minWidth: 0 }}
    >
      {body}
    </button>
  );
}

/**
 * Inline editor for a numeric field (the spec's click→edit→Enter pattern).
 * Click the value → input opens (purple border per §8); Enter saves, Esc cancels.
 * Renders a dashed "+ add" placeholder when empty (§ "Boş data").
 */
export function InlineNumber({
  value,
  onSave,
  prefix = '₼',
  placeholder = '+ Dəyər əlavə et',
  format,
  ariaLabel,
}: {
  value: number | null;
  onSave: (next: number) => void;
  prefix?: string;
  placeholder?: string;
  format: (n: number | null) => string;
  ariaLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  function commit() {
    const n = Number(draft.replace(/[^\d.-]/g, ''));
    if (!Number.isNaN(n)) onSave(n);
    setEditing(false);
  }

  const empty = value == null || value === 0;

  if (editing) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{prefix}</span>
        <input
          ref={ref}
          type="number"
          value={draft}
          aria-label={ariaLabel}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
            if (e.key === 'Escape') setEditing(false);
          }}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 90,
            height: 22,
            fontSize: 12,
            padding: '0 4px',
            borderRadius: 6,
            border: '1px solid #534AB7',
            background: 'var(--stage-lead-bg)',
            outline: 'none',
          }}
        />
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        setDraft(value != null && value !== 0 ? String(value) : '');
        setEditing(true);
      }}
      style={{
        fontSize: 13,
        fontWeight: 500,
        cursor: 'text',
        background: 'none',
        padding: empty ? '1px 6px' : 0,
        border: empty ? '1px dashed var(--line)' : 0,
        borderRadius: 6,
        color: empty ? 'var(--text-muted)' : 'var(--text)',
      }}
    >
      {empty ? placeholder : format(value)}
    </button>
  );
}
