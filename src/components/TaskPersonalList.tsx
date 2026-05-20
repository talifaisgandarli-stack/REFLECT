/**
 * US-TASK-06 — "Mənim" personal view. A time-grouped list of the user's
 * open tasks (Gecikmiş / Bu gün / Bu həftə / Sonra / Son tarix yoxdur),
 * with inline checkbox-to-done, status change, comments, and cancel.
 *
 * Owned by TasksPage; this component receives pre-bucketed data plus the
 * mutation triggers as props. State that's purely visual (checkbox tick
 * during completing animation) lives in the parent so it survives a view
 * switch back into mineOnly.
 */
import type { Task, TaskStatus } from '@/types/db';
import { TASK_STATUS_LABEL, TASK_STATUS_ORDER, TASK_STATUS_TONE } from '@/lib/labels';

export type TimeGroup = 'overdue' | 'today' | 'week' | 'later' | 'none';

export const TIME_GROUP_LABEL: Record<TimeGroup, string> = {
  overdue: 'Gecikmiş',
  today: 'Bu gün',
  week: 'Bu həftə',
  later: 'Sonra',
  none: 'Son tarix yoxdur',
};

export const TIME_GROUP_COLOR: Record<TimeGroup, string> = {
  overdue: 'var(--error)',
  today: 'var(--warning)',
  week: 'var(--success)',
  later: 'var(--text-muted)',
  none: 'var(--text-muted)',
};

export const TIME_GROUP_ORDER: TimeGroup[] = ['overdue', 'today', 'week', 'later', 'none'];

export function taskTimeGroup(t: Task, todayStr: string, endOfWeekStr: string): TimeGroup {
  if (!t.deadline) return 'none';
  if (t.deadline < todayStr) return 'overdue';
  if (t.deadline === todayStr) return 'today';
  if (t.deadline <= endOfWeekStr) return 'week';
  return 'later';
}

interface Props {
  groupedByTime: Record<TimeGroup, Task[]>;
  projectById: Record<string, { name: string }>;
  bulkMode: boolean;
  selectedIds: Set<string>;
  completingIds: Set<string>;
  onToggleSelected: (id: string) => void;
  onMarkCompleting: (id: string) => void;
  onMove: (id: string, status: TaskStatus, from?: TaskStatus) => void;
  onOpenComments: (t: Task) => void;
  onCancel: (t: Task) => void;
}

export function TaskPersonalList({
  groupedByTime,
  projectById,
  bulkMode,
  selectedIds,
  completingIds,
  onToggleSelected,
  onMarkCompleting,
  onMove,
  onOpenComments,
  onCancel,
}: Props) {
  const empty = TIME_GROUP_ORDER.every((g) => !groupedByTime[g].length);
  if (empty) {
    return <p className="text-meta" style={{ color: 'var(--text-muted)' }}>Aktiv tapşırıq yoxdur.</p>;
  }

  return (
    <div className="space-y-6">
      {TIME_GROUP_ORDER.map((g) => {
        const items = groupedByTime[g];
        if (!items.length) return null;
        return (
          <section key={g}>
            <h3
              className="text-tiny mb-3"
              style={{ color: TIME_GROUP_COLOR[g], letterSpacing: '0.08em', textTransform: 'uppercase' }}
            >
              {TIME_GROUP_LABEL[g]} · {items.length}
            </h3>
            <div className="space-y-1">
              {items.map((t) => {
                const proj = t.project_id ? projectById[t.project_id] : null;
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 py-2 px-3 rounded-card"
                    style={{
                      background:
                        bulkMode && selectedIds.has(t.id)
                          ? 'var(--brand-glow-sm)'
                          : 'var(--surface)',
                      border: '1px solid var(--line)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={bulkMode ? selectedIds.has(t.id) : completingIds.has(t.id)}
                      onChange={() => {
                        if (bulkMode) return onToggleSelected(t.id);
                        // Keep the tick visible until the row falls out of
                        // groupedByTime when the mutation refetches.
                        onMarkCompleting(t.id);
                        onMove(t.id, 'done', t.status);
                      }}
                      style={{
                        accentColor: 'var(--brand-action)',
                        width: 16,
                        height: 16,
                        flexShrink: 0,
                        cursor: 'pointer',
                      }}
                      aria-label={bulkMode ? `${t.title} seç` : `${t.title} tamamlandı`}
                    />
                    {/* PRD §6.6 — title as a real <button> so Enter/Space
                        opens the task without needing a mouse. */}
                    <button
                      type="button"
                      className="flex-1 text-body text-left"
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        font: 'inherit',
                        color: 'inherit',
                        minWidth: 0,
                      }}
                      onClick={() => onOpenComments(t)}
                    >
                      {t.title}
                    </button>
                    {proj ? (
                      <span
                        className="text-meta"
                        style={{
                          color: 'var(--text-muted)',
                          fontSize: 11,
                          flexShrink: 0,
                          maxWidth: 160,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={proj.name}
                      >
                        {proj.name}
                      </span>
                    ) : null}
                    {t.deadline ? (
                      <span
                        className="text-meta"
                        style={{ color: TIME_GROUP_COLOR[g], fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}
                      >
                        {t.deadline}
                      </span>
                    ) : null}
                    <select
                      aria-label="Status dəyiş"
                      value={t.status}
                      onChange={(e) => onMove(t.id, e.target.value as TaskStatus, t.status)}
                      className="text-meta px-2 py-0.5 rounded border-0"
                      style={{
                        background: 'var(--surface-raised)',
                        color: TASK_STATUS_TONE[t.status].text,
                        flexShrink: 0,
                        fontSize: 11,
                      }}
                    >
                      {TASK_STATUS_ORDER.map((s) => (
                        <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => onOpenComments(t)}
                      className="opacity-60 hover:opacity-100"
                      style={{ color: 'var(--text-muted)', fontSize: 13, flexShrink: 0 }}
                      aria-label="Şərhlər"
                    >
                      💬
                    </button>
                    <button
                      type="button"
                      onClick={() => onCancel(t)}
                      className="text-meta opacity-60 hover:opacity-100"
                      style={{ color: 'var(--text-muted)', flexShrink: 0 }}
                      aria-label={`Tapşırığı ləğv et: ${t.title}`}
                    >
                      Ləğv et
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
