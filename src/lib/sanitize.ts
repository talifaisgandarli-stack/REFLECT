/**
 * PRD §9.1 — DOMPurify HTML sanitization for rich text fields.
 * Allows only safe inline/block tags; strips script/style/on* attributes.
 * Call before passing untrusted HTML to dangerouslySetInnerHTML.
 *
 * Kept in a separate module so the DOMPurify import stays isolated
 * from pure-utility modules (format.ts, etc.).
 */
import DOMPurify from 'dompurify';

const PURIFY_CONFIG = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'br', 'p', 'ul', 'ol', 'li', 'h3', 'h4', 'blockquote'] as string[],
  ALLOWED_ATTR: ['href', 'target', 'rel'] as string[],
  ADD_ATTR: ['target'] as string[],
};

export function sanitizeHtml(dirty: string): string {
  // DOMPurify.sanitize returns TrustedHTML | string; coerce to string for React.
  return String(DOMPurify.sanitize(dirty, PURIFY_CONFIG));
}
