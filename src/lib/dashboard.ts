/**
 * REQ-DASH-02 dashboard-widget hooks: upcoming meetings + unread announcements.
 * Read tracking via the SECURITY DEFINER RPCs from 0006.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from './store';

// ----------------------------------------------------------------------------
// Upcoming meetings — calendar_events where I am organizer or attendee, in the
// next 7 days. We DO NOT expand recurrence here; PRD §8.2 already requires the
// calendar grid to expand. The widget shows only the canonical row's next
// occurrence, which for non-recurring is the row itself.
// ----------------------------------------------------------------------------

export type UpcomingMeeting = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  meet_url: string | null;
  location: string | null;
};

export function useUpcomingMeetings(days = 7) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['dashboard', 'meetings', profile?.id, days],
    enabled: !!profile?.id,
    queryFn: async (): Promise<UpcomingMeeting[]> => {
      const now = new Date();
      const horizon = new Date(now.getTime() + days * 86_400_000);
      const { data, error } = await supabase
        .from('calendar_events')
        .select('id, title, starts_at, ends_at, meet_url, location, organizer_id, attendees')
        .lte('starts_at', horizon.toISOString())
        .gte('ends_at', now.toISOString())
        .order('starts_at', { ascending: true })
        .limit(20);
      if (error) throw error;
      const uid = profile!.id;
      return (data ?? [])
        .filter(
          (e: { organizer_id: string | null; attendees: string[] }) =>
            e.organizer_id === uid || (e.attendees ?? []).includes(uid),
        )
        .slice(0, 5)
        .map((e) => ({
          id: e.id,
          title: e.title,
          starts_at: e.starts_at,
          ends_at: e.ends_at,
          meet_url: e.meet_url,
          location: e.location,
        }));
    },
  });
}

// ----------------------------------------------------------------------------
// Unread announcements (PRD §8.6 — read_by jsonb keyed by user_id).
// We can't use a server-side `not (read_by ? uid)` filter from PostgREST
// without a custom RPC, so we fetch the recent set and filter client-side.
// Cheap because the visible set is small.
// ----------------------------------------------------------------------------

export type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  category: string | null;
  is_featured: boolean;
  approved: boolean;
  published_at: string | null;
  read_by: Record<string, string> | null;
};

export function useAnnouncements(limit = 50) {
  return useQuery({
    queryKey: ['announcements', 'all', limit],
    queryFn: async (): Promise<AnnouncementRow[]> => {
      const { data, error } = await supabase
        .from('announcements')
        .select('id, title, body, category, is_featured, approved, published_at, read_by')
        .eq('approved', true)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as AnnouncementRow[];
    },
  });
}

export function useUnreadAnnouncements(limit = 5) {
  const { profile } = useAuth();
  const all = useAnnouncements(50);
  const filtered = (all.data ?? []).filter((a) => !(a.read_by ?? {})[profile?.id ?? '_'])
    .slice(0, limit);
  return { ...all, data: filtered };
}

export function useUnreadAnnouncementCount() {
  const { profile } = useAuth();
  const all = useAnnouncements(50);
  const count = (all.data ?? []).filter((a) => !(a.read_by ?? {})[profile?.id ?? '_']).length;
  return { count, isLoading: all.isLoading };
}

export function useMarkAnnouncementRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('mark_announcement_read', { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });
}

export function useMarkAllAnnouncementsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('mark_all_announcements_read');
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });
}
