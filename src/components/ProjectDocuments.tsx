/**
 * Project documents tab (REQ-PROJ-03 + Module 5 absorbed Sənəd Arxivi).
 * Sources supported in v1: drive_link, auto_generated, and now upload via
 * the `project-documents` Supabase storage bucket (migration 0016).
 *
 * Public sharing uses share_token (unique on project_documents); the
 * existing /share/* path (used by retrospective surveys) is a sibling
 * route — we expose copy-to-clipboard so authors can hand the URL out.
 */
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';
import { formatDate } from '@/lib/format';
import { useT } from '@/lib/i18n';

type Translator = ReturnType<typeof useT>;

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

const STORAGE_BUCKET = 'project-documents';
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file
const ACCEPT_RE =
  /^(application\/(pdf|msword|vnd\.openxmlformats-officedocument\.|vnd\.ms-excel|zip|json|rtf)|image\/(png|jpe?g|webp|gif|svg\+xml)|text\/(plain|csv))/i;
const ACCEPT_ATTR =
  '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp,.svg,.zip,.json,.rtf';

function describeFileError(file: File, t: Translator): string | null {
  if (file.size > MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return t('docs.upload.too_big', { name: file.name, mb });
  }
  if (file.type && !ACCEPT_RE.test(file.type)) {
    return t('docs.upload.bad_type', { name: file.name, type: file.type });
  }
  return null;
}

export function ProjectDocuments({ projectId }: Props) {
  const t = useT();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    // Pre-flight: size + content-type. Reject the whole batch if any file
    // fails — partial uploads are confusing when the user dropped 5 docs
    // expecting all-or-nothing.
    const errors = files.map((f) => describeFileError(f, t)).filter(Boolean) as string[];
    if (errors.length > 0) {
      setUploadError(errors.join(' · '));
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setProgress({ done: 0, total: files.length });
    setUploadError(null);
    let i = 0;
    try {
      for (const file of files) {
        const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, '_');
        const path = `${projectId}/${Date.now()}-${i}-${safe}`;
        const { error: upErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, file, {
            cacheControl: '3600',
            upsert: false,
            contentType: file.type || 'application/octet-stream',
          });
        if (upErr) throw upErr;

        const { error: insErr } = await supabase.from('project_documents').insert({
          project_id: projectId,
          title: file.name,
          category: null,
          source: 'upload',
          storage_path: path,
          created_by: profile?.id ?? null,
        });
        if (insErr) throw insErr;
        i += 1;
        setProgress({ done: i, total: files.length });
      }
      qc.invalidateQueries({ queryKey: ['project-docs', projectId] });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : t('docs.upload.failed'));
    } finally {
      // Defer clearing the progress chip so the user sees the final "N/N"
      setTimeout(() => setProgress(null), 1200);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function openUpload(d: Doc) {
    if (!d.storage_path) return;
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(d.storage_path, 60 * 5);
    if (error || !data?.signedUrl) {
      alert(error?.message ?? t('docs.upload.link_failed'));
      return;
    }
    window.open(data.signedUrl, '_blank', 'noreferrer,noopener');
  }

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
      <div className="flex flex-wrap justify-between items-center gap-3">
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
          {t('docs.intro')}
        </p>
        <span className="flex flex-wrap gap-2 items-center">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            className="sr-only"
            onChange={(e) => {
              const fs = Array.from(e.target.files ?? []);
              if (fs.length > 0) uploadFiles(fs);
            }}
          />
          <button
            type="button"
            className="btn-outline"
            onClick={() => fileRef.current?.click()}
            disabled={!!progress}
          >
            {progress
              ? t('docs.upload.progress', { done: progress.done, total: progress.total })
              : t('docs.upload.cta')}
          </button>
          <button className="btn-primary" onClick={() => setAdding(true)}>
            {t('docs.add_drive')}
          </button>
        </span>
      </div>
      {progress ? (
        <div
          aria-label={t('docs.upload.aria_progress')}
          className="rounded-full overflow-hidden"
          style={{ background: 'var(--surface-mist)', height: 6, maxWidth: 320 }}
        >
          <div
            style={{
              width: `${Math.round((progress.done / progress.total) * 100)}%`,
              height: '100%',
              background: 'var(--brand-action)',
              transition: 'width var(--dur-base) var(--ease-out)',
            }}
          />
        </div>
      ) : null}
      {uploadError ? (
        <p className="text-meta" style={{ color: 'var(--state-error)' }}>
          {uploadError}
        </p>
      ) : null}

      {docs.isLoading ? (
        <div className="card text-meta">{t('common.loading')}</div>
      ) : (docs.data ?? []).length === 0 ? (
        <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
          {t('docs.list.empty')}
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
                      ? t('docs.source.drive')
                      : d.source === 'auto_generated'
                        ? t('docs.source.template')
                        : t('docs.source.upload')}
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
                    {t('docs.action.open')}
                  </a>
                ) : d.storage_path ? (
                  <button
                    type="button"
                    className="chip chip-brand"
                    onClick={() => openUpload(d)}
                  >
                    {t('docs.action.open')}
                  </button>
                ) : null}
                {d.share_token ? (
                  <button
                    type="button"
                    className="chip"
                    onClick={() => {
                      const url = `${window.location.origin}/share/${d.share_token}`;
                      navigator.clipboard?.writeText(url);
                    }}
                    title={t('docs.action.share_copy_tooltip')}
                  >
                    {t('docs.action.share_copy')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="chip"
                    onClick={() => enableShare.mutate(d)}
                    disabled={enableShare.isPending}
                  >
                    {enableShare.isPending ? '…' : t('docs.action.share')}
                  </button>
                )}
                <button
                  type="button"
                  className="chip"
                  onClick={() => {
                    if (confirm(t('docs.action.delete_confirm', { name: d.title })))
                      remove.mutate(d.id);
                  }}
                  style={{ background: 'var(--state-error-soft)', color: 'var(--state-error)' }}
                >
                  {t('docs.action.delete')}
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
  const t = useT();
  const { profile } = useAuth();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [link, setLink] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error(t('docs.modal.title_required'));
      if (!link.trim()) throw new Error(t('docs.modal.link_required'));
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
      aria-label={t('docs.modal.dialog_label')}
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
        <h2 className="text-h2">{t('docs.modal.title')}</h2>
        <p className="text-meta mt-1" style={{ color: 'var(--text-muted)' }}>
          {t('docs.modal.intro')}
        </p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              {t('docs.modal.field.title')}
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
              {t('docs.modal.field.category')}
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
              {t('docs.modal.field.link')}
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
          <p className="text-meta mt-3" style={{ color: 'var(--state-error)' }}>
            {(save.error as Error).message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn-outline" onClick={onClose} disabled={save.isPending}>
            {t('common.back')}
          </button>
          <button type="submit" className="btn-primary" disabled={save.isPending || !title || !link}>
            {save.isPending ? t('docs.modal.saving') : t('docs.modal.submit')}
          </button>
        </div>
      </form>
    </div>
  );
}
