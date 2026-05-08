/**
 * PDF text extraction (PRD §10.3 client-side path).
 *
 * Dynamic import of pdfjs-dist so the ~400kb bundle only loads when the
 * KB upload form is exercised. Worker is loaded from the same package
 * via the worker entry; if the runtime can't resolve the worker URL the
 * library falls back to in-thread parsing, which is slower but still works.
 */

let pdfjsModule: typeof import('pdfjs-dist') | null = null;

async function loadPdfJs(): Promise<typeof import('pdfjs-dist')> {
  if (pdfjsModule) return pdfjsModule;
  const lib = await import('pdfjs-dist');
  // pdfjs-dist >=4 ships an ESM worker entry — use module-relative URL so
  // Vite picks it up at build time without extra config.
  try {
    const workerUrl = new URL(
      // @ts-ignore — bundler-resolved path
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    );
    lib.GlobalWorkerOptions.workerSrc = workerUrl.toString();
  } catch {
    // Worker resolution failed — pdfjs falls back to fake worker (slow but works)
  }
  pdfjsModule = lib;
  return lib;
}

export async function extractPdfText(file: File): Promise<string> {
  const lib = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const doc = await lib.getDocument({ data: buf }).promise;
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ('str' in item ? (item as { str: string }).str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (line) out.push(line);
    page.cleanup();
  }
  await doc.destroy();
  return out.join('\n\n');
}
