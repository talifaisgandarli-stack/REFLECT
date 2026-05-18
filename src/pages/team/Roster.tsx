import { useMemo, useRef, useState } from 'react';
import { useSlashFocus } from '@/lib/useSlashFocus';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '@/lib/store';
import { downloadCsv } from '@/lib/csv';
import { relativeTime } from '@/lib/format';
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
  const { isAdmin, profile: me } = useAuth();
  const qc = useQueryClient();
  // Admin can see deactivated users (to reactivate them); non-admins only active.
  const [showInactive, setShowInactive] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState<string | null>(null);

  const profiles = useQuery({
    queryKey: ['profiles-with-roles', isAdmin, showInactive],
    queryFn: async (): Promise<ProfileWithRole[]> => {
      let q = supabase
        .from('profiles')
        .select('*, role:roles(name)')
        .order('full_name');
      // Non-admins always restricted to active; admin can opt-in to see inactive
      if (!isAdmin || !showInactive) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ProfileWithRole[];
    },
  });

  // PRD §2.1 / §9.1 — admin can deactivate/reactivate users (creator + self protected)
  const setActive = useMutation({
    mutationFn: async ({ userId, active }: { userId: string; active: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: active })
        .eq('id', userId);
      if (error) throw error;
      // Audit log per PRD §9.4
      if (me?.id) {
        await supabase.from('audit_log').insert({
          actor_id: me.id,
          action: active ? 'profile.activate' : 'profile.deactivate',
          resource: 'profiles',
          ip: null,
          user_agent: navigator.userAgent,
          meta: { user_id: userId },
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profiles-with-roles'] });
      setConfirmDeactivate(null);
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

  // PRD §UX — name/email free-text search + '/' shortcut (matches other list pages)
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  useSlashFocus(searchRef);
  const allPpl = profiles.data ?? [];
  const presenceMap = useMemo(
    () => Object.fromEntries((presence.data ?? []).map((p) => [p.user_id, p])),
    [presence.data],
  );
  const eqMap = equipment.data ?? {};
  const taskMap = openTasks.data ?? {};
  // PRD §UX — sort by name / workload / equipment count
  const [sortBy, setSortBy] = useState<'name' | 'workload' | 'equipment'>('name');
  const filteredPpl = search.trim()
    ? allPpl.filter((p) => {
        const q = search.toLowerCase();
        return (p.full_name ?? '').toLowerCase().includes(q)
          || p.email.toLowerCase().includes(q)
          || (p.role?.name ?? '').toLowerCase().includes(q);
      })
    : allPpl;
  const ppl = [...filteredPpl].sort((a, b) => {
    if (sortBy === 'workload') return (taskMap[b.id] ?? 0) - (taskMap[a.id] ?? 0);
    if (sortBy === 'equipment') return (eqMap[b.id] ?? 0) - (eqMap[a.id] ?? 0);
    return (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email, 'az');
  });

  return (
    <>
      <PageHead
        meta={`${ppl.length} nəfər`}
        title="İşçi Heyəti"
        actions={
          <>
            <input
              ref={searchRef}
              className="input max-w-[220px]"
              placeholder="Axtar (ad, email, rol)… (/)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="input"
              style={{ maxWidth: 180, height: 32, fontSize: 12 }}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              aria-label="Sıralama"
            >
              <option value="name">A → Z</option>
              <option value="workload">İş yükü (çox əvvəl)</option>
              <option value="equipment">Avadanlıq (çox əvvəl)</option>
            </select>
            {isAdmin ? (
              <>
              {/* PRD §8.1 — roster snapshot for HR / handover */}
              <button
                type="button"
                className="btn-outline"
                disabled={ppl.length === 0}
                onClick={() => {
                  downloadCsv(
                    `heyet-${new Date().toISOString().slice(0, 10)}.csv`,
                    ['Ad', 'Email', 'Rol', 'Aktiv', 'Açıq tapşırıq', 'Avadanlıq', 'Telegram'],
                    ppl.map((p) => ({
                      'Ad': p.full_name ?? '',
                      'Email': p.email,
                      'Rol': p.role?.name ?? '',
                      'Aktiv': p.is_active === false ? 'Yox' : 'Bəli',
                      'Açıq tapşırıq': taskMap[p.id] ?? 0,
                      'Avadanlıq': eqMap[p.id] ?? 0,
                      'Telegram': p.telegram_chat_id ? 'Bəli' : 'Yox',
                    })),
                  );
                }}
              >
                ↓ CSV
              </button>
              <button
                type="button"
                className="chip"
                style={{
                  background: showInactive ? 'var(--brand-action)' : undefined,
                  color: showInactive ? 'var(--ink)' : undefined,
                }}
                onClick={() => setShowInactive((v) => !v)}
                aria-pressed={showInactive}
              >
                {showInactive ? '✓ Deaktivləri göstər' : 'Deaktivləri göstər'}
              </button>
              </>
            ) : null}
          </>
        }
      />
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
      <>
        {/* PRD §UX — if admin is the only person here, nudge them to invite */}
        {isAdmin && allPpl.length === 1 ? (
          <div
            className="card mb-3 flex items-center justify-between gap-3 flex-wrap"
            style={{ background: 'var(--brand-glow-sm)' }}
          >
            <span className="text-meta" style={{ color: 'var(--brand-text)' }}>
              Komanda boşdur — ilk işçini dəvət edin və Reflect-i komandayla istifadə edin.
            </span>
            <Link to="/parametrlər/dəvətlər" className="btn-primary" style={{ fontSize: 12 }}>
              + İşçi dəvət et
            </Link>
          </div>
        ) : null}
        {/* PRD §UX — role distribution chip row at the top so admin sees
            the firm's shape at a glance (X dizayner / Y BD / Z member). */}
        {(() => {
          const buckets = new Map<string, number>();
          for (const p of ppl) {
            const r = p.role?.name ?? '— rol təyin edilməyib —';
            buckets.set(r, (buckets.get(r) ?? 0) + 1);
          }
          const rows = Array.from(buckets.entries()).sort((a, b) => b[1] - a[1]);
          if (rows.length <= 1) return null;
          return (
            <div className="card mb-3 flex items-center gap-2 flex-wrap">
              <span className="text-meta" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                Rol bölgüsü:
              </span>
              {rows.map(([name, n]) => (
                <span
                  key={name}
                  className="chip"
                  style={{
                    background: 'var(--surface-mist)',
                    color: 'var(--text)',
                    fontSize: 11,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {name} · {n}
                </span>
              ))}
            </div>
          );
        })()}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {ppl.map((p) => {
            const taskCount = taskMap[p.id] ?? 0;
            const eqCount = eqMap[p.id] ?? 0;
            const wl = workloadLevel(taskCount);
            const wlChip = WORKLOAD_CHIP[wl];
            const isInactive = p.is_active === false;
            // Cannot deactivate: self, the creator, or already-pending mutation target
            const canToggle = isAdmin && p.id !== me?.id && !p.is_creator;
            return (
              <div
                key={p.id}
                className="card flex items-center gap-3"
                style={isInactive ? { opacity: 0.55 } : undefined}
              >
                <Avatar
                  name={p.full_name ?? p.email}
                  url={p.avatar_url}
                  size={48}
                  presence={isInactive ? undefined : presenceMap[p.id]?.status}
                  tooltip={(() => {
                    const parts = [p.full_name ?? p.email, p.email, p.role?.name].filter(Boolean);
                    // PRD §10.5.1 — include last_heartbeat_at in tooltip ("son: 5 dəq əvvəl")
                    const pres = presenceMap[p.id];
                    if (pres?.last_heartbeat_at) {
                      parts.push(`son: ${relativeTime(pres.last_heartbeat_at)}`);
                    }
                    return parts.join(' · ');
                  })()}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-body font-medium truncate flex items-center gap-2">
                    {p.full_name ?? p.email}
                    {isInactive ? (
                      <span
                        className="text-meta rounded-full px-2 py-0.5"
                        style={{ fontSize: 10, background: 'var(--line)', color: 'var(--text-muted)' }}
                      >
                        Deaktiv
                      </span>
                    ) : null}
                  </div>
                  {/* Role label */}
                  <div className="text-meta truncate" style={{ color: 'var(--text-muted)' }}>
                    {p.role?.name ?? '—'}
                  </div>
                  {/* Workload + equipment row + capacity micro-bar */}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span
                      className="text-meta rounded-full px-2 py-0.5"
                      style={{ fontSize: 11, color: wlChip.color, background: wlChip.bg }}
                      title={`${taskCount} açıq tapşırıq`}
                    >
                      {wlChip.label} · {taskCount} tapşırıq
                    </span>
                    {/* Capacity indicator: 8 tasks = 100% */}
                    <div
                      className="h-1.5 rounded-full"
                      style={{ width: 60, background: 'var(--line-soft)' }}
                      title={`${Math.min(100, Math.round((taskCount / 8) * 100))}% kapasitə`}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, (taskCount / 8) * 100)}%`,
                          height: '100%',
                          background: wlChip.color,
                          borderRadius: 999,
                        }}
                      />
                    </div>
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

                {/* Admin deactivate/reactivate (PRD §2.1 / §9.1) */}
                {canToggle ? (
                  isInactive ? (
                    <button
                      type="button"
                      className="chip shrink-0"
                      style={{ color: 'var(--success-deep)' }}
                      disabled={setActive.isPending}
                      onClick={() => setActive.mutate({ userId: p.id, active: true })}
                    >
                      Aktivləşdir
                    </button>
                  ) : confirmDeactivate === p.id ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        className="chip"
                        style={{ background: 'var(--error-deep)', color: 'white' }}
                        disabled={setActive.isPending}
                        onClick={() => setActive.mutate({ userId: p.id, active: false })}
                      >
                        {setActive.isPending ? '…' : 'Bəli'}
                      </button>
                      <button
                        type="button"
                        className="chip"
                        onClick={() => setConfirmDeactivate(null)}
                      >
                        Ləğv
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="chip shrink-0"
                      style={{ color: 'var(--error-deep)' }}
                      onClick={() => setConfirmDeactivate(p.id)}
                      title="Bu istifadəçini deaktiv et — login bağlanır, məlumat saxlanır"
                    >
                      Deaktiv et
                    </button>
                  )
                ) : null}
              </div>
            );
          })}
        </div>
      </>
      )}
    </>
  );
}
