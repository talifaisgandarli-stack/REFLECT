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
 * Asia/Baku midnight for `daysAgo` days back from today.
 * Baku has no DST since 2016, so a fixed +04:00 offset is correct.
 * Used for date-bucket queries (e.g. "this week" / "current month").
 */
export function bakuMidnight(daysAgo = 0): Date {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const today = fmt.format(new Date());
  const d = new Date(`${today}T00:00:00+04:00`);
  d.setDate(d.getDate() - daysAgo);
  return d;
}

/** YYYY-MM key for an ISO timestamp evaluated in Asia/Baku (REQ-FIN-09). */
export function bakuMonthKey(iso: string | null | undefined): string {
  if (!iso) return '';
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
  });
  return fmt.format(new Date(iso)).slice(0, 7);
}

/** [startUTC, endUTC) covering the current Baku calendar month. */
export function bakuCurrentMonthRange(now: Date = new Date()): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
  }).format(now);
  const [y, m] = parts.split('-').map(Number);
  const start = new Date(`${parts}-01T00:00:00+04:00`);
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  const end = new Date(
    `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00+04:00`,
  );
  return { start, end };
}

/** Task health color per REQ-DASH-04. */
export function taskHealth(deadlineISO: string | null | undefined): 'red' | 'amber' | 'green' | 'none' {
  if (!deadlineISO) return 'none';
  const days = (new Date(deadlineISO).getTime() - Date.now()) / 86_400_000;
  if (days < 3) return 'red';
  if (days < 14) return 'amber';
  return 'green';
}
