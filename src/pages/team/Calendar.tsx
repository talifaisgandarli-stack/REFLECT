/**
 * Təqvim — Month / Week / Day views (PRD §8.2).
 * - Asia/Baku display TZ across the board
 * - .ics download per event + mailto invite that brings external emails
 * - Meet link surfaced when present (clicked opens in new tab)
 * - v1: read-only views; create modal handles new events
 */
import { useMemo, useState } from 'react';
import { PageHead } from '@/components/PageHead';
import { useT } from '@/lib/i18n';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/format';
import { EventModal } from '@/components/EventModal';
import { buildIcs, buildMailtoInvite, downloadIcs } from '@/lib/ics';

type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  meet_url: string | null;
  external_emails: string[];
};

const TZ = 'Asia/Baku';
const VIEW_LABEL = { month: 'Ay', week: 'Həftə', day: 'Gün' } as const;

function isoDateBaku(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function startOfMonth(d: Date): Date {
  const iso = isoDateBaku(d).slice(0, 7) + '-01';
  return new Date(`${iso}T00:00:00+04:00`);
}
function startOfWeek(d: Date): Date {
  const iso = isoDateBaku(d);
  const base = new Date(`${iso}T00:00:00+04:00`);
  const day = (base.getUTCDay() + 6) % 7; // Monday = 0
  base.setUTCDate(base.getUTCDate() - day);
  return base;
}
function startOfDay(d: Date): Date {
  return new Date(`${isoDateBaku(d)}T00:00:00+04:00`);
}

function rangeFor(view: 'month' | 'week' | 'day', anchor: Date): { from: Date; to: Date } {
  if (view === 'month') {
    const from = startOfMonth(anchor);
    const to = new Date(from);
    to.setUTCMonth(to.getUTCMonth() + 1);
    return { from, to };
  }
  if (view === 'week') {
    const from = startOfWeek(anchor);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 7);
    return { from, to };
  }
  const from = startOfDay(anchor);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 1);
  return { from, to };
}

function addPeriod(view: 'month' | 'week' | 'day', anchor: Date, delta: number): Date {
  const d = new Date(anchor);
  if (view === 'month') d.setUTCMonth(d.getUTCMonth() + delta);
  if (view === 'week') d.setUTCDate(d.getUTCDate() + delta * 7);
  if (view === 'day') d.setUTCDate(d.getUTCDate() + delta);
  return d;
}

function periodLabel(view: 'month' | 'week' | 'day', anchor: Date): string {
  if (view === 'month') {
    return new Intl.DateTimeFormat('az-AZ', { timeZone: TZ, year: 'numeric', month: 'long' }).format(
      anchor,
    );
  }
  const { from, to } = rangeFor(view, anchor);
  const fromS = new Intl.DateTimeFormat('az-AZ', {
    timeZone: TZ,
    day: '2-digit',
    month: 'short',
  }).format(from);
  const toS = new Intl.DateTimeFormat('az-AZ', {
    timeZone: TZ,
    day: '2-digit',
    month: 'short',
  }).format(new Date(to.getTime() - 1));
  return `${fromS} – ${toS}`;
}

export function CalendarPage() {
  const t = useT();
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [creating, setCreating] = useState(false);

  const { from, to } = rangeFor(view, anchor);

  const events = useQuery({
    queryKey: ['calendar', view, from.toISOString()],
    queryFn: async (): Promise<CalendarEvent[]> => {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .gte('starts_at', from.toISOString())
        .lt('starts_at', to.toISOString())
        .order('starts_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as CalendarEvent[];
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events.data ?? []) {
      const key = isoDateBaku(new Date(e.starts_at));
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [events.data]);

  function downloadEvent(e: CalendarEvent) {
    downloadIcs(`reflect-${e.id}`, buildIcs({ ...e, external_emails: e.external_emails ?? [] }));
  }

  function emailEvent(e: CalendarEvent) {
    const recipients = e.external_emails?.length ? e.external_emails : [];
    if (recipients.length === 0) {
      alert('Xarici iştirakçı yoxdur — əvvəlcə görüşə əlavə et.');
      return;
    }
    window.location.href = buildMailtoInvite(e, recipients);
  }

  return (
    <>
      <PageHead
        meta={`Asia/Baku · ${periodLabel(view, anchor)}`}
        title={t('nav.team.calendar')}
        actions={
          <>
            {(['month', 'week', 'day'] as const).map((v) => (
              <button
                key={v}
                className={`chip ${view === v ? 'chip-brand' : ''}`}
                onClick={() => setView(v)}
              >
                {VIEW_LABEL[v]}
              </button>
            ))}
            <button className="btn-primary" onClick={() => setCreating(true)}>
              + Görüş
            </button>
          </>
        }
      />

      <div className="flex items-center gap-2 mb-4">
        <button className="btn-ghost" onClick={() => setAnchor(addPeriod(view, anchor, -1))}>
          ←
        </button>
        <button className="btn-outline" onClick={() => setAnchor(new Date())}>
          Bu gün
        </button>
        <button className="btn-ghost" onClick={() => setAnchor(addPeriod(view, anchor, 1))}>
          →
        </button>
      </div>

      <div className="card">
        {events.isLoading ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Yüklənir…
          </p>
        ) : (events.data ?? []).length === 0 ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Bu dövrdə görüş yoxdur.
          </p>
        ) : (
          <ul className="space-y-4">
            {Array.from(grouped.entries()).map(([day, items]) => (
              <li key={day}>
                <h3
                  className="text-tiny mb-2"
                  style={{
                    color: 'var(--text-muted)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {formatDate(`${day}T12:00:00+04:00`, { weekday: 'long' })} · {day}
                </h3>
                <ul className="divide-y" style={{ borderColor: 'var(--line-soft)' }}>
                  {items.map((e) => (
                    <li
                      key={e.id}
                      className="py-3 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-body font-medium truncate">{e.title}</div>
                        <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                          {e.all_day
                            ? 'Bütün gün'
                            : `${formatDate(e.starts_at, {
                                hour: '2-digit',
                                minute: '2-digit',
                              })} – ${formatDate(e.ends_at, {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}`}
                          {e.location ? ` · ${e.location}` : ''}
                          {e.external_emails?.length
                            ? ` · ${e.external_emails.length} xarici`
                            : ''}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {e.meet_url ? (
                          <a
                            href={e.meet_url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="chip chip-brand"
                          >
                            Meet
                          </a>
                        ) : null}
                        <button
                          type="button"
                          className="chip"
                          onClick={() => downloadEvent(e)}
                          title="iCalendar (.ics) faylı yüklə"
                        >
                          .ics
                        </button>
                        {e.external_emails?.length ? (
                          <button
                            type="button"
                            className="chip"
                            onClick={() => emailEvent(e)}
                          >
                            Email dəvəti
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>

      {creating ? <EventModal onClose={() => setCreating(false)} /> : null}
    </>
  );
}
