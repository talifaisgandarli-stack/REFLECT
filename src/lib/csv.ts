/**
 * Shared CSV export helper used by Audit log + Tasks export (and future
 * exports). RFC 4180 compliant: CRLF row separator, double-quoted fields
 * containing commas/quotes/newlines, embedded quotes doubled.
 *
 * Browser-only (Blob + URL.createObjectURL); not for server use.
 */

function escapeField(v: unknown): string {
  if (v == null) return '';
  let s: string;
  if (typeof v === 'string') s = v;
  else if (v instanceof Date) s = v.toISOString();
  else if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  // Quote if it contains delimiter, quote, or newline
  if (/[",\r\n]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const headerLine = headers.map(escapeField).join(',');
  const bodyLines = rows.map((r) => headers.map((h) => escapeField(r[h])).join(','));
  // Excel + AZ Excel default ANSI: prepend BOM so UTF-8 (e.g. ə, ş, ğ) opens cleanly.
  return '﻿' + headerLine + '\r\n' + bodyLines.join('\r\n') + '\r\n';
}

export function downloadCsv(filename: string, headers: string[], rows: Array<Record<string, unknown>>): void {
  const csv = rowsToCsv(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
