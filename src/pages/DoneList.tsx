import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { StatusChip } from '@/components/StatusChip';
import { formatDate, relativeTime, TZ } from '@/lib/format';
import { useAuth } from '@/lib/store';
import type { Task } from '@/types/db';

type Range = 'today' | 'week' | 'month' | 'all';

const RANGE_LABEL: Record<Range, string> = {
  today: 'Bu gün',
  week: 'Bu həftə',
  month: 'Bu ay',
  all: 'Hamısı',
};

/** Asia/Baku midnight for a given offset in days from today. */
function bakuMidnight(daysAgo: number): Date {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = fmt.format(new Date());
  const d = new Date(`${today}T00:00:00+04:00`);
  d.setDate(d.getDate() - daysAgo);
  return d;
}

/** Best-effort completion timestamp: archived_at after REQ-TASK-08, else created_at. */
function completedAt(t: Task): string {
  return t.archived_at ?? t.created_at;
}

function bucketKey(t: Task): 'today' | 'yesterday' | 'week' | 'earlier' {
  const ts = new Date(completedAt(t)).getTime();
  if (ts >= bakuMidnight(0).getTime()) return 'today';
  if (ts >= bakuMidnight(1).getTime()) return 'yesterday';
  if (ts >= bakuMidnight(7).getTime()) return 'week';
  return 'earlier';
}

export function DoneListPage() {
  const { profile } = useAuth();
  const [range, setRange] = useState<Range>('week');
  const [mineOnly, setMineOnly] = useState(false);

  const done = useQuery({
    queryKey: ['done-list', range, mineOnly ? profile?.id : null],
    queryFn: async (): Promise<Task[]> => {
      let q = supabase.from('tasks').select('*').eq('status', 'done');
      if (mineOnly && profile?.id) q = q.contains('assignee_ids', [profile.id]);
      if (range !== 'all') {
        const days = range === 'today' ? 0 : range === 'week' ? 6 : 29;
        q = q.gte('created_at', bakuMidnight(days).toISOString());
      }
      const { data, error } = await q.order('archived_at', { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []).sort(
        (a, b) => new Date(completedAt(b)).getTime() - new Date(completedAt(a)).getTime(),
      );
    },
  });

  const buckets = useMemo(() => {
    const init = { today: [] as Task[], yesterday: [] as Task[], week: [] as Task[], earlier: [] as Task[] };
    for (const t of done.data ?? []) init[bucketKey(t)].push(t);
    return init;
  }, [done.data]);

  const todayCount = buckets.today.length;
  const totalCount = done.data?.length ?? 0;
  const meta = `${totalCount} tamamlandı · ${todayCount} bu gün${mineOnly ? ' · mənim' : ''}`;

  return (
    <>
      <PageHead
        meta={meta}
        title="Tamamlandı"
        actions={
          <>
            <button
              type="button"
              onClick={() => setMineOnly((v) => !v)}
              className={`btn-outline ${mineOnly ? 'border-brand-text' : ''}`}
            >
              {mineOnly ? 'Mənim ✓' : 'Mənim'}
            </button>
          </>
        }
      />

      <div className="flex flex-wrap gap-2 mb-5" role="tablist" aria-label="Müddət">
        {(['today', 'week', 'month', 'all'] as const).map((r) => (
          <button
            key={r}
            role="tab"
            aria-selected={range === r}
            className={`chip ${range === r ? 'chip-brand' : ''}`}
            onClick={() => setRange(r)}
          >
            {RANGE_LABEL[r]}
          </button>
        ))}
      </div>

      {done.isLoading ? (
        <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
          Yüklənir…
        </div>
      ) : totalCount === 0 ? (
        <EmptyState
          title="Hələ heç nə tamamlanmayıb"
          body="Tapşırığı Tamamlandı sütununa daşı — burada görünəcək."
        />
      ) : (
        <div className="space-y-6">
          {todayCount > 0 ? <TodayHero count={todayCount} /> : null}
          <BucketSection label="Bu gün" tasks={buckets.today} hideIfEmpty />
          <BucketSection label="Dünən" tasks={buckets.yesterday} hideIfEmpty />
          <BucketSection label="Bu həftə" tasks={buckets.week} hideIfEmpty />
          <BucketSection label="Daha əvvəl" tasks={buckets.earlier} hideIfEmpty />
        </div>
      )}
    </>
  );
}

function TodayHero({ count }: { count: number }) {
  return (
    <section className="card-feature flex items-center justify-between gap-4">
      <div>
        <div className="text-tiny font-medium" style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Bu günün qələbələri
        </div>
        <h2 className="text-h2 mt-1" style={{ color: 'var(--ink)' }}>
          {count} tapşırıq tamamlandı
        </h2>
      </div>
      <div
        className="text-hero"
        style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--ink)', fontWeight: 900, lineHeight: 1 }}
      >
        {count}
      </div>
    </section>
  );
}

function BucketSection({
  label,
  tasks,
  hideIfEmpty,
}: {
  label: string;
  tasks: Task[];
  hideIfEmpty?: boolean;
}) {
  if (hideIfEmpty && tasks.length === 0) return null;
  return (
    <section>
      <h3
        className="text-tiny mb-2"
        style={{
          color: 'var(--text-muted)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {label} · {tasks.length}
      </h3>
      <ul className="card divide-y" style={{ borderColor: 'var(--line)' }}>
        {tasks.map((t) => (
          <DoneRow key={t.id} task={t} />
        ))}
      </ul>
    </section>
  );
}

function DoneRow({ task }: { task: Task }) {
  const ts = completedAt(task);
  return (
    <li
      className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-4"
      style={{ borderColor: 'var(--line-soft)' }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            aria-hidden
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: '#22C55E' }}
          />
          <span className="text-body font-medium truncate" style={{ color: 'var(--text)' }}>
            {task.title}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-meta" style={{ color: 'var(--text-muted)' }}>
          <StatusChip status={task.status} />
          {task.assignee_ids.length > 0 ? (
            <span>{task.assignee_ids.length} icraçı</span>
          ) : null}
          {task.deadline ? <span>· deadline {formatDate(task.deadline)}</span> : null}
        </div>
      </div>
      <time
        dateTime={ts}
        className="text-meta shrink-0"
        style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}
      >
        {relativeTime(ts)}
      </time>
    </li>
  );
}
