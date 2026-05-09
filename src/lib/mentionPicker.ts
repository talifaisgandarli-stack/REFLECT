/**
 * Mention picker text-state helper (slice 121).
 *
 * The DB-side parser in 0004 is uuid-only: it scans `@<uuid>` tokens
 * and rewrites task_comments.mentions accordingly. The UI helper
 * needs to surface a typeahead while the user types `@<query>` and
 * insert `@<uuid>` once they pick. This module is the pure piece —
 * given the textarea value + cursor position it returns either a
 * trigger context (start, query) or null. Easy to unit-test.
 */

export type MentionTrigger = {
  /** index of the '@' character */
  start: number;
  /** index just past the cursor (exclusive) — slice end for replacement */
  end: number;
  /** what the user typed after '@', possibly empty */
  query: string;
};

/**
 * Returns the active mention trigger for the given (value, cursor) pair,
 * or null if the cursor isn't inside a fresh `@<word>` segment.
 *
 * Triggers only when the '@' is at the start of the input or preceded by
 * whitespace — a stray '@' in `email@example` shouldn't open the picker.
 * Stops on space, newline, or comma — the picker closes once the user
 * commits the word.
 */
export function findMentionTrigger(value: string, caret: number): MentionTrigger | null {
  if (caret < 1 || caret > value.length) return null;
  let i = caret - 1;
  while (i >= 0) {
    const ch = value[i];
    if (ch === '@') {
      const before = i === 0 ? '' : value[i - 1];
      if (before && !/\s/.test(before)) return null;
      const query = value.slice(i + 1, caret);
      // Stop word starts a fresh trigger; once the user types whitespace
      // or other terminator inside, close.
      if (/[\s,]/.test(query)) return null;
      return { start: i, end: caret, query };
    }
    if (/[\s,]/.test(ch)) return null;
    i -= 1;
  }
  return null;
}

/**
 * Replaces the active trigger range with `@<uuid> ` (trailing space so
 * the user can keep typing). Returns both the new value and the next
 * cursor position so the caller can drive a controlled textarea.
 */
export function applyMention(
  value: string,
  trigger: MentionTrigger,
  uuid: string,
): { next: string; caret: number } {
  const insert = `@${uuid} `;
  const next = value.slice(0, trigger.start) + insert + value.slice(trigger.end);
  return { next, caret: trigger.start + insert.length };
}
