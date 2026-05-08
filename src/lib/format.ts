/** All date math runs in Asia/Baku per PRD §7 (REQ-FIN-09). */
export const TZ = 'Asia/Baku';

const azn = new Intl.NumberFormat('az-AZ', {
  style: 'currency',
  currency: 'AZN',
  maximumFractionDigits: 0,
});

export function formatAZN(n: number | null | undefined): string {
  if (n == null) return '—';
  return azn.format(n);
}

export function formatDate(iso: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('az-AZ', {
    timeZone: TZ,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    ...opts,
  }).format(new Date(iso));
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'indi';
  if (min < 60) return `${min} dəq əvvəl`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} saat əvvəl`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} gün əvvəl`;
  return formatDate(iso);
}

/**
 * REQ-FIN-09: month boundaries computed in Asia/Baku, not UTC.
 * Returns ISO timestamps marking [start, end) of the Baku-local month containing `ref`.
 */
export function bakuMonthRange(ref: Date = new Date()): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ref);
  const y = Number(parts.find((p) => p.type === 'year')!.value);
  const m = Number(parts.find((p) => p.type === 'month')!.value);
  // Baku is UTC+4 year-round (no DST since 2016).
  const startUtc = Date.UTC(y, m - 1, 1, -4, 0, 0);
  const endUtc = Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1, -4, 0, 0);
  return { start: new Date(startUtc).toISOString(), end: new Date(endUtc).toISOString() };
}

/** Task health color per REQ-DASH-04. */
export function taskHealth(deadlineISO: string | null | undefined): 'red' | 'amber' | 'green' | 'none' {
  if (!deadlineISO) return 'none';
  const days = (new Date(deadlineISO).getTime() - Date.now()) / 86_400_000;
  if (days < 3) return 'red';
  if (days < 14) return 'amber';
  return 'green';
}
