import { useState } from 'react';
import { PageHead } from '@/components/PageHead';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/format';

export function CalendarPage() {
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const events = useQuery({
    queryKey: ['calendar'],
    queryFn: async () =>
      (await supabase.from('calendar_events').select('*').order('starts_at', { ascending: true }).limit(100)).data ?? [],
  });

  return (
    <>
      <PageHead
        meta="Asia/Baku"
        title="Təqvim"
        actions={
          <>
            {(['month', 'week', 'day'] as const).map((v) => (
              <button key={v} className={`chip ${view === v ? 'chip-brand' : ''}`} onClick={() => setView(v)}>
                {v === 'month' ? 'Ay' : v === 'week' ? 'Həftə' : 'Gün'}
              </button>
            ))}
            <button className="btn-primary">+ Görüş</button>
          </>
        }
      />
      <div className="card">
        {(events.data ?? []).length === 0 ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>Yaxınlaşan görüş yoxdur.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {(events.data ?? []).map((e: any) => (
              <li key={e.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">{e.title}</div>
                  <div className="text-meta" style={{ color: 'var(--text-muted)' }}>{e.location ?? '—'}</div>
                </div>
                <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                  {formatDate(e.starts_at, { hour: '2-digit', minute: '2-digit' })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
