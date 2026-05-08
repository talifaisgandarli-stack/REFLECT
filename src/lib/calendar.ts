/**
 * Calendar event mutations + queries.
 * PRD §8.2 (Google parity), US-CAL-01..03.
 *
 * Notification fan-out for internal attendees is server-side responsibility;
 * here we just write the event row and call /api/calendar/invite when there
 * are external attendees so they get the .ics email.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { ValidationError } from './finance';
import type { CalendarEvent } from './ics';

export type EventInput = {
  title: string;
  description?: string | null;
  starts_at: string;
  ends_at: string;
  all_day?: boolean;
  recurrence_rule?: string | null;
  location?: string | null;
  meet_url?: string | null;
  attendees?: string[];
  external_emails?: string[];
  project_id?: string | null;
};

export function useEvents(rangeStart: Date, rangeEnd: Date) {
  return useQuery({
    queryKey: ['calendar', rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: async (): Promise<CalendarEvent[]> => {
      // Pull events whose first instance might overlap the visible range.
      // We fetch broadly and let expandOccurrences clip; for non-recurring
      // events Postgres can filter cleanly.
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .lte('starts_at', rangeEnd.toISOString())
        .order('starts_at', { ascending: true });
      if (error) throw error;
      // Drop non-recurring events that already ended before the range.
      return (data ?? []).filter((e: CalendarEvent) => {
        if (e.recurrence_rule) return true;
        return new Date(e.ends_at).getTime() >= rangeStart.getTime();
      }) as CalendarEvent[];
    },
  });
}

async function authedFetch(path: string, body: unknown) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sessiya tapılmadı');
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EventInput) => {
      if (!input.title.trim()) throw new ValidationError('Hadisənin başlığı boş ola bilməz.');
      if (new Date(input.ends_at).getTime() <= new Date(input.starts_at).getTime()) {
        throw new ValidationError('Bitmə vaxtı başlama vaxtından sonra olmalıdır.');
      }

      const { data: row, error } = await supabase
        .from('calendar_events')
        .insert({
          title: input.title.trim(),
          description: input.description ?? null,
          starts_at: input.starts_at,
          ends_at: input.ends_at,
          all_day: input.all_day ?? false,
          recurrence_rule: input.recurrence_rule ?? null,
          location: input.location ?? null,
          meet_url: input.meet_url ?? null,
          attendees: input.attendees ?? [],
          external_emails: input.external_emails ?? [],
          project_id: input.project_id ?? null,
        })
        .select()
        .single();
      if (error) throw error;

      // In-app notifications for internal attendees.
      if ((input.attendees ?? []).length > 0) {
        await supabase.from('notifications').insert(
          (input.attendees ?? []).map((uid) => ({
            user_id: uid,
            kind: 'calendar_invite',
            payload: { event_id: row.id, title: row.title, starts_at: row.starts_at },
          })),
        );
      }

      // External attendee .ics email — server side because we need Resend.
      if ((input.external_emails ?? []).length > 0) {
        await authedFetch('/api/calendar/invite', { event_id: row.id }).catch(() => null);
      }

      return row as CalendarEvent;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar'] }),
  });
}
