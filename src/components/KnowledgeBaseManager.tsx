/**
 * Bilik Bazası — admin UI for the knowledge base (PRD §10.3).
 *
 * v1: hand-pasted text → server-side chunk + embed via /api/knowledge/ingest.
 * Real PDF upload + extraction is a v1.5 candidate; this surface unblocks
 * MIRAI's RAG path immediately by letting an admin paste an excerpt of
 * AZDNT normatives or contract law sections and have them indexed.
 */
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { extractPdfText } from '@/lib/pdf';

type GroupRow = { source_pdf: string; chunks: number; latest: string | null };

const CHUNK_TARGET_CHARS = 1200;

function chunkText(raw: string): string[] {
  const text = raw.trim().replace(/\r\n/g, '\n');
  if (!text) return [];
  // Split on blank-line first; if a "paragraph" is huge, sub-split by sentence.
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  const chunks: string[] = [];
  let buf = '';
  for (const p of paragraphs) {
    if ((buf + '\n\n' + p).length > CHUNK_TARGET_CHARS) {
      if (buf) chunks.push(buf);
      if (p.length <= CHUNK_TARGET_CHARS) {
        buf = p;
      } else {
        const sentences = p.split(/(?<=[.!?])\s+/);
        let inner = '';
        for (const s of sentences) {
          if ((inner + ' ' + s).length > CHUNK_TARGET_CHARS) {
            if (inner) chunks.push(inner);
            inner = s;
          } else {
            inner = inner ? `${inner} ${s}` : s;
          }
        }
        if (inner) buf = inner;
        else buf = '';
      }
    } else {
      buf = buf ? `${buf}\n\n${p}` : p;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

export function KnowledgeBaseManager() {
  const qc = useQueryClient();
  const [source, setSource] = useState('');
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPickPdf(file: File) {
    setParsing(true);
    setParseError(null);
    try {
      const extracted = await extractPdfText(file);
      if (!extracted.trim()) {
        setParseError(
          'Bu PDF-dən mətn çıxarmaq mümkün olmadı (skan/şəkil ola bilər). Əl ilə yapışdır.',
        );
        return;
      }
      if (!source) setSource(file.name);
      setText(extracted);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'PDF oxunması alınmadı');
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const groups = useQuery({
    queryKey: ['kb', 'groups'],
    queryFn: async (): Promise<GroupRow[]> => {
      const { data, error } = await supabase
        .from('knowledge_base')
        .select('source_pdf, uploaded_at')
        .order('uploaded_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      const map = new Map<string, GroupRow>();
      for (const r of (data ?? []) as Array<{ source_pdf: string; uploaded_at: string }>) {
        const cur = map.get(r.source_pdf) ?? {
          source_pdf: r.source_pdf,
          chunks: 0,
          latest: r.uploaded_at,
        };
        cur.chunks += 1;
        if (!cur.latest || cur.latest < r.uploaded_at) cur.latest = r.uploaded_at;
        map.set(r.source_pdf, cur);
      }
      return Array.from(map.values()).sort(
        (a, b) => (b.latest ?? '').localeCompare(a.latest ?? ''),
      );
    },
  });

  const previewChunks = useMemo(() => chunkText(text), [text]);

  const ingest = useMutation({
    mutationFn: async () => {
      if (!source.trim()) throw new Error('Mənbə adı tələb olunur');
      if (previewChunks.length === 0) throw new Error('Mətn boşdur');
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('Sessiya tapılmadı');

      const res = await fetch('/api/knowledge/ingest', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ source_pdf: source.trim(), chunks: previewChunks }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Server xətası (${res.status})`);
      }
    },
    onSuccess: () => {
      setText('');
      qc.invalidateQueries({ queryKey: ['kb'] });
    },
  });

  const remove = useMutation({
    mutationFn: async (sourcePdf: string) => {
      const { error } = await supabase
        .from('knowledge_base')
        .delete()
        .eq('source_pdf', sourcePdf);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kb'] }),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px,1fr] gap-5">
      <aside>
        <h3 className="text-h3 mb-3">Mənbələr</h3>
        {groups.isLoading ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Yüklənir…
          </p>
        ) : (groups.data ?? []).length === 0 ? (
          <p className="text-meta" style={{ color: 'var(--text-muted)' }}>
            Hələ yüklənmiş mənbə yoxdur.
          </p>
        ) : (
          <ul className="space-y-2">
            {(groups.data ?? []).map((g) => (
              <li
                key={g.source_pdf}
                className="card flex items-center justify-between gap-2"
                style={{ padding: 12 }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-body font-medium truncate">{g.source_pdf}</div>
                  <div className="text-meta" style={{ color: 'var(--text-muted)' }}>
                    {g.chunks} chunk
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    if (confirm(`${g.source_pdf} silinsin?`)) {
                      remove.mutate(g.source_pdf);
                    }
                  }}
                  style={{ height: 28, padding: '0 10px', color: '#B91C1C' }}
                >
                  Sil
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="card">
        <h3 className="text-h3 mb-3">Yeni mənbə əlavə et</h3>
        <p className="text-meta mb-4" style={{ color: 'var(--text-muted)' }}>
          PDF faylını seç və ya mətnini birbaşa yapışdır — server chunk-laşdırıb
          embed edəcək. Eyni mənbə adı yenidən yüklənərsə əvvəlki chunk-lar əvəz olunur.
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPickPdf(f);
            }}
          />
          <button
            type="button"
            className="btn-outline"
            onClick={() => fileRef.current?.click()}
            disabled={parsing}
          >
            {parsing ? 'PDF oxunur…' : 'PDF seç'}
          </button>
          <span className="text-meta" style={{ color: 'var(--text-muted)' }}>
            scan deyil, mətn-əsaslı PDF işləyir
          </span>
        </div>
        {parseError ? (
          <p className="text-meta mb-3" style={{ color: '#B91C1C' }}>
            {parseError}
          </p>
        ) : null}

        <label className="block">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
            Mənbə adı (məs. AZDNT_2.04-2017.pdf)
          </span>
          <input
            className="input"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Şəhərsalma_TŞ_v3.pdf"
          />
        </label>

        <label className="block mt-3">
          <span className="text-meta block mb-1" style={{ color: 'var(--text-muted)' }}>
            Mətn ({previewChunks.length} chunk olacaq)
          </span>
          <textarea
            className="input font-mono"
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{ minHeight: 220, padding: '12px 14px', whiteSpace: 'pre-wrap' }}
            placeholder="PDF məzmununu kopyalayıb buraya yapışdır…"
          />
        </label>

        {ingest.error ? (
          <p className="text-meta mt-3" style={{ color: '#B91C1C' }}>
            {(ingest.error as Error).message}
          </p>
        ) : null}

        <div className="flex justify-end mt-4">
          <button
            type="button"
            className="btn-primary"
            onClick={() => ingest.mutate()}
            disabled={ingest.isPending || !source || previewChunks.length === 0}
          >
            {ingest.isPending
              ? 'Embed olunur…'
              : `Yüklə (${previewChunks.length} chunk)`}
          </button>
        </div>

        <details className="mt-4">
          <summary className="text-h4 cursor-pointer">Chunk önbaxışı</summary>
          {previewChunks.length === 0 ? (
            <p className="text-meta mt-2" style={{ color: 'var(--text-muted)' }}>
              Mətn yazıldıqca chunk-lar burada görünəcək.
            </p>
          ) : (
            <ol className="mt-2 space-y-2">
              {previewChunks.slice(0, 8).map((c, i) => (
                <li
                  key={i}
                  className="rounded-btn p-2 text-meta"
                  style={{
                    background: 'var(--surface-mist)',
                    border: '1px solid var(--line-soft)',
                    whiteSpace: 'pre-wrap',
                    color: 'var(--text-soft)',
                  }}
                >
                  <div
                    className="text-tiny mb-1"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Chunk {i + 1} · {c.length} simvol
                  </div>
                  {c.length > 240 ? `${c.slice(0, 240)}…` : c}
                </li>
              ))}
              {previewChunks.length > 8 ? (
                <li className="text-meta" style={{ color: 'var(--text-muted)' }}>
                  +{previewChunks.length - 8} chunk daha
                </li>
              ) : null}
            </ol>
          )}
        </details>
      </section>
    </div>
  );
}
