/**
 * REQ-CRM-06 — Public read-only document viewer, no auth required.
 * Accessed via /docs/:token — share_token from project_documents.
 * Shows proposal/invoice metadata + external_link if present.
 */
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

type SharedDocument = {
  id: string;
  title: string;
  category: string;
  source: string;
  external_link: string | null;
  created_at: string;
  projects: { name: string } | null;
  clients: { name: string } | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  price_protocol: 'Qiymət Protokolu',
  invoice: 'Faktura',
  contract: 'Müqavilə',
  act: 'Akt',
  other: 'Sənəd',
};

export function SharedDocPage() {
  const { token } = useParams<{ token: string }>();

  const { data: doc, isLoading, error } = useQuery<SharedDocument | null>({
    queryKey: ['shared_doc', token],
    queryFn: async () => {
      if (!token) return null;
      const { data, error } = await supabase
        .from('project_documents')
        .select('id, title, category, source, external_link, created_at, projects(name), clients(name)')
        .eq('share_token', token)
        .maybeSingle();
      if (error) throw error;
      return data as SharedDocument | null;
    },
    enabled: !!token,
    retry: false,
  });

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0E1611',
        color: '#E8F0EB',
        fontFamily: 'Inter, system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '48px 24px',
      }}
    >
      {/* Brand header */}
      <div style={{ marginBottom: 40, textAlign: 'center' }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: '#ADFB49',
            margin: '0 auto 12px',
          }}
        />
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Reflect Architects OS
        </div>
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: 640,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16,
          padding: '40px 36px',
        }}
      >
        {isLoading ? (
          <p style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>Yüklənir…</p>
        ) : error || !doc ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}>404</p>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15 }}>
              Sənəd tapılmadı və ya link etibarsızdır.
            </p>
          </div>
        ) : (
          <>
            {/* Category badge */}
            <div style={{ marginBottom: 20 }}>
              <span
                style={{
                  display: 'inline-block',
                  background: 'rgba(173,251,73,0.1)',
                  color: '#ADFB49',
                  border: '1px solid rgba(173,251,73,0.25)',
                  borderRadius: 20,
                  padding: '3px 12px',
                  fontSize: 12,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                {CATEGORY_LABEL[doc.category] ?? doc.category}
              </span>
            </div>

            {/* Title */}
            <h1 style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.25, marginBottom: 24, letterSpacing: '-0.02em' }}>
              {doc.title}
            </h1>

            {/* Meta */}
            <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', marginBottom: 32 }}>
              {doc.clients?.name ? (
                <>
                  <dt style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Müştəri
                  </dt>
                  <dd style={{ fontSize: 15, margin: 0 }}>{doc.clients.name}</dd>
                </>
              ) : null}
              {doc.projects?.name ? (
                <>
                  <dt style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Layihə
                  </dt>
                  <dd style={{ fontSize: 15, margin: 0 }}>{doc.projects.name}</dd>
                </>
              ) : null}
              <dt style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Tarix
              </dt>
              <dd style={{ fontSize: 15, margin: 0 }}>
                {new Date(doc.created_at).toLocaleDateString('az-AZ', {
                  year: 'numeric', month: 'long', day: 'numeric',
                })}
              </dd>
            </dl>

            {/* External link CTA */}
            {doc.external_link ? (
              <a
                href={doc.external_link}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: '#ADFB49',
                  color: '#0E1611',
                  borderRadius: 8,
                  padding: '10px 20px',
                  fontWeight: 600,
                  fontSize: 14,
                  textDecoration: 'none',
                }}
              >
                Sənədi aç ↗
              </a>
            ) : (
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>
                Sənədin məzmunu bu şirkət tərəfindən bilavasitə göndəriləcək.
              </p>
            )}

            <hr style={{ margin: '32px 0', borderColor: 'rgba(255,255,255,0.06)', borderWidth: '1px 0 0' }} />

            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>
              Bu sənəd Reflect Architects OS vasitəsilə paylaşılıb.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
