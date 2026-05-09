/**
 * Render @<uuid> tokens in a comment body as @FullName segments
 * (slice 131, follow-up to slice 121's mention picker).
 *
 * The DB stores raw UUIDs because the parser in 0004 walks the body
 * looking for them — that's the canonical reference, immune to name
 * changes. The display layer needs to translate them back to humans.
 *
 * This module returns an array of segments — { kind: 'text', text } or
 * { kind: 'mention', userId, label } — so the caller can render them
 * with a chip-style highlight without dangerouslySetInnerHTML.
 *
 * Unknown UUIDs (deleted profiles, mistyped) fall through as text.
 */

const UUID_RE =
  /@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g;

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; userId: string; label: string };

export type MentionLookup = {
  /** id → display string. Caller decides what to use (full_name ?? email). */
  byId: Map<string, string>;
};

export function renderCommentSegments(
  body: string,
  lookup: MentionLookup,
): Segment[] {
  if (!body) return [];
  const segments: Segment[] = [];
  let cursor = 0;
  // reset regex state since /g is stateful across exec calls
  UUID_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = UUID_RE.exec(body)) !== null) {
    const id = match[1];
    const label = lookup.byId.get(id);
    if (!label) continue;
    if (match.index > cursor) {
      segments.push({ kind: 'text', text: body.slice(cursor, match.index) });
    }
    segments.push({ kind: 'mention', userId: id, label });
    cursor = match.index + match[0].length;
  }
  if (cursor < body.length) {
    segments.push({ kind: 'text', text: body.slice(cursor) });
  }
  return segments;
}
