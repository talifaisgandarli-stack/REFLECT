/**
 * Bilik Bazası ingestion + library — Settings → Bilik Bazası.
 * PRD §7.4 + §10.3. v1 accepts MD/TXT only (PDFs deferred per product
 * decision).
 *
 * Lists existing knowledge_base sources grouped by source_pdf, with chunk
 * counts. Re-ingest replaces all rows for the same source label (server-side
 * idempotency).
 */
import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

async function authedPost(path: string, body: unknown) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sessiya tapılmadı');
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; chunks?: number };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

type KbRow = { source_pdf: string; chunk_index: number; uploaded_at: string };

export function KnowledgeBasePanel() {
  const qc = useQueryClient();
  const sources = useQuery({
    queryKey: ['kb', 'sources'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_base')
        .select('source_pdf, chunk_index, uploaded_at')
        .order('uploaded_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      const byPdf = new Map<string, { chunks: number; uploaded_at: string }>();
      for (const r of (data ?? []) as KbRow[]) {
        const cur = byPdf.get(r.source_pdf);
        if (!cur || r.uploaded_at > cur.uploaded_at) {
          byPdf.set(r.source_pdf, {
            chunks: (cur?.chunks ?? 0) + 1,
            uploaded_at: r.uploaded_at,
          });
        } else {
          cur.chunks += 1;
        }
      }
      return Array.from(byPdf.entries()).map(([source_pdf, v]) => ({
        source_pdf,
        chunks: v.chunks,
        uploaded_at: v.uploaded_at,
      }));
    },
  });

  const ingest = useMutation({
    mutationFn: (input: { source_pdf: string; content: string }) =>
      authedPost('/api/mirai/ingest', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kb'] }),
  });

  const remove = useMutation({
    mutationFn: async (source_pdf: string) => {
      const { error } = await supabase
        .from('knowledge_base')
        .delete()
        .eq('source_pdf', source_pdf);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kb'] }),
  });

  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setOkMsg(null);
    try {
      const out = await ingest.mutateAsync({ source_pdf: name.trim(), content });
      setOkMsg(`${out.chunks} parça əlavə edildi.`);
      setContent('');
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function onFile(file: File) {
    const text = await file.text();
    setContent(text);
    if (!name) setName(file.name.replace(/\.(md|txt)$/i, ''));
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-h3 mb-2">Yeni mənbə əlavə et</h3>
        <p className="text-meta mb-3" style={{ color: 'var(--text-muted)' }}>
          v1: yalnız mətn / Markdown. Eyni adlı təkrar yükləmə köhnə parçaları əvəz edir.
        </p>
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Mənbə adı *</span>
            <input
              type="text"
              required
              className="input mt-1"
              placeholder="AZDNT 1.01-2017"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Fayl yüklə (.md / .txt)</span>
            <input
              type="file"
              accept=".md,.txt,text/markdown,text/plain"
              className="input mt-1"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
          </label>
          <label className="block">
            <span className="text-meta" style={{ color: 'var(--text-muted)' }}>Mətn (yapışdır)</span>
            <textarea
              required
              className="input mt-1"
              style={{ height: 200, padding: 12 }}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </label>
          {err ? <p className="text-meta" style={{ color: '#B91C1C' }}>{err}</p> : null}
          {okMsg ? <p className="text-meta" style={{ color: 'var(--brand-text)' }}>{okMsg}</p> : null}
          <button
            type="submit"
            className="btn-primary"
            disabled={ingest.isPending || !name.trim() || !content.trim()}
          >
            {ingest.isPending ? 'Embed olunur…' : 'Yüklə və embed et'}
          </button>
        </form>
      </div>

      <div>
        <h3 className="text-h3 mb-2">Mövcud mənbələr</h3>
        {sources.isLoading ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>Yüklənir…</p>
        ) : (sources.data ?? []).length === 0 ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>Hələ mənbə yoxdur.</p>
        ) : (
          <table className="w-full text-body">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Mənbə', 'Parça', 'Yüklənib', ''].map((h) => (
                  <th
                    key={h}
                    className="text-left py-2 px-3 text-meta"
                    style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(sources.data ?? []).map((s) => (
                <tr key={s.source_pdf} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  <td className="py-2 px-3">{s.source_pdf}</td>
                  <td className="py-2 px-3" style={{ fontVariantNumeric: 'tabular-nums' }}>{s.chunks}</td>
                  <td className="py-2 px-3 text-meta" style={{ color: 'var(--text-muted)' }}>
                    {new Date(s.uploaded_at).toLocaleDateString('az-Latn-AZ')}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button
                      type="button"
                      className="btn-outline"
                      style={{ height: 32, padding: '0 12px' }}
                      onClick={() => {
                        if (confirm(`"${s.source_pdf}" mənbəsini silmək istəyirsən?`)) {
                          remove.mutate(s.source_pdf);
                        }
                      }}
                      disabled={remove.isPending}
                    >
                      Sil
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
