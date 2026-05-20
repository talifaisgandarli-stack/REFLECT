/**
 * Bakı (Asia/Baku, UTC+4, no DST since 2016) date helpers.
 *
 * PRD §FIN-09: "Bakı timezone fix: all date math (month boundaries, due
 * dates) computed in Asia/Baku not UTC." Use these wherever a "today" or
 * relative-date string is needed to bucket tasks — never
 * `new Date().toISOString().slice(0, 10)`, which silently returns
 * yesterday's date between 00:00 and 04:00 Bakı time.
 *
 * Implementation: shift the UTC epoch by Bakı's offset, then read the
 * resulting Date's UTC parts. The "UTC string" now represents the wall
 * clock in Bakı.
 */
const BAKU_OFFSET_MS = 4 * 60 * 60 * 1000;

function bakuNow(): Date {
  return new Date(Date.now() + BAKU_OFFSET_MS);
}

/** YYYY-MM-DD in Bakı time. */
export function todayInBaku(): string {
  return bakuNow().toISOString().slice(0, 10);
}

/**
 * YYYY-MM-DD of the upcoming Sunday in Bakı time (or today if Sunday).
 * Matches the legacy "end of week" semantics — workweek finishes Sunday.
 */
export function endOfWeekInBaku(): string {
  const d = bakuNow();
  const dow = d.getUTCDay(); // 0=Sun..6=Sat in Bakı terms
  const daysUntilSun = dow === 0 ? 0 : 7 - dow;
  d.setUTCDate(d.getUTCDate() + daysUntilSun);
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD shifted by `days` from today in Bakı time. */
export function daysFromTodayInBaku(days: number): string {
  const d = bakuNow();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** { year, month (0-based) } of "now" in Bakı time. */
export function currentMonthInBaku(): { year: number; month: number } {
  const d = bakuNow();
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}
