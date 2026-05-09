/**
 * Project Documents tab — PRD §5 (Module 3 / REQ-PROJ-03).
 * Lists project_documents for a project; admins/members can add a Drive link
 * (storage_path upload is a v1.5 candidate — Supabase storage bucket TBD).
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/format';

type DocSource = 'drive_link' | 'auto_generated' | 'upload';

type Doc = {
  id: string;
  project_id: string | null;
  category: string | null;
  title: string;
  source: DocSource;
  external_link: string | null;
  storage_path: string | null;
  created_at: string;
};

const CATEGORIES = ['contract', 'price_protocol', 'akt', 'drawing', 'note', 'other'];
const CATEGORY_LABEL: Record<string, string> = {
  contract: 'Müqavilə',
  price_protocol: 'Qiymət protokolu',
  akt: 'Akt',
  drawing: 'Çertyoj',
  note: 'Qeyd',
  other: 'Digər',
};

export function DocumentsPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const docs = useQuery({
    queryKey: ['documents', projectId],
    queryFn: async () =>
      ((
        await supabase
          .from('project_documents')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
      ).data ?? []) as Doc[],
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setOpen(true)}>
          + Sənəd əlavə et
        </button>
      </div>

      {(docs.data ?? []).length === 0 ? (
        <div className="card text-meta" style={{ color: 'var(--text-muted)' }}>
          Bu layihəyə hələ sənəd əlavə edilməyib.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Ad', 'Kateqoriya', 'Mənbə', 'Əlavə edilib', 'Link'].map((h) => (
                  <th
                    key={h}
                    className="text-left py-3 px-3 text-meta"
                    style={{
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(docs.data ?? []).map((d) => (
                <tr key={d.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  <td className="py-3 px-3">{d.title}</td>
                  <td className="py-3 px-3">
                    {d.category ? CATEGORY_LABEL[d.category] ?? d.category : '—'}
                  </td>
                  <td className="py-3 px-3 text-meta" style={{ color: 'var(--text-muted)' }}>
                    {d.source}
                  </td>
                  <td className="py-3 px-3">{formatDate(d.created_at)}</td>
                  <td className="py-3 px-3">
                    {d.external_link ? (
                      <a
                        href={d.external_link}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'var(--brand-text)' }}
                      >
                        aç →
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open ? (
        <DocAddModal
          projectId={projectId}
          onClose={() => {
            setOpen(false);
            qc.invalidateQueries({ queryKey: ['documents', projectId] });
          }}
        />
      ) : null}
    </div>
  );
}

function DocAddModal({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('contract');
  const [link, setLink] = useState('');

  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('project_documents').insert({
        project_id: projectId,
        title,
        category,
        source: 'drive_link' as DocSource,
        external_link: link || null,
      });
      if (error) throw error;
    },
    onSuccess: () => onClose(),
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
    >
      <div className="card max-w-md w-full space-y-3">
        <h3 className="text-h3">Sənəd əlavə et</h3>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Ad
          </span>
          <input
            className="input mt-1 w-full"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Kateqoriya
          </span>
          <select
            className="input mt-1 w-full"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Drive linki
          </span>
          <input
            className="input mt-1 w-full"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://drive.google.com/..."
          />
        </label>
        <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
          Birbaşa fayl yükləməsi v1.5-də (Supabase Storage bucket konfiqurasiyası lazımdır).
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-outline" onClick={onClose}>
            Ləğv et
          </button>
          <button
            className="btn-primary"
            disabled={!title || submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? '…' : 'Yadda saxla'}
          </button>
        </div>
      </div>
    </div>
  );
}
