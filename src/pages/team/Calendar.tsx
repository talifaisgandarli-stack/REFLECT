import { useMemo, useState } from 'react';
import { PageHead } from '@/components/PageHead';
import {
  useActiveProfiles,
  useCalendarEvents,
  useCreateCalendarEvent,
  useDeleteCalendarEvent,
} from '@/lib/hooks';
import type { CalendarEvent, Profile } from '@/types/db';
import { useAuth } from '@/lib/store';

type View = 'month' | 'week' | 'day';

const DOW = ['B.', 'B.e', 'Ç.a', 'Ç.', 'C.a', 'C.', 'Ş.'];

export function CalendarPage() {
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState<Date>(startOfDay(new Date()));
  const [creating, setCreating] = useState<{ start: string; end: string } | false>(false);
  const [open, setOpen] = useState<CalendarEvent | null>(null);

  const range = useMemo(() => visibleRange(cursor, view), [cursor, view]);
  const { data: events = [], isLoading } = useCalendarEvents(range);

  const meta = useMemo(() => {
    if (view === 'month') {
      return new Intl.DateTimeFormat('az-AZ', { month: 'long', year: 'numeric' }).format(cursor);
    }
    if (view === 'week') {
      const start = startOfWeek(cursor);
      const end = addDays(start, 6);
      return `${fmtDate(start)} – ${fmtDate(end)}`;
    }
    return new Intl.DateTimeFormat('az-AZ', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    }).format(cursor);
  }, [cursor, view]);

  function shift(dir: -1 | 1) {
    if (view === 'month') {
      setCursor((c) => new Date(c.getFullYear(), c.getMonth() + dir, 1));
    } else if (view === 'week') {
      setCursor((c) => addDays(c, dir * 7));
    } else {
      setCursor((c) => addDays(c, dir));
    }
  }

  function onSlotClick(d: Date) {
    const start = new Date(d);
    start.setHours(9, 0, 0, 0);
    const end = new Date(d);
    end.setHours(10, 0, 0, 0);
    setCreating({ start: start.toISOString(), end: end.toISOString() });
  }

  return (
    <>
      <PageHead
        meta={meta}
        title="Təqvim"
        actions={
          <>
            <button className="btn-outline" onClick={() => shift(-1)} aria-label="Əvvəlki">
              ←
            </button>
            <button
              className="btn-outline"
              onClick={() => setCursor(startOfDay(new Date()))}
            >
              Bu gün
            </button>
            <button className="btn-outline" onClick={() => shift(1)} aria-label="Növbəti">
              →
            </button>
            {(['month', 'week', 'day'] as const).map((v) => (
              <button
                key={v}
                className={`chip ${view === v ? 'chip-brand' : ''}`}
                onClick={() => setView(v)}
              >
                {v === 'month' ? 'Ay' : v === 'week' ? 'Həftə' : 'Gün'}
              </button>
            ))}
            <button
              className="btn-primary"
              onClick={() => onSlotClick(cursor)}
            >
              + Görüş
            </button>
          </>
        }
      />

      {isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : view === 'month' ? (
        <MonthGrid cursor={cursor} events={events} onOpen={setOpen} onSlot={onSlotClick} />
      ) : view === 'week' ? (
        <DayList
          days={Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i))}
          events={events}
          onOpen={setOpen}
          onSlot={onSlotClick}
        />
      ) : (
        <DayList days={[startOfDay(cursor)]} events={events} onOpen={setOpen} onSlot={onSlotClick} />
      )}

      {creating ? (
        <CreateModal
          starts_at={creating.start}
          ends_at={creating.end}
          onClose={() => setCreating(false)}
        />
      ) : null}
      {open ? <EventModal event={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function MonthGrid({
  cursor,
  events,
  onOpen,
  onSlot,
}: {
  cursor: Date;
  events: CalendarEvent[];
  onOpen: (e: CalendarEvent) => void;
  onSlot: (d: Date) => void;
}) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const startDow = (first.getDay() + 6) % 7; // Mon=0
  const start = addDays(first, -startDow);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const today = startOfDay(new Date()).getTime();

  return (
    <div className="card p-0 overflow-hidden">
      <div className="grid grid-cols-7" style={{ background: 'var(--surface-mist)' }}>
        {DOW.map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-tiny uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = startOfDay(d).getTime() === today;
          const dayEvents = events.filter((e) => sameDay(new Date(e.starts_at), d));
          return (
            <button
              key={i}
              onClick={() => onSlot(d)}
              className="text-left p-1.5"
              style={{
                minHeight: 96,
                borderTop: '1px solid var(--line-soft)',
                borderRight: (i + 1) % 7 === 0 ? 'none' : '1px solid var(--line-soft)',
                background: inMonth ? 'transparent' : 'var(--surface-mist)',
              }}
            >
              <div
                className="text-meta mb-1"
                style={{
                  color: inMonth ? 'var(--text)' : 'var(--text-muted)',
                  fontWeight: isToday ? 700 : 400,
                  display: 'inline-block',
                  padding: isToday ? '0 6px' : 0,
                  borderRadius: isToday ? 999 : 0,
                  background: isToday ? 'var(--brand-action)' : 'transparent',
                }}
              >
                {d.getDate()}
              </div>
              <ul className="space-y-0.5">
                {dayEvents.slice(0, 3).map((e) => (
                  <li key={e.id}>
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onOpen(e);
                      }}
                      className="block w-full truncate text-left text-meta rounded-btn px-1.5 py-0.5"
                      style={{
                        background: 'var(--brand-action)',
                        color: 'var(--ink)',
                      }}
                    >
                      {fmtTime(new Date(e.starts_at))} {e.title}
                    </button>
                  </li>
                ))}
                {dayEvents.length > 3 ? (
                  <li
                    className="text-meta truncate px-1.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    +{dayEvents.length - 3} əlavə
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

function DayList({
  days,
  events,
  onOpen,
  onSlot,
}: {
  days: Date[];
  events: CalendarEvent[];
  onOpen: (e: CalendarEvent) => void;
  onSlot: (d: Date) => void;
}) {
  return (
    <div className="space-y-3">
      {days.map((d) => {
        const dayEvents = events
          .filter((e) => sameDay(new Date(e.starts_at), d))
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
        const isToday = startOfDay(d).getTime() === startOfDay(new Date()).getTime();
        return (
          <div key={d.toISOString()} className="card">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-h3">
                {new Intl.DateTimeFormat('az-AZ', {
                  weekday: 'long',
                  day: '2-digit',
                  month: 'short',
                }).format(d)}{' '}
                {isToday ? (
                  <span
                    className="ml-2 chip"
                    style={{ background: 'var(--brand-action)', color: 'var(--ink)' }}
                  >
                    Bu gün
                  </span>
                ) : null}
              </h3>
              <button className="btn-outline" onClick={() => onSlot(d)}>
                + Görüş
              </button>
            </div>
            {dayEvents.length === 0 ? (
              <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
                Görüş yoxdur.
              </p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {dayEvents.map((e) => (
                  <li key={e.id}>
                    <button
                      className="w-full text-left py-3 flex items-center gap-3"
                      onClick={() => onOpen(e)}
                    >
                      <div
                        className="text-meta shrink-0"
                        style={{
                          fontVariantNumeric: 'tabular-nums',
                          width: 80,
                          color: 'var(--text-muted)',
                        }}
                      >
                        {e.all_day
                          ? 'Bütün gün'
                          : `${fmtTime(new Date(e.starts_at))}–${fmtTime(new Date(e.ends_at))}`}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-body font-medium">{e.title}</div>
                        <div
                          className="text-meta truncate"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {e.location ?? '—'}
                          {e.meet_url ? ' · Meet' : ''}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CreateModal({
  starts_at,
  ends_at,
  onClose,
}: {
  starts_at: string;
  ends_at: string;
  onClose: () => void;
}) {
  const create = useCreateCalendarEvent();
  const { data: people = [] } = useActiveProfiles();
  const { profile } = useAuth();

  const [title, setTitle] = useState('');
  const [start, setStart] = useState(toLocalInput(starts_at));
  const [end, setEnd] = useState(toLocalInput(ends_at));
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [meetUrl, setMeetUrl] = useState('');
  const [recurrence, setRecurrence] = useState('');
  const [externalEmails, setExternalEmails] = useState('');
  const [attendees, setAttendees] = useState<Set<string>>(
    new Set(profile?.id ? [profile.id] : []),
  );
  const [err, setErr] = useState<string | null>(null);

  function toggle(id: string) {
    setAttendees((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    setErr(null);
    if (!title.trim()) return setErr('Başlıq lazımdır.');
    const sIso = fromLocalInput(start);
    const eIso = fromLocalInput(end);
    if (!sIso || !eIso) return setErr('Tarix boş ola bilməz.');
    if (eIso < sIso) return setErr('Bitiş başlanğıcdan əvvəl ola bilməz.');
    const ext = externalEmails
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    create.mutate(
      {
        title: title.trim(),
        starts_at: sIso,
        ends_at: eIso,
        all_day: allDay,
        location: location.trim() || null,
        meet_url: meetUrl.trim() || null,
        recurrence_rule: recurrence.trim() || null,
        attendees: [...attendees],
        external_emails: ext,
      },
      { onSuccess: onClose, onError: (e) => setErr((e as Error).message) },
    );
  }

  return (
    <Modal title="+ Yeni görüş" onClose={onClose}>
      <Field label="Başlıq">
        <input
          className="input w-full"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Başlanğıc">
          <input
            className="input w-full"
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="Bitiş">
          <input
            className="input w-full"
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 mb-3">
        <input
          type="checkbox"
          checked={allDay}
          onChange={(e) => setAllDay(e.target.checked)}
        />
        <span className="text-body">Bütün gün</span>
      </label>
      <Field label="Yer">
        <input
          className="input w-full"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </Field>
      <Field label="Meet linki">
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="https://meet.google.com/…"
            value={meetUrl}
            onChange={(e) => setMeetUrl(e.target.value)}
          />
          <button
            className="btn-outline"
            type="button"
            onClick={() => window.open('https://meet.new', '_blank', 'noopener')}
          >
            Meet yarat
          </button>
        </div>
      </Field>
      <Field label="Təkrarlanma (RFC 5545)">
        <input
          className="input w-full"
          placeholder="FREQ=WEEKLY;BYDAY=MO"
          value={recurrence}
          onChange={(e) => setRecurrence(e.target.value)}
        />
      </Field>
      <div className="mb-3">
        <div
          className="text-meta uppercase tracking-wider mb-1"
          style={{ color: 'var(--text-muted)' }}
        >
          İştirakçılar
        </div>
        <div
          className="rounded-card p-2 max-h-32 overflow-y-auto"
          style={{ border: '1px solid var(--line-soft)' }}
        >
          {(people as Profile[]).length === 0 ? (
            <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
              İşçi yoxdur.
            </p>
          ) : (
            <ul className="space-y-1">
              {(people as Profile[]).map((p) => (
                <li key={p.id}>
                  <label className="flex items-center gap-2 text-body cursor-pointer">
                    <input
                      type="checkbox"
                      checked={attendees.has(p.id)}
                      onChange={() => toggle(p.id)}
                    />
                    <span>{p.full_name ?? p.email}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <Field label="Xarici emaillər (vergüllə ayır)">
        <input
          className="input w-full"
          placeholder="ad@example.com, ikinci@x.az"
          value={externalEmails}
          onChange={(e) => setExternalEmails(e.target.value)}
        />
      </Field>
      {err ? (
        <div className="text-meta" style={{ color: 'var(--danger, #B91C1C)' }}>
          {err}
        </div>
      ) : null}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn-outline" onClick={onClose}>
          Ləğv et
        </button>
        <button className="btn-primary" disabled={create.isPending} onClick={submit}>
          {create.isPending ? 'Yazılır…' : 'Yarat'}
        </button>
      </div>
    </Modal>
  );
}

function EventModal({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const del = useDeleteCalendarEvent();
  const { profile, isAdmin } = useAuth();
  const canDelete = isAdmin || event.organizer_id === profile?.id;
  return (
    <Modal title={event.title} onClose={onClose}>
      <div className="text-meta mb-3" style={{ color: 'var(--text-muted)' }}>
        {event.all_day
          ? 'Bütün gün'
          : `${fmtTime(new Date(event.starts_at))} – ${fmtTime(new Date(event.ends_at))}`}{' '}
        · {fmtDate(new Date(event.starts_at))}
      </div>
      {event.location ? <div className="text-body mb-2">📍 {event.location}</div> : null}
      {event.meet_url ? (
        <a
          className="btn-primary inline-block mb-3"
          href={event.meet_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Görüşə qoşul
        </a>
      ) : null}
      {event.description ? (
        <p className="text-body mb-3 whitespace-pre-wrap">{event.description}</p>
      ) : null}
      {event.attendees.length > 0 ? (
        <div className="text-meta mb-2" style={{ color: 'var(--text-muted)' }}>
          {event.attendees.length} daxili iştirakçı
        </div>
      ) : null}
      {event.external_emails.length > 0 ? (
        <div className="text-meta mb-2" style={{ color: 'var(--text-muted)' }}>
          Xarici: {event.external_emails.join(', ')}
        </div>
      ) : null}
      {event.recurrence_rule ? (
        <div className="text-meta mb-2" style={{ color: 'var(--text-muted)' }}>
          Təkrar: {event.recurrence_rule}
        </div>
      ) : null}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn-outline" onClick={onClose}>
          Bağla
        </button>
        {canDelete ? (
          <button
            className="btn-outline"
            style={{ color: 'var(--danger, #B91C1C)' }}
            disabled={del.isPending}
            onClick={() => {
              if (!confirm('Görüşü silmək istəyirsən?')) return;
              del.mutate(event.id, { onSuccess: onClose });
            }}
          >
            Sil
          </button>
        ) : null}
      </div>
    </Modal>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(14,22,17,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-surface p-6 rounded-card w-[520px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-h2 mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <div
        className="text-meta uppercase tracking-wider mb-1"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}

// ---------------- date helpers ----------------
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7;
  return addDays(x, -dow);
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function visibleRange(cursor: Date, view: View): { start: string; end: string } {
  if (view === 'month') {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startDow = (first.getDay() + 6) % 7;
    const start = addDays(first, -startDow);
    const end = addDays(start, 42);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (view === 'week') {
    const start = startOfWeek(cursor);
    return { start: start.toISOString(), end: addDays(start, 7).toISOString() };
  }
  const start = startOfDay(cursor);
  return { start: start.toISOString(), end: addDays(start, 1).toISOString() };
}
function fmtTime(d: Date): string {
  return new Intl.DateTimeFormat('az-AZ', { hour: '2-digit', minute: '2-digit' }).format(d);
}
function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat('az-AZ', { day: '2-digit', month: 'short' }).format(d);
}
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(s: string): string {
  if (!s) return '';
  return new Date(s).toISOString();
}
