import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { useT } from '@/lib/i18n';
import type { Profile, UserPresence } from '@/types/db';

export function TeamRosterPage() {
  const t = useT();
  const profiles = useQuery({
    queryKey: ['profiles'],
    queryFn: async (): Promise<Profile[]> =>
      (await supabase.from('profiles').select('*').eq('is_active', true)).data ?? [],
  });
  const presence = useQuery({
    queryKey: ['presence-list'],
    queryFn: async (): Promise<UserPresence[]> =>
      (await supabase.from('user_presence').select('*')).data ?? [],
  });

  const ppl = profiles.data ?? [];
  const presenceMap = Object.fromEntries((presence.data ?? []).map((p) => [p.user_id, p]));

  return (
    <>
      <PageHead
        meta={t('tasks.assignees_count', { count: ppl.length })}
        title={t('nav.team.roster')}
      />
      {ppl.length === 0 ? (
        <EmptyState title="Komanda hələ formalaşmayıb" body="Admin işçi dəvət edə bilər." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {ppl.map((p) => (
            <div key={p.id} className="card flex items-center gap-3">
              <Avatar name={p.full_name ?? p.email} url={p.avatar_url} size={48} presence={presenceMap[p.id]?.status} />
              <div className="flex-1 min-w-0">
                <div className="text-body font-medium truncate">{p.full_name ?? p.email}</div>
                <div className="text-meta truncate" style={{ color: 'var(--text-muted)' }}>
                  {p.email}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
