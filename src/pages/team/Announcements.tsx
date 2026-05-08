import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { relativeTime } from '@/lib/format';

export function AnnouncementsPage() {
  const q = useQuery({
    queryKey: ['announcements'],
    queryFn: async () =>
      (await supabase
        .from('announcements')
        .select('*')
        .eq('approved', true)
        .order('published_at', { ascending: false })
        .limit(50)).data ?? [],
  });

  return (
    <>
      <PageHead
        meta="MIRAI feed + manual"
        title="Elanlar"
        actions={<button className="btn-primary">+ Yeni elan</button>}
      />
      {(q.data ?? []).length === 0 ? (
        <EmptyState title="Elan yoxdur" body="MIRAI CMO trend feed-dən təkliflər doldurmağa başlayanda burada görünəcək." />
      ) : (
        <div className="space-y-3">
          {(q.data ?? []).map((a: any) => (
            <article key={a.id} className="card">
              <div className="flex items-center gap-2 mb-1">
                {a.is_featured ? <span className="chip chip-brand">Featured</span> : null}
                {a.mirai_generated ? <span className="chip">MIRAI</span> : null}
              </div>
              <h3 className="text-h3">{a.title}</h3>
              <p className="text-body mt-1">{a.body}</p>
              <div className="text-meta mt-2" style={{ color: 'var(--text-muted)' }}>
                {relativeTime(a.published_at)}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
