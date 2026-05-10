/**
 * Təqvim — Calendar page (PRD §8.2, US-CAL-01..03)
 * Views: Month / Week / Day — built from scratch, no external calendar lib.
 * Locale: Azerbaijani, timezone Asia/Baku.
 */

import { useState, useRef } from 'react';
import { PageHead } from '@/components/PageHead';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { TZ } from '@/lib/format';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Baz', 'B.e', 'Ç.a', 'Çər', 'C.a', 'Cüm', 'Şən']; // Sun=0..Sat=6
// Week columns in Week/Day view start Mon (1)
const WEEK_COLS = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun → JS getDay()

const MONTH_NAMES_AZ = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun',
  'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr',
];

const HOUR_START = 8;
const HOUR_END = 20; // 08:00 – 20:00 inclusive labels
const HOUR_COUNT = HOUR_END - HOUR_START; // 12 slots
const PX_PER_HOUR = 48;

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  recurrence_rule?: string;
  location?: string;
  meet_url?: string;
  organizer_id?: string;
  attendees?: string[];
  external_emails?: string[];
  project_id?: string;
  created_at: string;
}

interface EventForm {
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string;
  meet_url: string;
  external_emails: string; // comma-separated
  recurrence_rule: string;
}

type ViewMode = 'month' | 'week' | 'day';

// ─── Baku timezone helpers ────────────────────────────────────────────────────

function bakuParts(date: Date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),  // 1-based
    day: parseInt(get('day'), 10),
    hour: parseInt(get('hour'), 10),
    minute: parseInt(get('minute'), 10),
  };
}

function bakuDayOfWeek(date: Date): number {
  // Returns 0=Sun..6=Sat evaluated in Asia/Baku
  const dayName = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'short',
  }).format(date);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[dayName] ?? 0;
}

/** Returns midnight 00:00 Asia/Baku for a given year/month/day as a Date (UTC). */
function bakuDate(year: number, month: number, day: number): Date {
  // Baku is UTC+4, no DST since 2016
  const isoStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00+04:00`;
  return new Date(isoStr);
}

/** Days in a month in Baku calendar. */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate(); // JS month is 1-based here
}

/**
 * Build 6×7 grid (cells) for a month view.
 * Each cell: { year, month, day, currentMonth: bool }
 */
function buildMonthGrid(year: number, month: number) {
  const firstDay = bakuDate(year, month, 1);
  const firstDow = bakuDayOfWeek(firstDay); // 0=Sun
  // We want Mon as first column (col 0 = Mon → dow=1)
  // offset: how many empty cells before day 1
  const offset = (firstDow === 0 ? 6 : firstDow - 1); // Mon-first
  const total = daysInMonth(year, month);

  const cells: Array<{ year: number; month: number; day: number; currentMonth: boolean }> = [];

  // Fill previous month
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevTotal = daysInMonth(prevYear, prevMonth);
  for (let i = offset - 1; i >= 0; i--) {
    cells.push({ year: prevYear, month: prevMonth, day: prevTotal - i, currentMonth: false });
  }

  // Fill current month
  for (let d = 1; d <= total; d++) {
    cells.push({ year, month, day: d, currentMonth: true });
  }

  // Fill next month
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const needed = 42 - cells.length;
  for (let d = 1; d <= needed; d++) {
    cells.push({ year: nextYear, month: nextMonth, day: d, currentMonth: false });
  }

  return cells;
}

/** Return YYYY-MM-DD string for a given (year,month,day). */
function ymd(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Events whose date range overlaps a given calendar day (YYYY-MM-DD). */
function eventsOnDay(events: CalendarEvent[], dateStr: string): CalendarEvent[] {
  const d = new Date(dateStr + 'T00:00:00+04:00');
  const dEnd = new Date(dateStr + 'T23:59:59+04:00');
  return events.filter((e) => {
    const s = new Date(e.starts_at);
    const en = new Date(e.ends_at);
    return s <= dEnd && en >= d;
  });
}

/** Days of a given ISO week containing date, Mon-first (Baku) */
function weekDays(anchor: Date): Date[] {
  const { year, month, day } = bakuParts(anchor);
  const d = bakuDate(year, month, day);
  const dow = bakuDayOfWeek(d); // 0=Sun
  const monOffset = dow === 0 ? 6 : dow - 1;
  const monday = new Date(d.getTime() - monOffset * 86400000);
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * 86400000));
}

/** Local datetime-local input string from a Date, Baku-adjusted. */
function toDatetimeLocal(date: Date): string {
  const p = bakuParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** Convert datetime-local input value (treated as Baku time) to ISO UTC string. */
function fromDatetimeLocal(value: string): string {
  // value is "YYYY-MM-DDTHH:MM" — treat as Asia/Baku (+04:00)
  return new Date(value + ':00+04:00').toISOString();
}

// ─── ICS Generation ──────────────────────────────────────────────────────────

function generateICS(event: CalendarEvent): string {
  const uid = `${event.id}@reflect-architects`;
  const dtFormat = (iso: string, allDay: boolean) => {
    const d = new Date(iso);
    if (allDay) {
      const p = bakuParts(d);
      return `${p.year}${String(p.month).padStart(2, '0')}${String(p.day).padStart(2, '0')}`;
    }
    // UTC format
    return d.toISOString().replace(/[-:.]/g, '').replace('000Z', 'Z').slice(0, 15) + 'Z';
  };

  const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Reflect Architects OS//Təqvim//AZ',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)}Z`,
    event.all_day
      ? `DTSTART;VALUE=DATE:${dtFormat(event.starts_at, true)}`
      : `DTSTART:${dtFormat(event.starts_at, false)}`,
    event.all_day
      ? `DTEND;VALUE=DATE:${dtFormat(event.ends_at, true)}`
      : `DTEND:${dtFormat(event.ends_at, false)}`,
    `SUMMARY:${escape(event.title)}`,
    event.description ? `DESCRIPTION:${escape(event.description)}` : '',
    event.location ? `LOCATION:${escape(event.location)}` : '',
    event.meet_url ? `URL:${event.meet_url}` : '',
    event.recurrence_rule ? `RRULE:${event.recurrence_rule}` : '',
    ...(event.external_emails ?? []).map((e) => `ATTENDEE;RSVP=TRUE:mailto:${e}`),
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  return lines.join('\r\n');
}

function downloadICS(event: CalendarEvent) {
  const content = generateICS(event);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.title.replace(/[^a-zA-Z0-9]/g, '_')}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Event detail modal ───────────────────────────────────────────────────────

function EventDetailModal({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const fmt = (iso: string) => new Intl.DateTimeFormat('az-AZ', {
    timeZone: TZ, year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));

  const externalList = (event.external_emails ?? []).join(', ');
  const mailtoEmails = (event.external_emails ?? []).join(',');
  const mailtoSubject = encodeURIComponent(event.title);
  const mailtoBody = encodeURIComponent(
    `Görüş: ${event.title}\nBaşlanğıc: ${fmt(event.starts_at)}\nBitiş: ${fmt(event.ends_at)}${event.location ? `\nYer: ${event.location}` : ''}${event.meet_url ? `\nMeet: ${event.meet_url}` : ''}`
  );

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={event.title} onClick={onClose}>
      <div
        className="card modal-box"
        style={{ maxWidth: 480, width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-h2" style={{ color: 'var(--text)' }}>{event.title}</h2>
          <button className="btn-outline" style={{ padding: '4px 10px', fontSize: 13 }} onClick={onClose} aria-label="Bağla">✕</button>
        </div>

        <div className="text-body" style={{ color: 'var(--text-muted)', marginBottom: 8 }}>
          {event.all_day ? 'Bütün gün' : `${fmt(event.starts_at)} → ${fmt(event.ends_at)}`}
        </div>

        {event.location && (
          <div className="text-meta" style={{ color: 'var(--text-muted)', marginBottom: 6 }}>
            📍 {event.location}
          </div>
        )}

        {event.description && (
          <p className="text-body" style={{ marginBottom: 12 }}>{event.description}</p>
        )}

        {event.meet_url && (
          <a
            className="btn-primary"
            href={event.meet_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-block', marginBottom: 12 }}
          >
            Görüşə qoşul
          </a>
        )}

        {event.recurrence_rule && (
          <div className="chip" style={{ marginBottom: 12 }}>Təkrarlanan</div>
        )}

        {externalList && (
          <div className="text-meta" style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
            Xarici iştirakçılar: {externalList}
          </div>
        )}

        <div className="flex gap-2 flex-wrap mt-2">
          <button className="btn-outline" onClick={() => downloadICS(event)}>
            .ics yüklə
          </button>
          {mailtoEmails && (
            <a
              className="btn-outline"
              href={`mailto:${mailtoEmails}?subject=${mailtoSubject}&body=${mailtoBody}`}
              style={{ display: 'inline-block' }}
            >
              E-mail dəvət
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Event Create Modal ───────────────────────────────────────────────────────

function defaultForm(prefill?: { starts_at?: string; ends_at?: string }): EventForm {
  const now = new Date();
  const startDefault = prefill?.starts_at ?? toDatetimeLocal(now);
  const endDate = new Date(now.getTime() + 60 * 60 * 1000);
  const endDefault = prefill?.ends_at ?? toDatetimeLocal(endDate);
  return {
    title: '',
    description: '',
    starts_at: startDefault,
    ends_at: endDefault,
    all_day: false,
    location: '',
    meet_url: '',
    external_emails: '',
    recurrence_rule: '',
  };
}

function EventCreateModal({
  prefill,
  onClose,
  onCreated,
}: {
  prefill?: { starts_at?: string; ends_at?: string };
  onClose: () => void;
  onCreated: (event: CalendarEvent) => void;
}) {
  const [form, setForm] = useState<EventForm>(() => defaultForm(prefill));
  const [errors, setErrors] = useState<{ title?: string }>({});
  const [savedEvent, setSavedEvent] = useState<CalendarEvent | null>(null);
  const queryClient = useQueryClient();
  const { session } = useAuth();

  const mutation = useMutation({
    mutationFn: async (f: EventForm) => {
      const externalArr = f.external_emails
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        title: f.title.trim(),
        description: f.description.trim() || null,
        starts_at: fromDatetimeLocal(f.starts_at),
        ends_at: fromDatetimeLocal(f.ends_at),
        all_day: f.all_day,
        location: f.location.trim() || null,
        meet_url: f.meet_url.trim() || null,
        external_emails: externalArr.length > 0 ? externalArr : null,
        recurrence_rule: f.recurrence_rule.trim() || null,
        organizer_id: session?.userId ?? null,
        attendees: session?.userId ? [session.userId] : [],
      };

      const { data, error } = await supabase
        .from('calendar_events')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return data as CalendarEvent;
    },
    onSuccess: (ev) => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      setSavedEvent(ev);
      onCreated(ev);
    },
  });

  const validate = () => {
    const e: typeof errors = {};
    if (!form.title.trim()) e.title = 'Başlıq mütləqdir';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    mutation.mutate(form);
  };

  const set = <K extends keyof EventForm>(key: K, value: EventForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Yeni görüş" onClick={onClose}>
      <div
        className="card modal-box"
        style={{ maxWidth: 520, width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-h2" style={{ color: 'var(--text)' }}>
            {savedEvent ? 'Görüş yaradıldı' : 'Yeni Görüş'}
          </h2>
          <button className="btn-outline" style={{ padding: '4px 10px', fontSize: 13 }} onClick={onClose} aria-label="Bağla">✕</button>
        </div>

        {savedEvent ? (
          <div>
            <p className="text-body" style={{ marginBottom: 16, color: 'var(--text-muted)' }}>
              Görüş uğurla saxlanıldı.
            </p>
            <div className="flex gap-2 flex-wrap">
              <button className="btn-primary" onClick={() => downloadICS(savedEvent)}>
                .ics yüklə
              </button>
              {savedEvent.external_emails && savedEvent.external_emails.length > 0 && (
                <a
                  className="btn-outline"
                  href={`mailto:${savedEvent.external_emails.join(',')}?subject=${encodeURIComponent(savedEvent.title)}`}
                  style={{ display: 'inline-block' }}
                >
                  E-mail dəvət
                </a>
              )}
              <button className="btn-outline" onClick={onClose}>Bağla</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {/* Title */}
            <div style={{ marginBottom: 14 }}>
              <label className="text-meta" style={{ display: 'block', marginBottom: 4, color: 'var(--text-muted)' }}>
                Başlıq *
              </label>
              <input
                className="input"
                style={{ width: '100%' }}
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="Görüş başlığı"
                aria-required="true"
                aria-invalid={!!errors.title}
              />
              {errors.title && (
                <p className="text-tiny" style={{ color: '#EF4444', marginTop: 4 }}>{errors.title}</p>
              )}
            </div>

            {/* All-day */}
            <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                id="all_day"
                checked={form.all_day}
                onChange={(e) => set('all_day', e.target.checked)}
              />
              <label htmlFor="all_day" className="text-body" style={{ color: 'var(--text)' }}>
                Bütün gün
              </label>
            </div>

            {/* Starts / Ends */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label className="text-meta" style={{ display: 'block', marginBottom: 4, color: 'var(--text-muted)' }}>
                  Başlanğıc
                </label>
                <input
                  className="input"
                  type={form.all_day ? 'date' : 'datetime-local'}
                  style={{ width: '100%' }}
                  value={form.all_day ? form.starts_at.slice(0, 10) : form.starts_at}
                  onChange={(e) => set('starts_at', e.target.value)}
                />
              </div>
              <div>
                <label className="text-meta" style={{ display: 'block', marginBottom: 4, color: 'var(--text-muted)' }}>
                  Bitmə
                </label>
                <input
                  className="input"
                  type={form.all_day ? 'date' : 'datetime-local'}
                  style={{ width: '100%' }}
                  value={form.all_day ? form.ends_at.slice(0, 10) : form.ends_at}
                  onChange={(e) => set('ends_at', e.target.value)}
                />
              </div>
            </div>

            {/* Description */}
            <div style={{ marginBottom: 14 }}>
              <label className="text-meta" style={{ display: 'block', marginBottom: 4, color: 'var(--text-muted)' }}>
                Açıqlama
              </label>
              <textarea
                className="input"
                style={{ width: '100%', minHeight: 72, resize: 'vertical' }}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Əlavə məlumat..."
              />
            </div>

            {/* Location */}
            <div style={{ marginBottom: 14 }}>
              <label className="text-meta" style={{ display: 'block', marginBottom: 4, color: 'var(--text-muted)' }}>
                Yer
              </label>
              <input
                className="input"
                style={{ width: '100%' }}
                value={form.location}
                onChange={(e) => set('location', e.target.value)}
                placeholder="Ofis, ünvan..."
              />
            </div>

            {/* Meet URL */}
            <div style={{ marginBottom: 14 }}>
              <label className="text-meta" style={{ display: 'block', marginBottom: 4, color: 'var(--text-muted)' }}>
                Google Meet linki
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  style={{ flex: 1 }}
                  value={form.meet_url}
                  onChange={(e) => set('meet_url', e.target.value)}
                  placeholder="https://meet.google.com/..."
                />
                <button
                  type="button"
                  className="btn-outline"
                  style={{ whiteSpace: 'nowrap' }}
                  onClick={() => window.open('https://meet.new', '_blank', 'noopener,noreferrer')}
                  title="Meet yaratmaq üçün açır"
                >
                  Meet yarat
                </button>
              </div>
              <p className="text-tiny" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                "Meet yarat" düyməsi meet.new-u açır. Linki kopyalayıb buraya yapışdırın.
              </p>
            </div>

            {/* External emails */}
            <div style={{ marginBottom: 14 }}>
              <label className="text-meta" style={{ display: 'block', marginBottom: 4, color: 'var(--text-muted)' }}>
                Xarici iştirakçılar (e-mail, vergüllə)
              </label>
              <input
                className="input"
                style={{ width: '100%' }}
                value={form.external_emails}
                onChange={(e) => set('external_emails', e.target.value)}
                placeholder="ali@firma.az, veli@client.az"
              />
            </div>

            {/* Recurrence */}
            <div style={{ marginBottom: 20 }}>
              <label className="text-meta" style={{ display: 'block', marginBottom: 4, color: 'var(--text-muted)' }}>
                Təkrar (RFC 5545 RRULE)
              </label>
              <input
                className="input"
                style={{ width: '100%' }}
                value={form.recurrence_rule}
                onChange={(e) => set('recurrence_rule', e.target.value)}
                placeholder="FREQ=WEEKLY;BYDAY=MO"
              />
            </div>

            {mutation.isError && (
              <p className="text-meta" style={{ color: '#EF4444', marginBottom: 12 }}>
                Xəta baş verdi. Yenidən cəhd edin.
              </p>
            )}

            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-outline" onClick={onClose}>Ləğv et</button>
              <button type="submit" className="btn-primary" disabled={mutation.isPending}>
                {mutation.isPending ? 'Saxlanılır...' : 'Saxla'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Month View ───────────────────────────────────────────────────────────────

function MonthView({
  year,
  month,
  events,
  onDayClick,
  onEventClick,
}: {
  year: number;
  month: number;
  events: CalendarEvent[];
  onDayClick: (dateStr: string) => void;
  onEventClick: (ev: CalendarEvent) => void;
}) {
  const cells = buildMonthGrid(year, month);
  const todayStr = (() => {
    const p = bakuParts(new Date());
    return ymd(p.year, p.month, p.day);
  })();

  // Mon..Sun header
  const headerDays = [1, 2, 3, 4, 5, 6, 0].map((d) => DAY_NAMES[d]);

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Day name header */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7,1fr)',
        borderBottom: '1px solid var(--line)',
        background: 'var(--surface-mist)',
      }}>
        {headerDays.map((n) => (
          <div key={n} className="text-meta" style={{
            textAlign: 'center', padding: '8px 4px',
            color: 'var(--text-muted)', fontWeight: 600,
          }}>{n}</div>
        ))}
      </div>

      {/* Cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
        {cells.map((cell, idx) => {
          const dateStr = ymd(cell.year, cell.month, cell.day);
          const dayEvents = eventsOnDay(events, dateStr);
          const isToday = dateStr === todayStr;

          return (
            <div
              key={idx}
              onClick={() => onDayClick(dateStr)}
              style={{
                minHeight: 96,
                borderRight: (idx % 7) < 6 ? '1px solid var(--line-soft)' : 'none',
                borderBottom: idx < 35 ? '1px solid var(--line-soft)' : 'none',
                padding: '6px 6px 4px',
                background: cell.currentMonth ? 'var(--surface)' : 'var(--surface-mist)',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--brand-mist)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = cell.currentMonth ? 'var(--surface)' : 'var(--surface-mist)')}
            >
              {/* Day number */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 26, height: 26, borderRadius: '50%',
                background: isToday ? 'var(--brand-action)' : 'transparent',
                color: isToday ? 'var(--ink)' : cell.currentMonth ? 'var(--text)' : 'var(--text-muted)',
                fontWeight: isToday ? 700 : 400,
                fontSize: 13,
                marginBottom: 4,
              }}>
                {cell.day}
              </div>

              {/* Event chips */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {dayEvents.slice(0, 3).map((ev) => (
                  <button
                    key={ev.id}
                    onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                    className="chip-brand"
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontSize: 11, padding: '2px 5px', borderRadius: 4,
                      background: 'var(--brand-action)', color: 'var(--ink)',
                      border: 'none', cursor: 'pointer',
                    }}
                    title={ev.title}
                  >
                    {ev.title}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <span className="text-tiny" style={{ color: 'var(--text-muted)', fontSize: 10, paddingLeft: 4 }}>
                    +{dayEvents.length - 3} daha
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Time Grid (Week + Day shared) ───────────────────────────────────────────

function TimeGrid({
  days,
  events,
  onSlotClick,
  onEventClick,
}: {
  days: Date[];
  events: CalendarEvent[];
  onSlotClick: (dateStr: string, hour: number) => void;
  onEventClick: (ev: CalendarEvent) => void;
}) {
  const hours = Array.from({ length: HOUR_COUNT }, (_, i) => HOUR_START + i);

  // For each day, get events that span that day (time-based, non all-day)
  function dayEvents(d: Date): CalendarEvent[] {
    const p = bakuParts(d);
    const dateStr = ymd(p.year, p.month, p.day);
    return eventsOnDay(events, dateStr).filter((e) => !e.all_day);
  }

  function eventTop(ev: CalendarEvent): number {
    const start = bakuParts(new Date(ev.starts_at));
    const startH = Math.max(start.hour + start.minute / 60, HOUR_START);
    return (startH - HOUR_START) * PX_PER_HOUR;
  }

  function eventHeight(ev: CalendarEvent, dayDate: Date): number {
    const dayP = bakuParts(dayDate);
    const dayStart = bakuDate(dayP.year, dayP.month, dayP.day);
    const dayEndTime = dayStart.getTime() + 24 * 3600 * 1000;

    const evStart = Math.max(new Date(ev.starts_at).getTime(), dayStart.getTime() + (HOUR_START * 3600 * 1000));
    const evEnd = Math.min(new Date(ev.ends_at).getTime(), Math.min(dayEndTime, dayStart.getTime() + HOUR_END * 3600 * 1000));

    const durationH = Math.max((evEnd - evStart) / 3600000, 0.25);
    return durationH * PX_PER_HOUR;
  }

  const todayStr = (() => {
    const p = bakuParts(new Date());
    return ymd(p.year, p.month, p.day);
  })();

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `52px repeat(${days.length}, 1fr)`,
        borderBottom: '1px solid var(--line)',
        background: 'var(--surface-mist)',
        position: 'sticky', top: 0, zIndex: 2,
      }}>
        <div />
        {days.map((d, i) => {
          const p = bakuParts(d);
          const ds = ymd(p.year, p.month, p.day);
          const isToday = ds === todayStr;
          const dow = bakuDayOfWeek(d);
          return (
            <div key={i} style={{ textAlign: 'center', padding: '8px 4px' }}>
              <div className="text-meta" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                {DAY_NAMES[dow]}
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, borderRadius: '50%',
                background: isToday ? 'var(--brand-action)' : 'transparent',
                color: isToday ? 'var(--ink)' : 'var(--text)',
                fontWeight: isToday ? 700 : 400,
                fontSize: 14, margin: '0 auto',
              }}>
                {p.day}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time body */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `52px repeat(${days.length}, 1fr)`,
        overflowY: 'auto',
        maxHeight: 'calc(100vh - 260px)',
      }}>
        {/* Hour labels column */}
        <div style={{ position: 'relative' }}>
          {hours.map((h) => (
            <div key={h} style={{
              height: PX_PER_HOUR,
              display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
              paddingRight: 8, paddingTop: 4,
            }}>
              <span className="text-tiny" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                {String(h).padStart(2, '0')}:00
              </span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((d, di) => {
          const p = bakuParts(d);
          const dateStr = ymd(p.year, p.month, p.day);
          const devs = dayEvents(d);

          return (
            <div key={di} style={{ position: 'relative', borderLeft: '1px solid var(--line-soft)' }}>
              {/* Hour slots */}
              {hours.map((h) => (
                <div
                  key={h}
                  onClick={() => onSlotClick(dateStr, h)}
                  style={{
                    height: PX_PER_HOUR,
                    borderBottom: '1px solid var(--line-soft)',
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--brand-mist)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                />
              ))}

              {/* Events overlaid */}
              {devs.map((ev) => {
                const top = eventTop(ev);
                const height = eventHeight(ev, d);
                if (top >= HOUR_COUNT * PX_PER_HOUR || height <= 0) return null;
                return (
                  <button
                    key={ev.id}
                    onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                    style={{
                      position: 'absolute',
                      top,
                      left: 2,
                      right: 2,
                      height: Math.max(height, 20),
                      background: 'var(--brand-action)',
                      color: 'var(--ink)',
                      borderRadius: 4,
                      padding: '2px 5px',
                      fontSize: 11,
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      overflow: 'hidden',
                      zIndex: 1,
                      lineHeight: '1.3',
                    }}
                    title={ev.title}
                  >
                    {ev.title}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function CalendarPage() {
  const [view, setView] = useState<ViewMode>('month');

  // Navigate anchor: year+month for month view; any date for week/day
  const [anchor, setAnchor] = useState<Date>(() => new Date());

  const [showCreate, setShowCreate] = useState(false);
  const [createPrefill, setCreatePrefill] = useState<{ starts_at?: string; ends_at?: string } | undefined>();
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  // Derived view params
  const anchorBaku = bakuParts(anchor);

  // Fetch events: load a wide range covering the current view + surrounding period
  const rangeStart = (() => {
    if (view === 'month') return bakuDate(anchorBaku.year, anchorBaku.month, 1);
    if (view === 'week') {
      const wk = weekDays(anchor);
      return wk[0];
    }
    return bakuDate(anchorBaku.year, anchorBaku.month, anchorBaku.day);
  })();

  const rangeEnd = (() => {
    if (view === 'month') {
      const nm = anchorBaku.month === 12 ? 1 : anchorBaku.month + 1;
      const ny = anchorBaku.month === 12 ? anchorBaku.year + 1 : anchorBaku.year;
      return bakuDate(ny, nm, 1);
    }
    if (view === 'week') {
      const wk = weekDays(anchor);
      return new Date(wk[6].getTime() + 86400000);
    }
    return bakuDate(anchorBaku.year, anchorBaku.month, anchorBaku.day + 1);
  })();

  const { data: events = [], isLoading, isError } = useQuery<CalendarEvent[]>({
    queryKey: ['calendar', rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .lte('starts_at', rangeEnd.toISOString())
        .gte('ends_at', rangeStart.toISOString())
        .order('starts_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Navigation
  function prev() {
    setAnchor((a) => {
      if (view === 'month') {
        const p = bakuParts(a);
        const nm = p.month === 1 ? 12 : p.month - 1;
        const ny = p.month === 1 ? p.year - 1 : p.year;
        return bakuDate(ny, nm, 1);
      }
      if (view === 'week') return new Date(a.getTime() - 7 * 86400000);
      return new Date(a.getTime() - 86400000);
    });
  }

  function next() {
    setAnchor((a) => {
      if (view === 'month') {
        const p = bakuParts(a);
        const nm = p.month === 12 ? 1 : p.month + 1;
        const ny = p.month === 12 ? p.year + 1 : p.year;
        return bakuDate(ny, nm, 1);
      }
      if (view === 'week') return new Date(a.getTime() + 7 * 86400000);
      return new Date(a.getTime() + 86400000);
    });
  }

  // Title label
  const navLabel = (() => {
    if (view === 'month') return `${MONTH_NAMES_AZ[anchorBaku.month - 1]} ${anchorBaku.year}`;
    if (view === 'week') {
      const wk = weekDays(anchor);
      const sp = bakuParts(wk[0]);
      const ep = bakuParts(wk[6]);
      return `${sp.day} ${MONTH_NAMES_AZ[sp.month - 1]} – ${ep.day} ${MONTH_NAMES_AZ[ep.month - 1]} ${ep.year}`;
    }
    return `${anchorBaku.day} ${MONTH_NAMES_AZ[anchorBaku.month - 1]} ${anchorBaku.year}`;
  })();

  function openCreate(prefill?: { starts_at?: string; ends_at?: string }) {
    setCreatePrefill(prefill);
    setShowCreate(true);
  }

  function handleDayClick(dateStr: string) {
    const d = new Date(dateStr + 'T09:00:00+04:00');
    const e = new Date(dateStr + 'T10:00:00+04:00');
    openCreate({ starts_at: toDatetimeLocal(d), ends_at: toDatetimeLocal(e) });
  }

  function handleSlotClick(dateStr: string, hour: number) {
    const s = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00+04:00`);
    const e = new Date(`${dateStr}T${String(hour + 1).padStart(2, '0')}:00:00+04:00`);
    openCreate({ starts_at: toDatetimeLocal(s), ends_at: toDatetimeLocal(e) });
  }

  return (
    <>
      <PageHead
        title="Təqvim"
        actions={
          <>
            {/* View switcher */}
            {(['month', 'week', 'day'] as const).map((v) => (
              <button
                key={v}
                className={`chip ${view === v ? 'chip-brand' : ''}`}
                onClick={() => setView(v)}
                aria-pressed={view === v}
              >
                {v === 'month' ? 'Ay' : v === 'week' ? 'Həftə' : 'Gün'}
              </button>
            ))}
            <button className="btn-primary" onClick={() => openCreate()}>
              + Görüş
            </button>
          </>
        }
      />

      {/* Navigation bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 12,
      }}>
        <button className="btn-outline" onClick={prev} aria-label="Əvvəlki">‹</button>
        <span className="text-h3" style={{ minWidth: 220, textAlign: 'center', color: 'var(--text)' }}>
          {navLabel}
        </span>
        <button className="btn-outline" onClick={next} aria-label="Növbəti">›</button>
        <button
          className="btn-outline"
          style={{ marginLeft: 'auto', fontSize: 13 }}
          onClick={() => { setAnchor(new Date()); }}
        >
          Bu gün
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>Yüklənir...</p>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p className="text-meta" style={{ color: '#EF4444' }}>Xəta baş verdi. Yenidən cəhd edin.</p>
        </div>
      )}

      {/* Calendar body */}
      {!isLoading && !isError && (
        <>
          {view === 'month' && (
            <MonthView
              year={anchorBaku.year}
              month={anchorBaku.month}
              events={events}
              onDayClick={handleDayClick}
              onEventClick={setSelectedEvent}
            />
          )}

          {view === 'week' && (
            <TimeGrid
              days={weekDays(anchor)}
              events={events}
              onSlotClick={handleSlotClick}
              onEventClick={setSelectedEvent}
            />
          )}

          {view === 'day' && (
            <TimeGrid
              days={[anchor]}
              events={events}
              onSlotClick={handleSlotClick}
              onEventClick={setSelectedEvent}
            />
          )}
        </>
      )}

      {/* Event detail modal */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}

      {/* Event create modal */}
      {showCreate && (
        <EventCreateModal
          prefill={createPrefill}
          onClose={() => setShowCreate(false)}
          onCreated={() => {/* savedEvent shown inside modal */}}
        />
      )}

      {/* Inline modal styles */}
      <style>{`
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(14, 22, 17, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 50;
          padding: 16px;
        }
        .modal-box {
          max-height: 90vh;
          overflow-y: auto;
        }
      `}</style>
    </>
  );
}
