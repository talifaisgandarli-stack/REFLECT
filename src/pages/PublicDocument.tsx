/**
 * Public document viewer — /d/:token.
 * No auth. Reads via get_document_by_token (security definer) which exposes
 * only bare metadata; no PII beyond project / client names.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/format';

type View = {
  id: string;
  title: string;
  category: string | null;
  source: 'drive_link' | 'auto_generated' | 'upload';
  external_link: string | null;
  created_at: string;
  project_name: string | null;
  client_name: string | null;
};

type Phase = 'loading' | 'ok' | 'not_found';

export function PublicDocumentPage() {
  const { token } = useParams<{ token: string }>();
  const [phase, setPhase] = useState<Phase>('loading');
  const [doc, setDoc] = useState<View | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data, error } = await supabase.rpc('get_document_by_token', {
        p_token: token,
      });
      if (error || !data || (Array.isArray(data) && data.length === 0)) {
        setPhase('not_found');
        return;
      }
      const row = (Array.isArray(data) ? data[0] : data) as View;
      setDoc(row);
      setPhase('ok');
    })();
  }, [token]);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--canvas)' }}
    >
      <div className="w-full max-w-xl card">
        {phase === 'loading' ? <div className="text-meta">Yüklənir…</div> : null}
        {phase === 'not_found' ? (
          <>
            <h1 className="text-h2 mb-1">Sənəd tapılmadı</h1>
            <p className="text-body" style={{ color: 'var(--text-muted)' }}>
              Linki yenidən yoxlayın və ya göndərənlə əlaqə saxlayın.
            </p>
          </>
        ) : null}
        {phase === 'ok' && doc ? (
          <>
            <div
              className="text-tiny uppercase tracking-wider mb-1"
              style={{ color: 'var(--text-muted)' }}
            >
              {doc.category ?? 'Sənəd'}
              {doc.source === 'auto_generated' ? ' · auto' : ''}
            </div>
            <h1 className="text-h1 mb-2">{doc.title}</h1>
            <div className="text-meta mb-4" style={{ color: 'var(--text-muted)' }}>
              {doc.project_name ? `Layihə: ${doc.project_name}` : null}
              {doc.project_name && doc.client_name ? ' · ' : ''}
              {doc.client_name ? `Müştəri: ${doc.client_name}` : null}
            </div>
            <div className="text-meta mb-4" style={{ color: 'var(--text-muted)' }}>
              Yaradılıb: {formatDate(doc.created_at)}
            </div>
            {doc.external_link ? (
              <a
                className="btn-primary inline-block"
                href={doc.external_link}
                target="_blank"
                rel="noopener noreferrer"
              >
                Sənədi aç
              </a>
            ) : (
              <p className="text-body" style={{ color: 'var(--text-muted)' }}>
                Bu sənədin paylaşılan elektron faylı yoxdur. Studiyanın icraçısı ilə
                əlaqə saxlayın.
              </p>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
