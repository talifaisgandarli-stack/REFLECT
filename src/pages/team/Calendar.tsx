/**
 * Calendar — US-CAL-01..03, §8.2.
 * Month / Week / Day grid views (no Google API; .ics via mailto).
 * Event creation: internal attendees + external_emails + recurrence_rule.
 * meet.new integration: opens tab, user pastes URL back.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSlashFocus } from '@/lib/useSlashFocus';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';

type CalEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  meet_url: string | null;
  organizer_id: string | null;
  project_id: string | null;
  recurrence_rule: string | null;
  external_emails: string[] | null;
  attendees: string[] | null;
  /** PRD §8.2 EXDATE — ISO dates (YYYY-MM-DD) of skipped occurrences */
  exception_dates?: string[] | null;
};

// --------- date helpers ---------
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('az-AZ', {
    timeZone: 'Asia/Baku',
    hour: '2-digit',
    minute: '2-digit',
  });
}
function fmtDay(d: Date) {
  return d.toLocaleDateString('az-AZ', { timeZone: 'Asia/Baku', weekday: 'short', day: 'numeric' });
}
// ISO 8601 week number (PRD §UX — calendar week numbers in agenda)
function isoWeekNumber(d: Date): number {
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = (target.getTime() - firstThursday.getTime()) / 86_400_000;
  return 1 + Math.round((diff - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
}
const MONTH_NAMES = ['Yanvar','Fevral','Mart','Aprel','May','İyun','İyul','Avqust','Sentyabr','Oktyabr','Noyabr','Dekabr'];
const WEEKDAY_SHORT = ['B.e.','Ç.a.','Ç.','C.a.','C.','Ş.','B.'];

// Stable per-project color palette so the same project always renders the
// same chip color across views. Hash project_id → palette index. Events
// without a project fall back to the brand glow.
const PROJECT_PALETTE = [
  { bg: 'rgba(173, 251, 73, 0.18)', fg: '#3a6f0e' },   // brand-action lime
  { bg: 'rgba(82, 152, 219, 0.18)', fg: '#1e4d75' },   // sky
  { bg: 'rgba(225, 119, 167, 0.18)', fg: '#7d2854' },  // rose
  { bg: 'rgba(255, 158, 64, 0.20)', fg: '#7a3a06' },   // peach
  { bg: 'rgba(149, 117, 205, 0.20)', fg: '#3e2a7a' },  // lavender
  { bg: 'rgba(78, 196, 168, 0.20)', fg: '#155e4d' },   // teal
  { bg: 'rgba(212, 175, 55, 0.22)', fg: '#6b5210' },   // gold
];
function projectColor(projectId: string | null | undefined): { bg: string; fg: string } {
  if (!projectId) return { bg: 'var(--brand-glow-xl)', fg: 'var(--brand-text)' };
  // djb2-ish lightweight hash → palette index
  let h = 5381;
  for (let i = 0; i < projectId.length; i++) h = ((h << 5) + h + projectId.charCodeAt(i)) | 0;
  return PROJECT_PALETTE[Math.abs(h) % PROJECT_PALETTE.length];
}

export function CalendarPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [view, setView] = useState<'month' | 'week' | 'day' | 'agenda'>('month');
  const [cursor, setCursor] = useState(() => new Date());
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const [selected, setSelected] = useState<CalEvent | null>(null);

  // Range for fetching events
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (view === 'month') {
      const s = startOfMonth(cursor);
      s.setDate(s.getDate() - 7);
      const e = new Date(cursor.getFullYear(), cursor.getMonth() + 2, 7);
      return { rangeStart: s.toISOString(), rangeEnd: e.toISOString() };
    }
    if (view === 'week') {
      const s = startOfWeek(cursor);
      const e = new Date(s); e.setDate(s.getDate() + 7);
      return { rangeStart: s.toISOString(), rangeEnd: e.toISOString() };
    }
    const s = new Date(cursor); s.setHours(0, 0, 0, 0);
    const e = new Date(cursor); e.setHours(23, 59, 59, 999);
    return { rangeStart: s.toISOString(), rangeEnd: e.toISOString() };
  }, [view, cursor]);

  const { data: allEvents = [] } = useQuery({
    queryKey: ['calendar', rangeStart, rangeEnd],
    queryFn: async (): Promise<CalEvent[]> => {
      const { data } = await supabase
        .from('calendar_events')
        .select('*')
        .gte('starts_at', rangeStart)
        .lte('starts_at', rangeEnd)
        .order('starts_at', { ascending: true });
      return (data ?? []) as CalEvent[];
    },
  });

  // PRD §UX — client-side search across rendered events (title/location)
  // URL-persisted so refresh / share-link preserves the query
  const [searchParams, setSearchParams] = useSearchParams();
  const [eventSearch, setEventSearch] = useState(searchParams.get('q') ?? '');
  const eventSearchRef = useRef<HTMLInputElement>(null);
  useSlashFocus(eventSearchRef);
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (eventSearch) next.set('q', eventSearch);
    else next.delete('q');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventSearch]);
  const events = useMemo(() => {
    if (!eventSearch.trim()) return allEvents;
    const q = eventSearch.toLowerCase();
    return allEvents.filter((e) =>
      e.title.toLowerCase().includes(q) || (e.location ?? '').toLowerCase().includes(q),
    );
  }, [allEvents, eventSearch]);

  function navigate(dir: -1 | 1) {
    const d = new Date(cursor);
    if (view === 'month') d.setMonth(d.getMonth() + dir);
    else if (view === 'week') d.setDate(d.getDate() + 7 * dir);
    else d.setDate(d.getDate() + dir);
    setCursor(d);
  }

  // PRD §6.3 — keyboard nav: ← prev, → next, T today, M/W/D view switch
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement).tagName;
      const editing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable;
      if (editing) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); navigate(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); navigate(1); }
      else if (e.key === 't' || e.key === 'T') { e.preventDefault(); setCursor(new Date()); }
      else if (e.key === 'm' || e.key === 'M') { e.preventDefault(); setView('month'); }
      else if (e.key === 'w' || e.key === 'W') { e.preventDefault(); setView('week'); }
      else if (e.key === 'd' || e.key === 'D') { e.preventDefault(); setView('day'); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, view]);

  function eventsForDay(day: Date): CalEvent[] {
    return events.filter((e) => isSameDay(new Date(e.starts_at), day));
  }

  // Build month grid (6 rows × 7 cols)
  const monthGrid = useMemo(() => {
    const firstDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startDay = startOfWeek(firstDay);
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      days.push(new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate() + i));
    }
    return days;
  }, [cursor]);

  // Build week days
  const weekDays = useMemo(() => {
    const s = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => new Date(s.getFullYear(), s.getMonth(), s.getDate() + i));
  }, [cursor]);

  const today = new Date();
  const headerLabel =
    view === 'month'
      ? `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`
      : view === 'week'
      ? `${fmtDay(weekDays[0])} – ${fmtDay(weekDays[6])}`
      : cursor.toLocaleDateString('az-AZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      <PageHead
        meta="Asia/Baku"
        title="Təqvim"
        actions={
          <>
            <div className="flex gap-1">
              {(['month', 'week', 'day', 'agenda'] as const).map((v) => (
                <button
                  key={v}
                  className="chip"
                  style={{
                    background: view === v ? 'var(--brand-action)' : 'var(--surface-mist)',
                    color: view === v ? 'var(--ink)' : 'var(--text-muted)',
                  }}
                  onClick={() => setView(v)}
                >
                  {v === 'month' ? 'Ay' : v === 'week' ? 'Həftə' : v === 'day' ? 'Gün' : 'Gündəlik'}
                </button>
              ))}
            </div>
            <button className="btn-primary" onClick={() => setCreating(true)}>
              + Görüş
            </button>
          </>
        }
      />

      {/* Navigation bar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button className="btn-outline px-3 py-1" onClick={() => navigate(-1)}>‹</button>
        <button
          className="chip"
          style={{ background: 'var(--surface-mist)', color: 'var(--text-muted)' }}
          onClick={() => setCursor(new Date())}
          title="Bu günə qayıt (T)"
        >
          Bu gün <span style={{ opacity: 0.5, marginLeft: 4, fontSize: 10 }}>T</span>
        </button>
        <button className="btn-outline px-3 py-1" onClick={() => navigate(1)}>›</button>
        <span className="text-h3 ml-2">{headerLabel}</span>
        {/* PRD §UX — at-a-glance count of events in the current view-range */}
        {(() => {
          const range = view === 'month' ? monthGrid : view === 'week' ? weekDays : [cursor];
          if (range.length === 0) return null;
          const first = range[0];
          const last = range[range.length - 1];
          const startMs = new Date(first.getFullYear(), first.getMonth(), first.getDate()).getTime();
          const endMs = new Date(last.getFullYear(), last.getMonth(), last.getDate(), 23, 59, 59).getTime();
          const count = events.filter((e) => {
            const t = new Date(e.starts_at).getTime();
            return t >= startMs && t <= endMs;
          }).length;
          if (count === 0) return null;
          return (
            <span
              className="chip ml-2"
              style={{
                background: 'var(--brand-glow-sm)',
                color: 'var(--brand-text)',
                fontSize: 11,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {count} görüş
            </span>
          );
        })()}
        <span style={{ flex: 1 }} />
        {/* PRD §UX — search across rendered events (client-side) */}
        <input
          ref={eventSearchRef}
          className="input max-w-[220px]"
          placeholder="Görüş axtar… (/)"
          value={eventSearch}
          onChange={(e) => setEventSearch(e.target.value)}
        />
      </div>

      {/* ── Month view ── */}
      {view === 'month' ? (
        <div className="card p-0 overflow-hidden">
          <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--line-soft)' }}>
            {WEEKDAY_SHORT.map((w) => (
              <div
                key={w}
                className="text-center text-meta py-2"
                style={{ color: 'var(--text-muted)', fontSize: 11 }}
              >
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthGrid.map((day, i) => {
              const dayEvents = eventsForDay(day);
              const isCurrentMonth = day.getMonth() === cursor.getMonth();
              const isToday = isSameDay(day, today);
              return (
                <div
                  key={i}
                  className="min-h-[90px] p-1.5 border-b border-r cursor-pointer hover:bg-surface-mist transition-colors"
                  style={{
                    borderColor: 'var(--line-soft)',
                    background: isToday ? 'var(--brand-glow-sm)' : 'transparent',
                    opacity: isCurrentMonth ? 1 : 0.4,
                  }}
                  onClick={() => { setCursor(day); setView('day'); }}
                >
                  <div
                    className="text-meta font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full"
                    style={{
                      color: isToday ? 'var(--ink)' : 'var(--text)',
                      background: isToday ? 'var(--brand-action)' : 'transparent',
                      fontSize: 12,
                    }}
                  >
                    {day.getDate()}
                  </div>
                  {dayEvents.slice(0, 2).map((ev) => {
                    const c = projectColor(ev.project_id);
                    return (
                      <div
                        key={ev.id}
                        className="truncate text-tiny px-1 py-0.5 rounded mb-0.5"
                        style={{
                          background: c.bg,
                          color: c.fg,
                          fontSize: 10,
                        }}
                        onClick={(e) => { e.stopPropagation(); setSelected(ev); }}
                      >
                        {ev.recurrence_rule ? '↻ ' : ''}{ev.title}
                      </div>
                    );
                  })}
                  {dayEvents.length > 2 ? (
                    <div className="text-tiny" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                      +{dayEvents.length - 2}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ── Week view ── */}
      {view === 'week' ? (
        <div className="card p-0 overflow-hidden">
          <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--line-soft)' }}>
            {weekDays.map((day) => {
              const isToday = isSameDay(day, today);
              return (
                <div
                  key={day.toISOString()}
                  className="text-center py-2 cursor-pointer"
                  onClick={() => { setCursor(day); setView('day'); }}
                >
                  <div className="text-meta" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    {WEEKDAY_SHORT[day.getDay() === 0 ? 6 : day.getDay() - 1]}
                  </div>
                  <div
                    className="mx-auto mt-0.5 w-7 h-7 flex items-center justify-center rounded-full text-body font-medium"
                    style={{
                      background: isToday ? 'var(--brand-action)' : 'transparent',
                      color: isToday ? 'var(--ink)' : 'var(--text)',
                    }}
                  >
                    {day.getDate()}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-7">
            {weekDays.map((day) => {
              const dayEvents = eventsForDay(day);
              return (
                <div
                  key={day.toISOString()}
                  className="min-h-[200px] p-1.5 border-r"
                  style={{ borderColor: 'var(--line-soft)' }}
                >
                  {dayEvents.map((ev) => {
                    const c = projectColor(ev.project_id);
                    return (
                      <div
                        key={ev.id}
                        className="rounded p-1.5 mb-1 cursor-pointer"
                        style={{ background: c.bg, color: c.fg, borderLeft: `3px solid ${c.fg}` }}
                        onClick={() => setSelected(ev)}
                      >
                        <div className="font-medium truncate" style={{ fontSize: 12 }}>{ev.title}</div>
                        <div style={{ fontSize: 11, opacity: 0.75 }}>{fmtTime(ev.starts_at)}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ── Day view ── */}
      {view === 'day' ? (
        <div className="card">
          <h3 className="text-h3 mb-4">
            {cursor.toLocaleDateString('az-AZ', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h3>
          {eventsForDay(cursor).length === 0 ? (
            <div className="text-meta text-center py-8" style={{ color: 'var(--text-muted)' }}>
              Bu gün üçün görüş yoxdur.{' '}
              <button className="underline" onClick={() => setCreating(true)}>Əlavə et</button>
            </div>
          ) : (
            <ul className="space-y-2">
              {eventsForDay(cursor).map((ev) => {
                const c = projectColor(ev.project_id);
                return (
                <li
                  key={ev.id}
                  className="rounded-card p-3 cursor-pointer hover:opacity-80"
                  style={{
                    background: 'var(--surface-mist)',
                    border: '1px solid var(--line-soft)',
                    borderLeft: `4px solid ${c.fg}`,
                  }}
                  onClick={() => setSelected(ev)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-body font-medium">{ev.title}</span>
                    <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
                      {fmtTime(ev.starts_at)} – {fmtTime(ev.ends_at)}
                    </span>
                  </div>
                  {ev.location ? (
                    <div className="text-meta mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      📍 {ev.location}
                    </div>
                  ) : null}
                  {ev.meet_url ? (
                    <a
                      href={ev.meet_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="chip chip-brand mt-1.5 inline-block"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Görüşə qoşul
                    </a>
                  ) : null}
                </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {/* ── Agenda view ── upcoming 14 days, grouped by date */}
      {view === 'agenda' ? (
        <div className="card">
          <h3 className="text-h3 mb-4">Növbəti 14 gün</h3>
          {(() => {
            const start = new Date(cursor);
            start.setHours(0, 0, 0, 0);
            const days: Date[] = [];
            for (let i = 0; i < 14; i++) {
              const d = new Date(start);
              d.setDate(start.getDate() + i);
              days.push(d);
            }
            const populated = days
              .map((d) => ({ date: d, events: eventsForDay(d) }))
              .filter((g) => g.events.length > 0);
            if (populated.length === 0) {
              return (
                <div className="text-meta text-center py-8" style={{ color: 'var(--text-muted)' }}>
                  Növbəti 14 gün üçün görüş yoxdur.
                </div>
              );
            }
            return (
              <ul className="space-y-3">
                {populated.map((g) => (
                  <li key={g.date.toISOString()}>
                    <div
                      className="text-meta mb-2 flex items-center justify-between"
                      style={{
                        color: isSameDay(g.date, today) ? 'var(--brand-text)' : 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      <span>
                        {isSameDay(g.date, today) ? 'BU GÜN · ' : ''}
                        {g.date.toLocaleDateString('az-AZ', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </span>
                      <span style={{ opacity: 0.6, fontWeight: 400 }}>H {isoWeekNumber(g.date)}</span>
                    </div>
                    <ul className="space-y-1.5 ml-2">
                      {g.events.map((ev) => {
                        const c = projectColor(ev.project_id);
                        return (
                          <li
                            key={ev.id}
                            className="rounded-card p-2 cursor-pointer hover:opacity-80 flex items-center gap-2"
                            style={{
                              background: 'var(--surface-mist)',
                              border: '1px solid var(--line-soft)',
                              borderLeft: `3px solid ${c.fg}`,
                            }}
                            onClick={() => setSelected(ev)}
                          >
                            <span
                              className="text-meta shrink-0"
                              style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', minWidth: 80 }}
                            >
                              {ev.all_day ? 'Bütün gün' : `${fmtTime(ev.starts_at)} – ${fmtTime(ev.ends_at)}`}
                            </span>
                            <span className="text-body flex-1 truncate">{ev.title}</span>
                            {/* PRD §UX — event icons for location / meet / recurring */}
                            <span className="shrink-0 flex items-center gap-1" style={{ fontSize: 11 }}>
                              {ev.location ? <span title={ev.location}>📍</span> : null}
                              {ev.meet_url ? <span title="Online görüş">📹</span> : null}
                              {ev.recurrence_rule ? (
                                <span style={{ color: 'var(--brand-text)' }}>↻</span>
                              ) : null}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            );
          })()}
        </div>
      ) : null}

      {/* Event detail modal */}
      {selected ? (
        <EventModal
          event={selected}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditing(selected);
            setSelected(null);
          }}
        />
      ) : null}

      {/* Event creation modal */}
      {creating ? (
        <CreateEventModal
          defaultDate={cursor}
          userId={profile?.id ?? ''}
          onClose={() => setCreating(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['calendar'] });
            setCreating(false);
          }}
        />
      ) : null}

      {editing ? (
        <CreateEventModal
          defaultDate={new Date(editing.starts_at)}
          userId={profile?.id ?? ''}
          existingEvent={editing}
          onClose={() => setEditing(null)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['calendar'] });
            setEditing(null);
          }}
        />
      ) : null}
    </>
  );
}

// --------- Event detail modal ---------
function EventModal({
  event,
  onClose,
  onEdit,
}: {
  event: CalEvent;
  onClose: () => void;
  onEdit: () => void;
}) {
  const qc = useQueryClient();
  const { profile, isAdmin } = useAuth();
  const canEdit = isAdmin || event.organizer_id === profile?.id;
  const canDelete = canEdit;
  // PRD §8.2 EXDATE — push this occurrence into exception_dates so it disappears
  // from future series expansions (currently the UI shows only the seed date,
  // so this is forward-compatible with expanded recurring rendering).
  const skipOccurrence = useMutation({
    mutationFn: async () => {
      const dateKey = event.starts_at.slice(0, 10);
      const next = Array.from(new Set([...((event.exception_dates as string[]) ?? []), dateKey]));
      const { error } = await supabase
        .from('calendar_events')
        .update({ exception_dates: next })
        .eq('id', event.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] });
      onClose();
    },
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('calendar_events').delete().eq('id', event.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] });
      setConfirmingDelete(false);
      onClose();
    },
  });
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <div
        className="card max-w-md w-full"
        style={{ padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* PRD §UX — inline title edit when canEdit */}
        {canEdit ? (
          <EventFieldInline eventId={event.id} field="title" initial={event.title} as="title" />
        ) : (
          <h2 className="text-h2 mb-2">{event.title}</h2>
        )}
        {/* Date display + inline time edit (admin/organizer) */}
        {canEdit ? (
          <EventTimeInline event={event} />
        ) : (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            {new Date(event.starts_at).toLocaleDateString('az-AZ', { timeZone: 'Asia/Baku', weekday: 'long', day: 'numeric', month: 'long' })}
            {' '}{fmtTime(event.starts_at)} – {fmtTime(event.ends_at)}
          </p>
        )}
        {/* PRD §UX — inline location edit when canEdit; non-canEdit shows static */}
        {canEdit ? (
          <EventFieldInline eventId={event.id} field="location" initial={event.location ?? ''} as="location" />
        ) : (event.location ? <p className="mt-2 text-body">📍 {event.location}</p> : null)}
        {/* Meet URL — inline editable for canEdit, static link for non-canEdit */}
        {canEdit ? (
          <EventFieldInline eventId={event.id} field="meet_url" initial={event.meet_url ?? ''} as="meet_url" />
        ) : (event.meet_url ? (
          <a href={event.meet_url} target="_blank" rel="noreferrer noopener" className="mt-2 text-body block" style={{ color: 'var(--brand-text)' }}>
            📹 {event.meet_url}
          </a>
        ) : null)}
        {/* PRD §8.2 — internal attendees (team) inline editor */}
        {canEdit ? (
          <EventInternalAttendeesEditor eventId={event.id} initial={(event.attendees as string[] | null) ?? []} />
        ) : null}
        {/* PRD §8.2 — external attendees list with × remove + inline add (canEdit) */}
        {canEdit ? (
          <EventExternalEmailsEditor eventId={event.id} initial={event.external_emails ?? []} />
        ) : (event.external_emails && event.external_emails.length > 0 ? (
          <p className="mt-2 text-body">📧 {event.external_emails.join(', ')}</p>
        ) : null)}
        {event.recurrence_rule ? (
          <p className="mt-2 text-meta" style={{ color: 'var(--brand-text)' }}>
            ↻ {rruleLabel(event.recurrence_rule)}
          </p>
        ) : null}
        {event.meet_url ? (
          <a
            href={event.meet_url}
            target="_blank"
            rel="noreferrer noopener"
            className="btn-primary mt-4 inline-block"
          >
            Görüşə qoşul (Meet)
          </a>
        ) : null}
        <div className="flex justify-between items-center mt-4 gap-2">
          {canDelete ? (
            <button
              type="button"
              className="text-meta"
              style={{ color: 'var(--error-deep)' }}
              disabled={del.isPending}
              onClick={() => setConfirmingDelete(true)}
            >
              {del.isPending ? 'Silinir…' : 'Sil'}
            </button>
          ) : <span />}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* PRD §8.2 — EXDATE skip-this-occurrence (recurring events only) */}
            {canEdit && event.recurrence_rule ? (
              <button
                className="btn-outline"
                disabled={skipOccurrence.isPending}
                onClick={() => skipOccurrence.mutate()}
                title="Yalnız bu görüşü atla, seriyanı saxla"
              >
                {skipOccurrence.isPending ? 'Atılır…' : 'Bu görüşü atla'}
              </button>
            ) : null}
            {canEdit ? (
              <button className="btn-outline" onClick={onEdit}>Redaktə</button>
            ) : null}
            <button className="btn-outline" onClick={onClose}>Bağla</button>
          </div>
        </div>
        <ConfirmDialog
          open={confirmingDelete}
          title="Bu görüşü silmək istəyirsən?"
          body="Bu əməliyyat geri qaytarıla bilməz. Rekurrent seriya tamamilə silinəcək."
          confirmLabel="Sil"
          destructive
          busy={del.isPending}
          onConfirm={() => del.mutate()}
          onCancel={() => setConfirmingDelete(false)}
        />
      </div>
    </div>
  );
}

// --------- Create / Edit event modal (US-CAL-01..02 + edit) ---------
type CreateProps = {
  defaultDate: Date;
  userId: string;
  onClose: () => void;
  onCreated: () => void;
  /** When present, switches to edit mode: form pre-filled, mutation does UPDATE. */
  existingEvent?: CalEvent;
};

// Parse "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" back into the RecurFreq enum used by
// the form select. Mirror of buildRRule(); silently falls back to 'none'.
function parseRRule(rule: string | null): 'none' | 'DAILY' | 'WEEKDAYS' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' {
  if (!rule) return 'none';
  if (rule === 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR') return 'WEEKDAYS';
  const freq = rule.match(/FREQ=(\w+)/)?.[1];
  if (freq === 'DAILY' || freq === 'WEEKLY' || freq === 'MONTHLY' || freq === 'YEARLY') return freq;
  return 'none';
}
// RFC 5545 recurrence options (§8.2 — recurrence_rule field)
type RecurFreq = 'none' | 'DAILY' | 'WEEKDAYS' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

const RECUR_LABELS: Record<RecurFreq, string> = {
  none: 'Təkrarlanmır',
  DAILY: 'Hər gün',
  WEEKDAYS: 'İş günləri (B.e.–C.)',
  WEEKLY: 'Hər həftə',
  MONTHLY: 'Hər ay',
  YEARLY: 'Hər il',
};

function buildRRule(freq: RecurFreq): string | null {
  if (freq === 'none') return null;
  if (freq === 'WEEKDAYS') return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
  return `FREQ=${freq}`;
}

function CreateEventModal({ defaultDate, userId, onClose, onCreated, existingEvent }: CreateProps) {
  const isEdit = !!existingEvent;
  const defaultDateStr = defaultDate.toISOString().slice(0, 10);
  const [title, setTitle] = useState(existingEvent?.title ?? '');
  const [dateStr, setDateStr] = useState(
    existingEvent ? new Date(existingEvent.starts_at).toISOString().slice(0, 10) : defaultDateStr,
  );
  const [startTime, setStartTime] = useState(
    existingEvent ? new Date(existingEvent.starts_at).toISOString().slice(11, 16) : '10:00',
  );
  const [endTime, setEndTime] = useState(
    existingEvent ? new Date(existingEvent.ends_at).toISOString().slice(11, 16) : '11:00',
  );
  const [location, setLocation] = useState(existingEvent?.location ?? '');
  const [meetUrl, setMeetUrl] = useState(existingEvent?.meet_url ?? '');
  const [externalEmails, setExternalEmails] = useState((existingEvent?.external_emails ?? []).join(', '));
  const [allDay, setAllDay] = useState(existingEvent?.all_day ?? false);
  const [recur, setRecur] = useState<RecurFreq>(parseRRule(existingEvent?.recurrence_rule ?? null));

  // PRD §8.2 — proactive conflict detection: warn (but don't block) if the
  // proposed time overlaps with the organizer's own events.
  const [conflicts, setConflicts] = useState<Array<{ id: string; title: string; starts_at: string; ends_at: string }>>([]);
  useEffect(() => {
    if (!dateStr || allDay || !userId) {
      setConflicts([]);
      return;
    }
    const startsAt = `${dateStr}T${startTime}:00`;
    const endsAt = `${dateStr}T${endTime}:00`;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('calendar_events')
        .select('id, title, starts_at, ends_at')
        .eq('organizer_id', userId)
        // Overlap = start < other.end AND end > other.start
        .lt('starts_at', endsAt)
        .gt('ends_at', startsAt)
        .limit(10);
      if (cancelled) return;
      // Exclude the event being edited (if any)
      const filtered = (data ?? []).filter((c) => c.id !== existingEvent?.id);
      setConflicts(filtered);
    })();
    return () => { cancelled = true; };
  }, [dateStr, startTime, endTime, allDay, userId, existingEvent?.id]);

  const create = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error('Başlıq tələb olunur');
      const startsAt = allDay ? `${dateStr}T00:00:00` : `${dateStr}T${startTime}:00`;
      const endsAt = allDay ? `${dateStr}T23:59:59` : `${dateStr}T${endTime}:00`;
      const extEmails = externalEmails
        .split(/[,\s]+/)
        .map((e) => e.trim())
        .filter(Boolean);
      const payload = {
        title: title.trim(),
        starts_at: startsAt,
        ends_at: endsAt,
        all_day: allDay,
        location: location.trim() || null,
        meet_url: meetUrl.trim() || null,
        recurrence_rule: buildRRule(recur),
        external_emails: extEmails.length ? extEmails : null,
      };

      if (isEdit && existingEvent) {
        // Edit mode: UPDATE the existing row (preserves UID/ATTENDEE continuity)
        const { error } = await supabase
          .from('calendar_events')
          .update(payload)
          .eq('id', existingEvent.id);
        if (error) throw error;
      } else {
        // Create mode: INSERT a new row
        const { error } = await supabase.from('calendar_events').insert({
          ...payload,
          organizer_id: userId,
          attendees: [userId],
        });
        if (error) throw error;
      }

      // Send .ics to external emails (§8.2): trigger downloadable .ics file
      // (with ATTENDEE lines) AND open mailto so user can attach + send.
      if (extEmails.length && title.trim()) {
        const icsBody = buildIcs({
          title: title.trim(),
          startsAt,
          endsAt,
          location: location.trim(),
          meetUrl: meetUrl.trim(),
          rrule: buildRRule(recur),
          organizerEmail: undefined, // organizer is internal — webcal/mailto field
          attendeeEmails: extEmails,
        });
        // 1. Download as proper .ics file
        const blob = new Blob([icsBody], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.trim().replace(/[^\p{L}\p{N}_-]+/gu, '_')}.ics`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        // 2. Also pop the mailto so user can finish the invite
        const mailto = `mailto:${extEmails.join(',')}?subject=${encodeURIComponent(title.trim())}&body=${encodeURIComponent('Görüş dəvəti — yüklənmiş .ics faylını əlavə edin.')}`;
        window.open(mailto);
      }
    },
    onSuccess: onCreated,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
        className="card w-full max-w-lg"
        style={{ padding: 24 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
      >
        <h2 className="text-h2 mb-4">{isEdit ? 'Görüşü redaktə et' : 'Yeni görüş'}</h2>

        <div className="space-y-3">
          <Field label="Başlıq" required>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
          </Field>

          <label className="flex items-center gap-2 text-body cursor-pointer">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            Bütün gün
          </label>

          <div className="grid grid-cols-3 gap-2">
            <Field label="Tarix" required>
              <input type="date" className="input" value={dateStr} onChange={(e) => setDateStr(e.target.value)} required />
            </Field>
            {!allDay ? (
              <>
                <Field label="Başlama">
                  <input type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </Field>
                <Field label="Bitmə">
                  <input type="time" className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </Field>
              </>
            ) : null}
          </div>

          <Field label="Yer (könüllü)">
            <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ünvan və ya link…" />
          </Field>

          <Field label="Google Meet linki (könüllü)">
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={meetUrl}
                onChange={(e) => setMeetUrl(e.target.value)}
                placeholder="meet.google.com/xxx-xxxx-xxx"
              />
              <button
                type="button"
                className="btn-outline shrink-0"
                onClick={() => window.open('https://meet.new', '_blank')}
              >
                Meet yarat
              </button>
            </div>
          </Field>

          <Field label="Xarici iştirakçılar (e-poçt, vergüllə)">
            <input
              className="input"
              value={externalEmails}
              onChange={(e) => setExternalEmails(e.target.value)}
              placeholder="ad@firma.com, ad2@firma.com"
            />
          </Field>

          {/* Recurrence — RFC 5545 (PRD §8.2 recurrence_rule field) */}
          <Field label="Təkrarlama">
            <select
              className="input"
              value={recur}
              onChange={(e) => setRecur(e.target.value as RecurFreq)}
            >
              {(Object.keys(RECUR_LABELS) as RecurFreq[]).map((k) => (
                <option key={k} value={k}>{RECUR_LABELS[k]}</option>
              ))}
            </select>
          </Field>

          {recur !== 'none' ? (
            <div
              className="rounded-card px-3 py-2 text-meta flex items-center gap-2"
              style={{ background: 'var(--brand-glow-sm)', border: '1px solid var(--brand-glow-xl)', color: 'var(--brand-text)' }}
            >
              <span style={{ fontSize: 14 }}>↻</span>
              <span>{RECUR_LABELS[recur]} · RFC 5545: <code style={{ fontSize: 11, opacity: 0.8 }}>{buildRRule(recur)}</code></span>
            </div>
          ) : null}

          {/* PRD §8.2 — overlap warning (organizer's own events) */}
          {conflicts.length > 0 ? (
            <div
              className="rounded-card px-3 py-2 text-meta"
              style={{
                background: 'var(--warning-bg, #fff3d6)',
                border: '1px solid var(--warning, #c47d00)',
                color: 'var(--ink)',
              }}
            >
              <div className="font-medium mb-1">⚠ Bu vaxt başqa görüşlərlə üst-üstə düşür:</div>
              <ul style={{ fontSize: 12 }}>
                {conflicts.slice(0, 3).map((c) => (
                  <li key={c.id}>• {c.title} ({fmtTime(c.starts_at)}–{fmtTime(c.ends_at)})</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {create.error ? (
          <p className="text-meta mt-3" style={{ color: 'var(--error-deep)' }}>
            {(create.error as Error).message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn-outline" onClick={onClose} disabled={create.isPending}>Geri</button>
          <button type="submit" className="btn-primary" disabled={create.isPending || !title.trim()}>
            {create.isPending ? (isEdit ? 'Yenilənir…' : 'Yaradılır…') : isEdit ? 'Yenilə' : 'Yarat'}
          </button>
        </div>
      </form>
    </div>
  );
}

function rruleLabel(rule: string): string {
  if (rule === 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR') return 'İş günləri (B.e.–C.)';
  if (rule.startsWith('FREQ=DAILY')) return 'Hər gün';
  if (rule.startsWith('FREQ=WEEKLY')) return 'Hər həftə';
  if (rule.startsWith('FREQ=MONTHLY')) return 'Hər ay';
  if (rule.startsWith('FREQ=YEARLY')) return 'Hər il';
  return rule;
}

function buildIcs(opts: {
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  meetUrl: string;
  rrule?: string | null;
  organizerEmail?: string;
  attendeeEmails?: string[];
}): string {
  const fmt = (s: string) => s.replace(/[-:]/g, '').replace('T', 'T').slice(0, 15) + 'Z';
  // RFC 5545 line-folding: keep escape simple; ATTENDEE per external email.
  const escapeText = (t: string) => t.replace(/[\\;,\n]/g, (m) => ({ '\\': '\\\\', ';': '\\;', ',': '\\,', '\n': '\\n' }[m] ?? m));
  const attendeeLines = (opts.attendeeEmails ?? [])
    .filter((e) => e.includes('@'))
    .map((e) => `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=${escapeText(e)}:mailto:${e}`);
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}@reflect.studio`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Reflect Architects OS//AZ//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${fmt(new Date().toISOString())}`,
    `SUMMARY:${escapeText(opts.title)}`,
    `DTSTART:${fmt(opts.startsAt)}`,
    `DTEND:${fmt(opts.endsAt)}`,
    opts.rrule ? `RRULE:${opts.rrule}` : null,
    opts.location ? `LOCATION:${escapeText(opts.location)}` : null,
    opts.meetUrl ? `URL:${opts.meetUrl}` : null,
    opts.organizerEmail ? `ORGANIZER:mailto:${opts.organizerEmail}` : null,
    ...attendeeLines,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
        {label}{required ? <span style={{ color: 'var(--error-deep)' }}> *</span> : null}
      </span>
      {children}
    </label>
  );
}

// PRD §8.2 — internal attendees inline editor: chip per profile + add dropdown
function EventInternalAttendeesEditor({ eventId, initial }: { eventId: string; initial: string[] }) {
  const qc = useQueryClient();
  const [ids, setIds] = useState(initial);
  useEffect(() => { setIds(initial); }, [initial]);
  const profiles = useQuery({
    queryKey: ['profiles', 'attendee-pick'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('is_active', true)
        .order('full_name');
      return (data ?? []) as Array<{ id: string; full_name: string | null }>;
    },
  });
  const profileMap = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name ?? p.id.slice(0, 8)]));
  const candidates = (profiles.data ?? []).filter((p) => !ids.includes(p.id));

  async function persist(next: string[]) {
    setIds(next);
    await supabase
      .from('calendar_events')
      .update({ attendees: next })
      .eq('id', eventId);
    qc.invalidateQueries({ queryKey: ['calendar'] });
  }

  return (
    <div className="mt-2 flex items-center gap-1 flex-wrap text-body">
      <span>👥</span>
      {ids.map((id) => (
        <span
          key={id}
          className="chip flex items-center gap-1"
          style={{ background: 'var(--surface-mist)', fontSize: 11 }}
        >
          {profileMap.get(id) ?? id.slice(0, 8)}
          <button
            type="button"
            onClick={() => persist(ids.filter((x) => x !== id))}
            style={{ color: 'var(--text-muted)', opacity: 0.6, fontSize: 11 }}
            title="Çıxar"
          >
            ×
          </button>
        </span>
      ))}
      {candidates.length > 0 ? (
        <select
          className="input"
          style={{ height: 22, fontSize: 11, padding: '0 4px' }}
          value=""
          onChange={(e) => {
            if (e.target.value) {
              persist([...ids, e.target.value]);
              e.target.value = '';
            }
          }}
        >
          <option value="">+ İştirakçı</option>
          {candidates.map((p) => (
            <option key={p.id} value={p.id}>{p.full_name ?? p.id.slice(0, 8)}</option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

// PRD §8.2 — external attendees inline editor: chip list with × + email add input
function EventExternalEmailsEditor({ eventId, initial }: { eventId: string; initial: string[] }) {
  const qc = useQueryClient();
  const [emails, setEmails] = useState(initial);
  const [draft, setDraft] = useState('');
  useEffect(() => { setEmails(initial); }, [initial]);

  async function persist(next: string[]) {
    setEmails(next);
    await supabase
      .from('calendar_events')
      .update({ external_emails: next.length ? next : null })
      .eq('id', eventId);
    qc.invalidateQueries({ queryKey: ['calendar'] });
  }

  function add() {
    const v = draft.trim().toLowerCase();
    if (!v || !v.includes('@') || emails.includes(v)) { setDraft(''); return; }
    void persist([...emails, v]);
    setDraft('');
  }

  return (
    <div className="mt-2 flex items-center gap-1 flex-wrap text-body">
      <span>📧</span>
      {emails.map((e) => (
        <span
          key={e}
          className="chip flex items-center gap-1"
          style={{ background: 'var(--surface-mist)', fontSize: 11 }}
        >
          {e}
          <button
            type="button"
            onClick={() => persist(emails.filter((x) => x !== e))}
            style={{ color: 'var(--text-muted)', opacity: 0.6, fontSize: 11 }}
            title="Çıxar"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="email"
        className="input"
        style={{ height: 22, fontSize: 11, width: 160 }}
        placeholder="+ ad@firma.com"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); add(); }
          if (e.key === ',') { e.preventDefault(); add(); }
        }}
        onBlur={() => draft.trim() && add()}
      />
    </div>
  );
}

// PRD §UX — inline edit for event start/end times (date + two times).
// Click anywhere on the time line to edit; Esc cancels.
function EventTimeInline({ event }: { event: CalEvent }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const initialDate = event.starts_at.slice(0, 10);
  const initialStart = event.starts_at.slice(11, 16);
  const initialEnd = event.ends_at.slice(11, 16);
  const [date, setDate] = useState(initialDate);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!editing) {
      setDate(initialDate);
      setStart(initialStart);
      setEnd(initialEnd);
    }
  }, [editing, initialDate, initialStart, initialEnd]);

  async function save() {
    const startsAt = `${date}T${start}:00`;
    const endsAt = `${date}T${end}:00`;
    setSaving(true);
    await supabase
      .from('calendar_events')
      .update({ starts_at: startsAt, ends_at: endsAt })
      .eq('id', event.id);
    setSaving(false);
    qc.invalidateQueries({ queryKey: ['calendar'] });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-1 mb-2 text-meta">
        <input type="date" className="input" style={{ height: 28, fontSize: 12 }} value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="time" className="input" style={{ height: 28, fontSize: 12, width: 90 }} value={start} onChange={(e) => setStart(e.target.value)} />
        <span style={{ color: 'var(--text-muted)' }}>–</span>
        <input type="time" className="input" style={{ height: 28, fontSize: 12, width: 90 }} value={end} onChange={(e) => setEnd(e.target.value)} />
        <button type="button" className="chip" style={{ color: 'var(--brand-text)', fontSize: 11 }} disabled={saving} onClick={save}>
          {saving ? '…' : '✓'}
        </button>
        <button type="button" className="chip" onClick={() => setEditing(false)} style={{ fontSize: 11 }}>×</button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="text-meta text-left hover:bg-surface-mist px-1 -mx-1 rounded-btn"
      style={{ color: 'var(--text-muted)' }}
      onClick={() => setEditing(true)}
      title="Vaxtı dəyişdirmək üçün klik"
    >
      {new Date(event.starts_at).toLocaleDateString('az-AZ', { timeZone: 'Asia/Baku', weekday: 'long', day: 'numeric', month: 'long' })}
      {' '}{fmtTime(event.starts_at)} – {fmtTime(event.ends_at)}
    </button>
  );
}

// PRD §UX — inline edit for a single calendar_events field (title or location).
// Click-to-edit; Enter saves, Esc cancels. Empty location → clears column.
function EventFieldInline({
  eventId,
  field,
  initial,
  as,
}: {
  eventId: string;
  field: 'title' | 'location' | 'meet_url';
  initial: string;
  as: 'title' | 'location' | 'meet_url';
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!editing) setVal(initial); }, [initial, editing]);

  async function save() {
    const trimmed = val.trim();
    if (trimmed === initial) { setEditing(false); return; }
    if (field === 'title' && !trimmed) { setEditing(false); setVal(initial); return; }
    setSaving(true);
    await supabase
      .from('calendar_events')
      .update({ [field]: trimmed || null })
      .eq('id', eventId);
    setSaving(false);
    qc.invalidateQueries({ queryKey: ['calendar'] });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className={as === 'title' ? 'mb-2 flex items-center gap-1' : 'mt-2 flex items-center gap-1'}>
        <input
          autoFocus
          className="input flex-1"
          style={as === 'title' ? { fontSize: 20, fontWeight: 700, height: 32 } : { fontSize: 14, height: 28 }}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') { setVal(initial); setEditing(false); }
          }}
          placeholder={as === 'location' ? 'Ünvan / link…' : undefined}
        />
        <button type="button" className="chip" disabled={saving} onClick={save} style={{ fontSize: 11, color: 'var(--brand-text)' }}>
          {saving ? '…' : '✓'}
        </button>
        <button type="button" className="chip" onClick={() => { setVal(initial); setEditing(false); }} style={{ fontSize: 11 }}>×</button>
      </div>
    );
  }

  if (as === 'title') {
    return (
      <button
        type="button"
        className="text-h2 mb-2 text-left hover:opacity-80"
        style={{ display: 'block', width: '100%' }}
        onClick={() => setEditing(true)}
        title="Başlığı dəyişdirmək üçün klik"
      >
        {initial}
      </button>
    );
  }
  if (as === 'meet_url') {
    return (
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          className="text-body text-left hover:opacity-80"
          style={{ color: initial ? 'var(--brand-text)' : 'var(--text-muted)', fontStyle: initial ? 'normal' : 'italic' }}
          onClick={() => setEditing(true)}
          title="Görüş linkini dəyişdir"
        >
          📹 {initial || '+ Görüş linki əlavə et'}
        </button>
        {!initial ? (
          // PRD §8.2 — "Button opens https://meet.new; user pastes link to event"
          // Open in a new tab so the user can grab the meet link, then paste it.
          <a
            href="https://meet.new"
            target="_blank"
            rel="noreferrer noopener"
            className="chip"
            style={{ fontSize: 11, color: 'var(--brand-text)' }}
            title="meet.new açıb link yarat, sonra yapışdır"
          >
            meet.new aç →
          </a>
        ) : null}
      </div>
    );
  }
  // location
  return (
    <button
      type="button"
      className="mt-2 text-body text-left hover:opacity-80"
      style={{ color: initial ? 'var(--text)' : 'var(--text-muted)', fontStyle: initial ? 'normal' : 'italic' }}
      onClick={() => setEditing(true)}
      title="Yeri dəyişdirmək üçün klik"
    >
      📍 {initial || '+ Yer əlavə et'}
    </button>
  );
}
