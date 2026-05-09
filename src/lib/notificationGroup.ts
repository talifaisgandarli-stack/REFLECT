/**
 * Bell drawer notification grouping (slice 80).
 *
 * Collapses runs of consecutive same-kind UNREAD notifications into a
 * single summary group when the run length is ≥3. Read rows always pass
 * through individually so the user can scan history without losing
 * specific events. Read rows also break a run — a read row between two
 * unreads of the same kind keeps both unreads as their own groups.
 *
 * Threshold of 3 chosen so a single delete-and-recreate doesn't merge
 * (would still show the two events distinctly), but a noisy day of 5+
 * status changes collapses into one tidy summary.
 */
import type { NotificationRow } from '@/lib/hooks';

export const GROUP_THRESHOLD = 3;

export type NotifGroup =
  | { kind: 'single'; row: NotificationRow }
  | { kind: 'group'; leader: NotificationRow; rows: NotificationRow[] };

export function collapse(rows: NotificationRow[]): NotifGroup[] {
  const out: NotifGroup[] = [];
  let i = 0;
  while (i < rows.length) {
    const head = rows[i];
    if (head.read_at) {
      out.push({ kind: 'single', row: head });
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < rows.length && rows[j].kind === head.kind && !rows[j].read_at) j += 1;
    const run = rows.slice(i, j);
    if (run.length >= GROUP_THRESHOLD) {
      out.push({ kind: 'group', leader: head, rows: run });
    } else {
      for (const r of run) out.push({ kind: 'single', row: r });
    }
    i = j;
  }
  return out;
}
