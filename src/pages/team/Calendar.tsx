/**
 * Təqvim — PRD §8.2 + US-CAL-01..03 (Month / Week / Day).
 *
 * Recurrence is expanded client-side via expandOccurrences for the visible
 * range. Editing an existing event is out of scope this sprint — only create
 * is wired (PRD §11.3 DoD scoping).
 */
import { useMemo, useState } from 'react';
import { PageHead } from '@/components/PageHead';
import { useEvents } from '@/lib/calendar';
import { expandOccurrences, type CalendarEvent } from '@/lib/ics';
import { EventModal } from '@/components/EventModal';

type View = 'month' | 'week' | 'day';

export function CalendarPage() {
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState<Date>(() => stripTime(new Date()));
  const [openEvent, setOpenEvent] = useState<{ start?: Date } | null>(null);
  const [active, setActive] = useState<CalendarEvent | null>(null);

  const range = useMemo(() => visibleRange(cursor, view), [cursor, view]);
  const { data: events = [], isLoading } = useEvents(range.start, range.end);

  const occurrences = useMemo(() => {
    const out: { event: CalendarEvent; starts_at: Date; ends_at: Date }[] = [];
    for (const e of events) {
      for (const occ of expandOccurrences(e, range.start, range.end)) {
        out.push({ event: e, ...occ });
      }
    }
    return out.sort((a, b) => a.starts_at.getTime() - b.starts_at.getTime());
  }, [events, range]);

  return (
    <>
      <PageHead
        meta="Asia/Baku"
        title="Təqvim"
        actions={
          <>
            <button className="btn-ghost" onClick={() => setCursor(stepCursor(cursor, view, -1))}>‹</button>
            <button className="btn-ghost" onClick={() => setCursor(stripTime(new Date()))}>Bu gün</button>
            <button className="btn-ghost" onClick={() => setCursor(stepCursor(cursor, view, 1))}>›</button>
            {(['month', 'week', 'day'] as const).map((v) => (
              <button
                key={v}
                className={`chip ${view === v ? 'chip-brand' : ''}`}
                onClick={() => setView(v)}
              >
                {v === 'month' ? 'Ay' : v === 'week' ? 'Həftə' : 'Gün'}
              </button>
            ))}
            <button className="btn-primary" onClick={() => setOpenEvent({})}>+ Görüş</button>
          </>
        }
      />

      <div className="card mb-3 flex justify-between items-baseline" style={{ padding: '12px 16px' }}>
        <h2 className="text-h3">{rangeLabel(cursor, view)}</h2>
        {isLoading ? (
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Yüklənir…</span>
        ) : (
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            {occurrences.length} hadisə
          </span>
        )}
      </div>

      {view === 'month' ? (
        <MonthGrid
          cursor={cursor}
          occurrences={occurrences}
          onPickDay={(d) => setOpenEvent({ start: d })}
          onPickEvent={(e) => setActive(e)}
        />
      ) : view === 'week' ? (
        <WeekGrid
          cursor={cursor}
          occurrences={occurrences}
          onPickEvent={(e) => setActive(e)}
        />
      ) : (
        <DayList
          cursor={cursor}
          occurrences={occurrences}
          onPickEvent={(e) => setActive(e)}
        />
      )}

      {openEvent ? (
        <EventModal onClose={() => setOpenEvent(null)} defaultStart={openEvent.start} />
      ) : null}

      {active ? (
        <EventDrawer event={active} onClose={() => setActive(null)} />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

type Occ = { event: CalendarEvent; starts_at: Date; ends_at: Date };

function MonthGrid({
  cursor,
  occurrences,
  onPickDay,
  onPickEvent,
}: {
  cursor: Date;
  occurrences: Occ[];
  onPickDay: (d: Date) => void;
  onPickEvent: (e: CalendarEvent) => void;
}) {
  const first = startOfMonth(cursor);
  const gridStart = startOfWeekMon(first);
  const days: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(gridStart);
    d.setUTCDate(d.getUTCDate() + i);
    days.push(d);
  }

  const byDay = bucketByDay(occurrences);

  return (
    <div className="card overflow-hidden" style={{ padding: 0 }}>
      <div
        className="grid text-meta uppercase tracking-wider"
        style={{ gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--line)', color: 'var(--text-muted)' }}
      >
        {['B.e.', 'Ç.a.', 'Çr.', 'C.a.', 'C.', 'Ş.', 'B.'].map((d) => (
          <div key={d} className="px-3 py-2">{d}</div>
        ))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {days.map((d) => {
          const inMonth = d.getUTCMonth() === cursor.getUTCMonth();
          const isToday = sameDay(d, new Date());
          const key = dayKey(d);
          const dayOccs = byDay.get(key) ?? [];
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onPickDay(d)}
              className="text-left p-2 min-h-[110px]"
              style={{
                borderTop: '1px solid var(--line-soft)',
                borderRight: '1px solid var(--line-soft)',
                background: isToday ? 'var(--surface-mist)' : 'var(--surface)',
                opacity: inMonth ? 1 : 0.45,
              }}
            >
              <div className="text-meta font-medium">{d.getUTCDate()}</div>
              <ul className="mt-1 space-y-1">
                {dayOccs.slice(0, 3).map((occ, i) => (
                  <li
                    key={`${occ.event.id}-${i}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPickEvent(occ.event);
                    }}
                    className="text-tiny rounded-btn px-1 py-0.5 truncate"
                    style={{ background: 'var(--brand-action)', color: 'var(--brand-text)' }}
                    title={occ.event.title}
                  >
                    {occ.event.title}
                  </li>
                ))}
                {dayOccs.length > 3 ? (
                  <li className="text-tiny" style={{ color: 'var(--text-muted)' }}>
                    +{dayOccs.length - 3}
                  </li>
                ) : null}
              </ul>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekGrid({
  cursor,
  occurrences,
  onPickEvent,
}: {
  cursor: Date;
  occurrences: Occ[];
  onPickEvent: (e: CalendarEvent) => void;
}) {
  const start = startOfWeekMon(cursor);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  });
  const byDay = bucketByDay(occurrences);

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
      {days.map((d) => {
        const isToday = sameDay(d, new Date());
        const dayOccs = byDay.get(dayKey(d)) ?? [];
        return (
          <div
            key={d.toISOString()}
            className="card"
            style={{
              padding: 12,
              minHeight: 280,
              background: isToday ? 'var(--surface-mist)' : 'var(--surface)',
            }}
          >
            <div className="text-meta uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
              {d.toLocaleDateString('az-Latn-AZ', { weekday: 'short', day: 'numeric' })}
            </div>
            <ul className="space-y-1">
              {dayOccs.map((occ, i) => (
                <li
                  key={`${occ.event.id}-${i}`}
                  onClick={() => onPickEvent(occ.event)}
                  className="rounded-btn px-2 py-1 cursor-pointer text-meta"
                  style={{ background: 'var(--brand-action)', color: 'var(--brand-text)' }}
                >
                  <div className="font-medium truncate">{occ.event.title}</div>
                  <div className="text-tiny">
                    {occ.event.all_day
                      ? 'Bütün gün'
                      : `${fmtTime(occ.starts_at)}–${fmtTime(occ.ends_at)}`}
                  </div>
                </li>
              ))}
              {dayOccs.length === 0 ? (
                <li className="text-meta" style={{ color: 'var(--text-muted)' }}>—</li>
              ) : null}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function DayList({
  cursor,
  occurrences,
  onPickEvent,
}: {
  cursor: Date;
  occurrences: Occ[];
  onPickEvent: (e: CalendarEvent) => void;
}) {
  const dayOccs = (bucketByDay(occurrences).get(dayKey(cursor)) ?? []).slice();
  return (
    <div className="card">
      {dayOccs.length === 0 ? (
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>Bu gün hadisə yoxdur.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {dayOccs.map((occ, i) => (
            <li
              key={`${occ.event.id}-${i}`}
              className="py-3 flex items-center justify-between cursor-pointer"
              onClick={() => onPickEvent(occ.event)}
            >
              <div>
                <div className="font-medium">{occ.event.title}</div>
                <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                  {occ.event.location ?? '—'}
                </div>
              </div>
              <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                {occ.event.all_day
                  ? 'Bütün gün'
                  : `${fmtTime(occ.starts_at)}–${fmtTime(occ.ends_at)}`}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EventDrawer({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <aside
        className="w-[420px] h-full bg-surface p-6 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-h2 mb-1">{event.title}</h2>
        <p className="text-meta mb-4" style={{ color: 'var(--text-muted)' }}>
          {new Date(event.starts_at).toLocaleString('az-Latn-AZ')} →{' '}
          {new Date(event.ends_at).toLocaleString('az-Latn-AZ')}
        </p>
        {event.location ? (
          <p className="text-body mb-2"><strong>Yer:</strong> {event.location}</p>
        ) : null}
        {event.meet_url ? (
          <a
            href={event.meet_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary inline-block mb-3"
          >
            Görüşə qoşul
          </a>
        ) : null}
        {event.description ? (
          <p className="text-body whitespace-pre-line mb-3">{event.description}</p>
        ) : null}
        {event.recurrence_rule ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Təkrar: {event.recurrence_rule}
          </p>
        ) : null}
        <button className="btn-outline mt-5" onClick={onClose}>Bağla</button>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Date helpers (UTC-based to match how Postgres timestamptz round-trips)
// ---------------------------------------------------------------------------

function stripTime(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function startOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function startOfWeekMon(d: Date) {
  const x = stripTime(d);
  const dow = (x.getUTCDay() + 6) % 7; // 0=Mon..6=Sun
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}
function sameDay(a: Date, b: Date) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}
function dayKey(d: Date) {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}
function fmtTime(d: Date) {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function bucketByDay(occs: Occ[]) {
  const m = new Map<string, Occ[]>();
  for (const o of occs) {
    // Multi-day events: include in every covered day.
    const cur = stripTime(o.starts_at);
    const last = stripTime(o.ends_at);
    while (cur.getTime() <= last.getTime()) {
      const k = dayKey(cur);
      const arr = m.get(k) ?? [];
      arr.push(o);
      m.set(k, arr);
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }
  return m;
}

function visibleRange(cursor: Date, view: View) {
  if (view === 'day') {
    const start = stripTime(cursor);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }
  if (view === 'week') {
    const start = startOfWeekMon(cursor);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    return { start, end };
  }
  // Month — pad to the 6×7 grid we display.
  const first = startOfMonth(cursor);
  const start = startOfWeekMon(first);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 42);
  return { start, end };
}

function stepCursor(cursor: Date, view: View, dir: 1 | -1) {
  const c = new Date(cursor);
  if (view === 'day') c.setUTCDate(c.getUTCDate() + dir);
  else if (view === 'week') c.setUTCDate(c.getUTCDate() + 7 * dir);
  else c.setUTCMonth(c.getUTCMonth() + dir);
  return c;
}

function rangeLabel(cursor: Date, view: View) {
  const opts: Intl.DateTimeFormatOptions =
    view === 'day' ? { day: 'numeric', month: 'long', year: 'numeric' } :
    view === 'week' ? { day: 'numeric', month: 'short', year: 'numeric' } :
    { month: 'long', year: 'numeric' };
  return cursor.toLocaleDateString('az-Latn-AZ', opts);
}
