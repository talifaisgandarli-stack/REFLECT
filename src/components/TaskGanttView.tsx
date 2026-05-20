import { useMemo } from 'react';
import type { Task } from '@/types/db';
import { TASK_STATUS_TONE } from '@/lib/labels';
import { todayInBaku } from '@/lib/time';

interface Props {
  tasks: Task[];
  /** ISO date (YYYY-MM-DD) of the left axis edge */
  startDate: string;
  onShift: (days: number) => void;
  onToday: () => void;
  onOpen: (t: Task) => void;
  projectById: Record<string, { name: string }>;
}

const WINDOW_DAYS = 42;
const ROW_HEIGHT = 28;
const TASK_COL_WIDTH = 220;

function isoOffset(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayDiff(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000,
  );
}

export function TaskGanttView({
  tasks,
  startDate,
  onShift,
  onToday,
  onOpen,
  projectById,
}: Props) {
  // PRD §FIN-09 — "today" anchored to Asia/Baku, not the browser's UTC.
  const todayIso = todayInBaku();

  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < WINDOW_DAYS; i++) out.push(isoOffset(startDate, i));
    return out;
  }, [startDate]);
  const axisEnd = days[days.length - 1];
  // Vertical "today" guideline — only drawn when today is in the visible window.
  const todayOffset = dayDiff(startDate, todayIso);
  const todayInWindow = todayOffset >= 0 && todayOffset < WINDOW_DAYS;

  // Tasks with a deadline that intersect the window. Bars start from
  // start_date if set, else from created_at (which is always present).
  const rows = useMemo(() => {
    return tasks
      .filter((t) => {
        if (!t.deadline) return false;
        const taskStart = t.start_date ?? t.created_at.slice(0, 10);
        return taskStart <= axisEnd && t.deadline >= startDate;
      })
      .sort((a, b) => {
        const ax = (a.start_date ?? a.created_at).slice(0, 10);
        const bx = (b.start_date ?? b.created_at).slice(0, 10);
        return ax.localeCompare(bx);
      });
  }, [tasks, startDate, axisEnd]);

  const totalWidthPct = 100;

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="chip"
            onClick={() => onShift(-7)}
            aria-label="Bir həftə geri"
          >
            ‹‹ həftə
          </button>
          <button
            type="button"
            className="chip"
            onClick={() => onShift(-1)}
            aria-label="Bir gün geri"
          >
            ‹
          </button>
          <span className="text-meta" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
            {startDate} → {axisEnd}
          </span>
          <button
            type="button"
            className="chip"
            onClick={() => onShift(1)}
            aria-label="Bir gün irəli"
          >
            ›
          </button>
          <button
            type="button"
            className="chip"
            onClick={() => onShift(7)}
            aria-label="Bir həftə irəli"
          >
            həftə ››
          </button>
        </div>
        <button type="button" className="chip" onClick={onToday}>
          Bu gün
        </button>
      </div>

      <div
        className="rounded-card overflow-x-auto"
        style={{ border: '1px solid var(--line)', background: 'var(--surface)' }}
      >
        <div style={{ minWidth: TASK_COL_WIDTH + 42 * 18, position: 'relative' }}>
          {/* "Today" guideline spans the chart area only — task-name column is
              skipped via TASK_COL_WIDTH offset. Z-index 0 keeps the sticky
              header in front; pointer-events:none lets bars remain clickable. */}
          {todayInWindow ? (
            <div
              aria-hidden
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                width: 2,
                background: 'var(--brand-action)',
                opacity: 0.5,
                pointerEvents: 'none',
                zIndex: 0,
                left: `calc(${TASK_COL_WIDTH}px + (100% - ${TASK_COL_WIDTH}px) * ${todayOffset / WINDOW_DAYS})`,
              }}
            />
          ) : null}
          {/* Header row: day labels */}
          <div
            className="flex"
            style={{
              borderBottom: '1px solid var(--line)',
              background: 'var(--surface-mist)',
              position: 'sticky',
              top: 0,
              zIndex: 1,
            }}
          >
            <div
              style={{
                width: TASK_COL_WIDTH,
                flexShrink: 0,
                padding: '8px 12px',
                fontSize: 11,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                borderRight: '1px solid var(--line)',
              }}
            >
              Tapşırıq
            </div>
            <div className="flex flex-1" style={{ position: 'relative' }}>
              {days.map((d) => {
                const dt = new Date(d + 'T00:00:00');
                const isToday = d === todayIso;
                const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
                return (
                  <div
                    key={d}
                    style={{
                      flex: '1 1 0',
                      minWidth: 18,
                      padding: '4px 0',
                      textAlign: 'center',
                      fontSize: 10,
                      fontVariantNumeric: 'tabular-nums',
                      color: isToday ? 'var(--ink)' : 'var(--text-muted)',
                      fontWeight: isToday ? 700 : 400,
                      background: isToday
                        ? 'var(--brand-glow-sm)'
                        : isWeekend
                        ? 'var(--surface-mist)'
                        : undefined,
                      borderRight: '1px solid var(--line-soft)',
                    }}
                  >
                    {dt.getDate()}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Body rows */}
          {rows.length === 0 ? (
            <div
              className="text-meta"
              style={{ padding: 16, color: 'var(--text-muted)' }}
            >
              Bu vaxt aralığında planlanmış tapşırıq yoxdur.
            </div>
          ) : (
            rows.map((t) => {
              const taskStart = t.start_date ?? t.created_at.slice(0, 10);
              const startOffset = Math.max(0, dayDiff(startDate, taskStart));
              const endOffset = Math.min(
                WINDOW_DAYS - 1,
                Math.max(startOffset, dayDiff(startDate, t.deadline!)),
              );
              const leftPct = (startOffset / WINDOW_DAYS) * totalWidthPct;
              const widthPct = ((endOffset - startOffset + 1) / WINDOW_DAYS) * totalWidthPct;
              const tone = TASK_STATUS_TONE[t.status];
              const projName = t.project_id ? projectById[t.project_id]?.name : null;
              return (
                <div
                  key={t.id}
                  className="flex items-center"
                  style={{
                    height: ROW_HEIGHT,
                    borderBottom: '1px solid var(--line-soft)',
                  }}
                >
                  <div
                    style={{
                      width: TASK_COL_WIDTH,
                      flexShrink: 0,
                      padding: '0 12px',
                      borderRight: '1px solid var(--line)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={projName ? `${t.title} · ${projName}` : t.title}
                  >
                    <span className="text-body" style={{ fontSize: 12 }}>{t.title}</span>
                    {projName ? (
                      <span
                        style={{
                          marginLeft: 6,
                          color: 'var(--text-muted)',
                          fontSize: 10,
                        }}
                      >
                        · {projName}
                      </span>
                    ) : null}
                  </div>
                  <div
                    className="flex-1"
                    style={{ position: 'relative', height: ROW_HEIGHT }}
                  >
                    <button
                      type="button"
                      onClick={() => onOpen(t)}
                      style={{
                        position: 'absolute',
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        top: 6,
                        height: ROW_HEIGHT - 12,
                        background: tone.bg,
                        border: `1px solid ${tone.text}`,
                        borderRadius: 4,
                        padding: 0,
                        cursor: 'pointer',
                      }}
                      title={`${t.title} — ${taskStart} → ${t.deadline}`}
                      aria-label={`${t.title} ${taskStart} → ${t.deadline}`}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
