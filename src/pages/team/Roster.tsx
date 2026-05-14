import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/store';
import type { Profile, UserPresence } from '@/types/db';

type ProfileWithRole = Profile & { role?: { name: string } | null };

const WORKLOAD_CHIP: Record<string, { label: string; color: string; bg: string }> = {
  low:    { label: 'Az',     color: 'var(--success-deep)', bg: 'var(--success-bg)' },
  medium: { label: 'Orta',   color: 'var(--warning)', bg: 'var(--warning-bg)' },
  high:   { label: 'Yüksək', color: 'var(--error-deep)', bg: 'var(--error-bg)' },
};
function workloadLevel(openTasks: number): keyof typeof WORKLOAD_CHIP {
  if (openTasks <= 2) return 'low';
  if (openTasks <= 5) return 'medium';
  return 'high';
}

export function TeamRosterPage() {
  const { isAdmin } = useAuth();

  const profiles = useQuery({
    queryKey: ['profiles-with-roles'],
    queryFn: async (): Promise<ProfileWithRole[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, role:roles(name)')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as ProfileWithRole[];
    },
  });

  const presence = useQuery({
    queryKey: ['presence-list'],
    queryFn: async (): Promise<UserPresence[]> =>
      (await supabase.from('user_presence').select('*')).data ?? [],
  });

  // Equipment count per assignee
  const equipment = useQuery({
    queryKey: ['equipment-assignments'],
    queryFn: async () => {
      const { data } = await supabase
        .from('equipment')
        .select('assigned_to')
        .not('assigned_to', 'is', null);
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        if (row.assigned_to) counts[row.assigned_to] = (counts[row.assigned_to] ?? 0) + 1;
      }
      return counts;
    },
  });

  // Open task count per assignee (active, queued, review, expert)
  const openTasks = useQuery({
    queryKey: ['tasks-open-assignees'],
    queryFn: async () => {
      const { data } = await supabase
        .from('tasks')
        .select('assignee_ids')
        .in('status', ['active', 'queued', 'review', 'expert'])
        .is('archived_at', null);
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        for (const uid of row.assignee_ids ?? []) {
          counts[uid] = (counts[uid] ?? 0) + 1;
        }
      }
      return counts;
    },
  });

  const ppl = profiles.data ?? [];
  const presenceMap = useMemo(
    () => Object.fromEntries((presence.data ?? []).map((p) => [p.user_id, p])),
    [presence.data],
  );
  const eqMap = equipment.data ?? {};
  const taskMap = openTasks.data ?? {};

  return (
    <>
      <PageHead meta={`${ppl.length} nəfər`} title="İşçi Heyəti" />
      {ppl.length === 0 ? (
        <EmptyState
          title="Komanda hələ formalaşmayıb"
          body="Admin işçi dəvət edə bilər."
          cta={
            isAdmin ? (
              <Link to="/parametrlər/dəvətlər" className="btn-primary">
                + İşçi dəvət et
              </Link>
            ) : null
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {ppl.map((p) => {
            const taskCount = taskMap[p.id] ?? 0;
            const eqCount = eqMap[p.id] ?? 0;
            const wl = workloadLevel(taskCount);
            const wlChip = WORKLOAD_CHIP[wl];
            return (
              <div key={p.id} className="card flex items-center gap-3">
                <Avatar
                  name={p.full_name ?? p.email}
                  url={p.avatar_url}
                  size={48}
                  presence={presenceMap[p.id]?.status}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-body font-medium truncate">{p.full_name ?? p.email}</div>
                  {/* Role label */}
                  <div className="text-meta truncate" style={{ color: 'var(--text-muted)' }}>
                    {p.role?.name ?? '—'}
                  </div>
                  {/* Workload + equipment row */}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span
                      className="text-meta rounded-full px-2 py-0.5"
                      style={{ fontSize: 11, color: wlChip.color, background: wlChip.bg }}
                      title={`${taskCount} açıq tapşırıq`}
                    >
                      {wlChip.label} · {taskCount} tapşırıq
                    </span>
                    {eqCount > 0 ? (
                      <span
                        className="text-meta"
                        style={{ fontSize: 11, color: 'var(--text-muted)' }}
                        title="Təhvil verilmiş avadanlıq"
                      >
                        📦 {eqCount}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
