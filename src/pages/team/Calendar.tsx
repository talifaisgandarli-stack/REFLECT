/**
 * Calendar — US-CAL-01..03, §8.2.
 * Month / Week / Day grid views (no Google API; .ics via mailto).
 * Event creation: internal attendees + external_emails + recurrence_rule.
 * meet.new integration: opens tab, user pastes URL back.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHead } from '@/components/PageHead';
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
const MONTH_NAMES = ['Yanvar','Fevral','Mart','Aprel','May','İyun','İyul','Avqust','Sentyabr','Oktyabr','Noyabr','Dekabr'];
const WEEKDAY_SHORT = ['B.e.','Ç.a.','Ç.','C.a.','C.','Ş.','B.'];

export function CalendarPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const [cursor, setCursor] = useState(() => new Date());
  const [creating, setCreating] = useState(false);
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

  const { data: events = [] } = useQuery({
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

  function navigate(dir: -1 | 1) {
    const d = new Date(cursor);
    if (view === 'month') d.setMonth(d.getMonth() + dir);
    else if (view === 'week') d.setDate(d.getDate() + 7 * dir);
    else d.setDate(d.getDate() + dir);
    setCursor(d);
  }

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
              {(['month', 'week', 'day'] as const).map((v) => (
                <button
                  key={v}
                  className="chip"
                  style={{
                    background: view === v ? 'var(--brand-action)' : 'var(--surface-mist)',
                    color: view === v ? 'var(--ink)' : 'var(--text-muted)',
                  }}
                  onClick={() => setView(v)}
                >
                  {v === 'month' ? 'Ay' : v === 'week' ? 'Həftə' : 'Gün'}
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
      <div className="flex items-center gap-3 mb-4">
        <button className="btn-outline px-3 py-1" onClick={() => navigate(-1)}>‹</button>
        <button
          className="chip"
          style={{ background: 'var(--surface-mist)', color: 'var(--text-muted)' }}
          onClick={() => setCursor(new Date())}
        >
          Bu gün
        </button>
        <button className="btn-outline px-3 py-1" onClick={() => navigate(1)}>›</button>
        <span className="text-h3 ml-2">{headerLabel}</span>
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
                  {dayEvents.slice(0, 2).map((ev) => (
                    <div
                      key={ev.id}
                      className="truncate text-tiny px-1 py-0.5 rounded mb-0.5"
                      style={{
                        background: 'var(--brand-glow-xl)',
                        color: 'var(--brand-text)',
                        fontSize: 10,
                      }}
                      onClick={(e) => { e.stopPropagation(); setSelected(ev); }}
                    >
                      {ev.recurrence_rule ? '↻ ' : ''}{ev.title}
                    </div>
                  ))}
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
                  {dayEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="rounded p-1.5 mb-1 cursor-pointer"
                      style={{ background: 'var(--brand-glow-lg)', color: 'var(--brand-text)' }}
                      onClick={() => setSelected(ev)}
                    >
                      <div className="font-medium truncate" style={{ fontSize: 12 }}>{ev.title}</div>
                      <div style={{ fontSize: 11, opacity: 0.75 }}>{fmtTime(ev.starts_at)}</div>
                    </div>
                  ))}
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
              {eventsForDay(cursor).map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-card p-3 cursor-pointer hover:opacity-80"
                  style={{ background: 'var(--surface-mist)', border: '1px solid var(--line-soft)' }}
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
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {/* Event detail modal */}
      {selected ? (
        <EventModal event={selected} onClose={() => setSelected(null)} />
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
    </>
  );
}

// --------- Event detail modal ---------
function EventModal({ event, onClose }: { event: CalEvent; onClose: () => void }) {
  const qc = useQueryClient();
  const { profile, isAdmin } = useAuth();
  const canDelete = isAdmin || event.organizer_id === profile?.id;
  const del = useMutation({
    mutationFn: async () => {
      if (!confirm('Bu görüşü silmək istədiyinə əminsənmi?')) throw new Error('aborted');
      const { error } = await supabase.from('calendar_events').delete().eq('id', event.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] });
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
        <h2 className="text-h2 mb-2">{event.title}</h2>
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
          {new Date(event.starts_at).toLocaleDateString('az-AZ', { timeZone: 'Asia/Baku', weekday: 'long', day: 'numeric', month: 'long' })}
          {' '}{fmtTime(event.starts_at)} – {fmtTime(event.ends_at)}
        </p>
        {event.location ? <p className="mt-2 text-body">📍 {event.location}</p> : null}
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
              onClick={() => del.mutate()}
            >
              {del.isPending ? 'Silinir…' : 'Sil'}
            </button>
          ) : <span />}
          <button className="btn-outline" onClick={onClose}>Bağla</button>
        </div>
      </div>
    </div>
  );
}

// --------- Create event modal (US-CAL-01..02) ---------
type CreateProps = {
  defaultDate: Date;
  userId: string;
  onClose: () => void;
  onCreated: () => void;
};
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

function CreateEventModal({ defaultDate, userId, onClose, onCreated }: CreateProps) {
  const defaultDateStr = defaultDate.toISOString().slice(0, 10);
  const [title, setTitle] = useState('');
  const [dateStr, setDateStr] = useState(defaultDateStr);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [location, setLocation] = useState('');
  const [meetUrl, setMeetUrl] = useState('');
  const [externalEmails, setExternalEmails] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [recur, setRecur] = useState<RecurFreq>('none');

  const create = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error('Başlıq tələb olunur');
      const startsAt = allDay ? `${dateStr}T00:00:00` : `${dateStr}T${startTime}:00`;
      const endsAt = allDay ? `${dateStr}T23:59:59` : `${dateStr}T${endTime}:00`;
      const extEmails = externalEmails
        .split(/[,\s]+/)
        .map((e) => e.trim())
        .filter(Boolean);
      const { error } = await supabase.from('calendar_events').insert({
        title: title.trim(),
        starts_at: startsAt,
        ends_at: endsAt,
        all_day: allDay,
        location: location.trim() || null,
        meet_url: meetUrl.trim() || null,
        recurrence_rule: buildRRule(recur),
        organizer_id: userId,
        attendees: [userId],
        external_emails: extEmails.length ? extEmails : null,
      });
      if (error) throw error;

      // Send .ics to external emails via mailto (§8.2 v1 approach)
      if (extEmails.length && title.trim()) {
        const icsBody = buildIcs({ title: title.trim(), startsAt, endsAt, location: location.trim(), meetUrl: meetUrl.trim(), rrule: buildRRule(recur) });
        const mailto = `mailto:${extEmails.join(',')}?subject=${encodeURIComponent(title.trim())}&body=${encodeURIComponent('Dəvət təqvim faylı (ICS) əlavə edilib.\n\n' + icsBody)}`;
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
        <h2 className="text-h2 mb-4">Yeni görüş</h2>

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
        </div>

        {create.error ? (
          <p className="text-meta mt-3" style={{ color: 'var(--error-deep)' }}>
            {(create.error as Error).message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn-outline" onClick={onClose} disabled={create.isPending}>Geri</button>
          <button type="submit" className="btn-primary" disabled={create.isPending || !title.trim()}>
            {create.isPending ? 'Yaradılır…' : 'Yarat'}
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

function buildIcs(opts: { title: string; startsAt: string; endsAt: string; location: string; meetUrl: string; rrule?: string | null }): string {
  const fmt = (s: string) => s.replace(/[-:]/g, '').replace('T', 'T').slice(0, 15) + 'Z';
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
    `SUMMARY:${opts.title}`,
    `DTSTART:${fmt(opts.startsAt)}`,
    `DTEND:${fmt(opts.endsAt)}`,
    opts.rrule ? `RRULE:${opts.rrule}` : null,
    opts.location ? `LOCATION:${opts.location}` : null,
    opts.meetUrl ? `URL:${opts.meetUrl}` : null,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\n');
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
