import { useMemo } from 'react';
import type { Task } from '@/types/db';
import { TASK_STATUS_TONE } from '@/lib/labels';
import { todayInBaku } from '@/lib/time';

interface Props {
  tasks: Task[];
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onOpen: (t: Task) => void;
}

const MONTH_LABEL_AZ = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun',
  'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr',
];
const WEEKDAY_LABEL_AZ = ['Be', 'Çə', 'Çr', 'Ca', 'Cü', 'Şə', 'Ba'];

export function TaskCalendarView({
  tasks,
  year,
  month,
  onPrev,
  onNext,
  onToday,
  onOpen,
}: Props) {
  // PRD §FIN-09 — "today" anchored to Asia/Baku, not the browser's UTC.
  const todayIso = todayInBaku();

  // Bucket tasks by deadline date once.
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.deadline) continue;
      const arr = map.get(t.deadline);
      if (arr) arr.push(t);
      else map.set(t.deadline, [t]);
    }
    return map;
  }, [tasks]);

  // Build 6-row x 7-col grid, Monday-first.
  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    // JS getDay(): 0=Sun..6=Sat; rotate so Monday=0
    const leadBlanks = (first.getDay() + 6) % 7;
    const daysInMonth = last.getDate();
    const out: Array<{ date: string | null; day: number | null }> = [];
    for (let i = 0; i < leadBlanks; i++) out.push({ date: null, day: null });
    for (let d = 1; d <= daysInMonth; d++) {
      // Build YYYY-MM-DD without UTC drift.
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      out.push({ date: iso, day: d });
    }
    while (out.length % 7 !== 0) out.push({ date: null, day: null });
    return out;
  }, [year, month]);

  const headerLabel = `${MONTH_LABEL_AZ[month]} ${year}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="chip"
            onClick={onPrev}
            aria-label="Əvvəlki ay"
          >
            ‹
          </button>
          <h2 className="text-h3" style={{ minWidth: 180 }}>
            {headerLabel}
          </h2>
          <button
            type="button"
            className="chip"
            onClick={onNext}
            aria-label="Növbəti ay"
          >
            ›
          </button>
        </div>
        <button type="button" className="chip" onClick={onToday}>
          Bu gün
        </button>
      </div>

      {/* overflow-x wrapper keeps day cells usable on narrow viewports.
          min-width below the cell-count × min-cell-width keeps each cell
          legible instead of crushing the grid to <50px columns.
          A11y note: we previously claimed role="grid" + role="gridcell"
          but did not implement WAI-ARIA grid keyboard nav (arrow keys,
          one focusable cell). Falsely claiming grid semantics confuses
          screen readers more than it helps — dropped in favour of an
          honest region label + per-cell date label. Task buttons inside
          remain the focusable interactives. */}
      <div className="overflow-x-auto rounded-card" style={{ border: '1px solid var(--line)' }}>
      <section
        className="grid grid-cols-7 gap-px overflow-hidden"
        style={{ background: 'var(--line)', minWidth: 7 * 88 }}
        aria-label={`${headerLabel} təqvim`}
      >
        {WEEKDAY_LABEL_AZ.map((w) => (
          <div
            key={w}
            // Each date cell carries the full date in aria-label, so the
            // weekday header strip is decorative for screen-reader users.
            aria-hidden="true"
            className="text-meta py-2 px-2 text-center"
            style={{
              background: 'var(--surface-mist)',
              color: 'var(--text-muted)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              fontSize: 11,
            }}
          >
            {w}
          </div>
        ))}
        {cells.map((c, i) => {
          const dayTasks = c.date ? tasksByDate.get(c.date) ?? [] : [];
          const isToday = c.date === todayIso;
          return (
            <div
              key={i}
              className="p-2"
              style={{
                background: c.date ? 'var(--surface)' : 'var(--surface-mist)',
                minHeight: 96,
                border: isToday ? '2px solid var(--brand-action)' : undefined,
              }}
              aria-label={c.date ?? undefined}
            >
              {c.day != null ? (
                <>
                  <div
                    className="text-meta mb-1"
                    style={{
                      color: isToday ? 'var(--ink)' : 'var(--text-muted)',
                      fontVariantNumeric: 'tabular-nums',
                      fontWeight: isToday ? 700 : 400,
                    }}
                  >
                    {c.day}
                  </div>
                  <div className="space-y-1">
                    {dayTasks.slice(0, 3).map((t) => {
                      const tone = TASK_STATUS_TONE[t.status];
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => onOpen(t)}
                          className="block w-full text-left rounded px-1.5 py-0.5 truncate"
                          style={{
                            background: tone.bg,
                            color: tone.text,
                            fontSize: 11,
                            border: 'none',
                            cursor: 'pointer',
                          }}
                          title={t.title}
                        >
                          {t.title}
                        </button>
                      );
                    })}
                    {dayTasks.length > 3 ? (
                      <div
                        className="text-meta"
                        style={{ color: 'var(--text-muted)', fontSize: 10 }}
                      >
                        + {dayTasks.length - 3} daha
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          );
        })}
      </section>
      </div>
    </div>
  );
}
