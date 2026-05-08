/**
 * Lightweight export helpers used by Hesabatlar + Templates.
 *
 * - CSV (RFC 4180-ish): UTF-8 BOM so Excel auto-detects, fields quoted +
 *   doubled-quote escaped where needed.
 * - "Excel" output is the same CSV with a .xls.csv hint — Excel/LibreOffice
 *   open it natively, no SheetJS bundle bloat.
 * - PDF: opens window.print() against a print-only container the caller
 *   provides; user picks "Save as PDF" in the system dialog. Avoids
 *   server-side rendering (jsPDF / puppeteer adds 200kb+).
 */

function escapeCsv(value: unknown): string {
  if (value == null) return '';
  const s = typeof value === 'string' ? value : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(escapeCsv).join(',')];
  for (const row of rows) lines.push(row.map(escapeCsv).join(','));
  return '﻿' + lines.join('\r\n');
}

export function downloadCsv(filename: string, headers: string[], rows: Array<Array<unknown>>) {
  const csv = rowsToCsv(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Print a section of the document. The caller wraps the printable region
 * with `data-print-root`; we toggle `.print-active` on <body> so the CSS
 * media-print rule (src/styles/index.css) hides everything else.
 */
export function printSection() {
  document.body.classList.add('print-active');
  requestAnimationFrame(() => {
    window.print();
    setTimeout(() => {
      document.body.classList.remove('print-active');
    }, 500);
  });
}
