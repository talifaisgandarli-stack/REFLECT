/**
 * REQ-CRM-06 — Create proposal (price_protocol document).
 * Inserts into project_documents with category='price_protocol'.
 * PRD §5 Module 6: optional project_id; share_token enables public read-only access.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/store';

type Source = 'drive_link' | 'auto_generated' | 'upload';

const SOURCE_LABEL: Record<Source, string> = {
  drive_link: 'Google Drive linki',
  auto_generated: 'MIRAI ilə generasiya',
  upload: 'Faylı yüklə',
};

type Props = {
  clientId?: string | null;
  projectId?: string | null;
  onClose: () => void;
  onCreated?: () => void;
};

export function ProposalCreateModal({ clientId, projectId, onClose, onCreated }: Props) {
  const { profile } = useAuth();
  const qc = useQueryClient();

  const [title, setTitle] = useState('');
  const [source, setSource] = useState<Source>('drive_link');
  const [externalLink, setExternalLink] = useState('');
  const [storagePath, setStoragePath] = useState('');
  const [generateShare, setGenerateShare] = useState(false);

  const create = useMutation({
    mutationFn: async () => {
      const trimmed = title.trim();
      if (!trimmed) throw new Error('Başlıq tələb olunur');
      if (source === 'drive_link' && !externalLink.trim()) {
        throw new Error('Drive linki tələb olunur');
      }

      const payload = {
        title: trimmed,
        category: 'price_protocol',
        source,
        external_link: source === 'drive_link' ? externalLink.trim() : null,
        storage_path: source === 'upload' ? storagePath.trim() || null : null,
        share_token: generateShare ? crypto.randomUUID() : null,
        project_id: projectId ?? null,
        client_id: clientId ?? null,
        created_by: profile?.id ?? null,
      };

      const { error } = await supabase.from('project_documents').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-proposals'] });
      qc.invalidateQueries({ queryKey: ['project-proposals'] });
      onCreated?.();
      onClose();
    },
  });

  return (
    <div
      role="dialog"
      aria-label="Yeni təklif"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{ background: 'rgba(14,22,17,0.4)' }}
      onClick={onClose}
    >
      <form
        className="card w-full max-w-md"
        style={{ padding: 24 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <h2 className="text-h2 mb-4">Yeni təklif</h2>

        <div className="space-y-3">
          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Başlıq <span style={{ color: '#B91C1C' }}>*</span>
            </span>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Qiymət protokolu — Aksent Group"
              autoFocus
              required
            />
          </label>

          <label className="block">
            <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
              Mənbə
            </span>
            <select
              className="input"
              value={source}
              onChange={(e) => setSource(e.target.value as Source)}
            >
              {(Object.entries(SOURCE_LABEL) as [Source, string][]).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>

          {source === 'drive_link' && (
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Drive URL <span style={{ color: '#B91C1C' }}>*</span>
              </span>
              <input
                type="url"
                className="input"
                value={externalLink}
                onChange={(e) => setExternalLink(e.target.value)}
                placeholder="https://drive.google.com/…"
                required
              />
            </label>
          )}

          {source === 'upload' && (
            <label className="block">
              <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
                Storage path
              </span>
              <input
                className="input"
                value={storagePath}
                onChange={(e) => setStoragePath(e.target.value)}
                placeholder="proposals/2026/aksent.pdf"
              />
              <span className="text-meta mt-1 block" style={{ color: 'var(--text-muted)' }}>
                Real fayl yüklənməsi v1.5-də gələcək.
              </span>
            </label>
          )}

          {source === 'auto_generated' && (
            <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
              MIRAI sənədi sonra hazırlayacaq — link bu rola yazılacaq.
            </p>
          )}

          <label className="flex items-center gap-2 text-body cursor-pointer">
            <input
              type="checkbox"
              checked={generateShare}
              onChange={(e) => setGenerateShare(e.target.checked)}
            />
            Müştəri üçün public link yarat (read-only)
          </label>
        </div>

        {create.error ? (
          <p className="text-meta mt-3" style={{ color: '#B91C1C' }}>
            {(create.error as Error).message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" className="btn-outline" onClick={onClose} disabled={create.isPending}>
            Geri
          </button>
          <button type="submit" className="btn-primary" disabled={create.isPending || !title.trim()}>
            {create.isPending ? 'Yaradılır…' : 'Yarat'}
          </button>
        </div>
      </form>
    </div>
  );
}
