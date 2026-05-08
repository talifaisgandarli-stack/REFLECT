import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHead } from '@/components/PageHead';
import { EmptyState } from '@/components/EmptyState';
import { useState } from 'react';

export function OkrPage() {
  const [scope, setScope] = useState<'company' | 'personal'>('company');
  const okrs = useQuery({
    queryKey: ['okrs', scope],
    queryFn: async () => (await supabase.from('okrs').select('*').eq('scope', scope)).data ?? [],
  });

  return (
    <>
      <PageHead
        meta="Q əsasında"
        title="OKR"
        actions={
          <>
            {(['company', 'personal'] as const).map((s) => (
              <button key={s} className={`chip ${scope === s ? 'chip-brand' : ''}`} onClick={() => setScope(s)}>
                {s === 'company' ? 'Şirkət' : 'Şəxsi'}
              </button>
            ))}
            <button className="btn-primary">+ Obyektiv</button>
          </>
        }
      />
      {(okrs.data ?? []).length === 0 ? (
        <EmptyState title="OKR yoxdur" body="İlk məqsədi yarat — Key Results-larla bağla." />
      ) : (
        <ul className="space-y-3">
          {(okrs.data ?? []).map((o: any) => (
            <li key={o.id} className="card">
              <h3 className="text-h3">{o.objective}</h3>
              <div className="text-meta mt-1" style={{ color: 'var(--text-muted)' }}>{o.period}</div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
