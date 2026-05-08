/**
 * Project documents tab (REQ-PROJ-03 + Module 5 absorbed Sənəd Arxivi).
 * Sources supported in v1: drive_link (URL paste) and auto_generated
 * (created elsewhere). Direct uploads are storage-bucket work and
 * deferred; for now the tab is a registry of links and generated docs.
 *
 * Public sharing uses share_token (unique on project_documents); the
 * existing /share/* path (used by retrospective surveys) is a sibling
 * route — we expose copy-to-clipboard so authors can hand the URL out.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { formatDate } from '@/lib/format';

type Doc = {
  id: string;
  project_id: string | null;
  client_id: string | null;
  category: string | null;
  title: string;
  source: 'drive_link' | 'auto_generated' | 'upload';
  external_link: string | null;
  storage_path: string | null;
  share_token: string | null;
  created_at: string;
};

const CATEGORIES = [
  'Müqavilə',
  'Akt',
  'Faktura',
  'TŞ',
  'Çertyoj',
  'Ekspertiza',
  'Qiymət protokolu',
  'Digər',
] as const;

type Props = { projectId: string };

export function ProjectDocuments({ projectId }: Props) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);

  const docs = useQuery({
    queryKey: ['project-docs', projectId],
    queryFn: async (): Promise<Doc[]> => {
      const { data, error } = await supabase
        .from('project_documents')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Doc[];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('project_documents').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-docs', projectId] }),
  });

  const enableShare = useMutation({
    mutationFn: async (doc: Doc) => {
      // urlsafe-ish token; collisions are extremely unlikely at this scale
      const tok = crypto.getRandomValues(new Uint8Array(18));
      const b64 = btoa(String.fromCharCode(...tok))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
      const { error } = await supabase
        .from('project_documents')
        .update({ share_token: b64 })
        .eq('id', doc.id);
      if (error) throw error;
      return b64;
    },
    onSuccess: (token) => {
      qc.invalidateQueries({ queryKey: ['project-docs', projectId] });
      navigator.clipboard?.writeText(`${window.location.origin}/share/${token}`);
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Sənədlər — Drive linki, avtomat-yaradılanlar (məsələn, akt
          şablonu) və paylaşım tokenləri burada toplanır.
        </p>
        <button className="btn-primary" onClick={() => setAdding(true)}>
          + Sənəd
        </button>
      </div>

      {docs.isLoading ? (
        <div className="card text-meta">Yüklənir…</div>
      ) : (docs.data ?? []).length === 0 ? (
        <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
          Bu layihə üçün sənəd yoxdur. Drive linki yapışdır və ya akt yarat.
        </div>
      ) : (
        <ul className="space-y-2">
          {(docs.data ?? []).map((d) => (
            <li
              key={d.id}
              className="card flex items-start justify-between gap-3"
              style={{ padding: 14 }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-body font-medium truncate">{d.title}</span>
                  <span
                    className="chip"
                    style={{
                      background: 'var(--surface-mist)',
                      color: 'var(--text-soft)',
                      height: 20,
                      padding: '0 8px',
                    }}
                  >
                    {d.source === 'drive_link'
                      ? 'Drive'
                      : d.source === 'auto_generated'
                        ? 'Şablon'
                        : 'Yüklənmiş'}
                  </span>
                  {d.category ? (
                    <span
                      className="chip"
                      style={{ height: 20, padding: '0 8px' }}
                    >
                      {d.category}
                    </span>
                  ) : null}
                </div>
                <div className="text-meta mt-1" style={{ color: 'var(--text-muted)' }}>
                  {formatDate(d.created_at)}
                </div>
              </div>
              <div className="flex flex-wrap gap-1 shrink-0">
                {d.external_link ? (
                  <a
                    href={d.external_link}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="chip chip-brand"
                  >
                    Aç
                  </a>
                ) : null}
                {d.share_token ? (
                  <button
                    type="button"
                    className="chip"
                    onClick={() => {
                      const url = `${window.location.origin}/share/${d.share_token}`;
                      navigator.clipboard?.writeText(url);
                    }}
                    title="Paylaşım linkini kopyala"
                  >
                    Link kopya
                  </button>
                ) : (
                  <button
                    type="button"
                    className="chip"
                    onClick={() => enableShare.mutate(d)}
                    disabled={enableShare.isPending}
                  >
                    {enableShare.isPending ? '…' : 'Paylaş'}
                  </button>
                )}
                <button
                  type="button"
                  className="chip"
                  onClick={() => {
                    if (confirm(`${d.title} silinsin?`)) remove.mutate(d.id);
                  }}
                  style={{ background: '#FEEEED', color: '#B91C1C' }}
                >
                  Sil
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <DocumentModal
          projectId={projectId}
          onClose={() => {
            setAdding(false);
            qc.invalidateQueries({ queryKey: ['project-docs', projectId] });
          }}
        />
      ) : null}
    </div>
  );
}

function DocumentModal({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [link, setLink] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error('Başlıq tələb olunur');
      if (!link.trim()) throw new Error('Drive/URL linki tələb olunur (v1)');
      const { error } = await supabase.from('project_documents').insert({
        project_id: projectId,
        title: title.trim(),
        category,
        source: 'drive_link',
        external_link: link.trim(),
        created_by: profile?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: onClose,
  });

  return (
    <div
      role="dialog"
      aria-label="Sənəd əlavə et"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
        className="card w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        style={{ padding: 24 }}
      >
        <h2 className="text-h2">+ Sənəd</h2>
        <p className="text-meta mt-1" style={{ color: 'var(--text-muted)' }}>
          v1: Drive/Dropbox linki (faktiki upload v1.5-də əlavə olunacaq).
        </p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Başlıq
            </span>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              required
            />
          </label>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Kateqoriya
            </span>
            <select
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Link
            </span>
            <input
              className="input"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://drive.google.com/…"
              required
            />
          </label>
        </div>

        {save.error ? (
          <p className="text-meta mt-3" style={{ color: '#B91C1C' }}>
            {(save.error as Error).message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn-outline" onClick={onClose} disabled={save.isPending}>
            Geri
          </button>
          <button type="submit" className="btn-primary" disabled={save.isPending || !title || !link}>
            {save.isPending ? 'Yadda saxlanılır…' : 'Yarat'}
          </button>
        </div>
      </form>
    </div>
  );
}
