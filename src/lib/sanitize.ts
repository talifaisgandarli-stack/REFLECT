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
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'br', 'p', 'ul', 'ol', 'li', 'h3', 'h4', 'blockquote', 'code', 'span'] as string[],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style'] as string[],
  ADD_ATTR: ['target'] as string[],
};

export function sanitizeHtml(dirty: string): string {
  // DOMPurify.sanitize returns TrustedHTML | string; coerce to string for React.
  return String(DOMPurify.sanitize(dirty, PURIFY_CONFIG));
}

// ---------------------------------------------------------------------------
// Lightweight Markdown → safe HTML for comment / chat-style fields.
// Supports a deliberately-minimal subset to keep XSS surface tiny:
//   **bold**, *italic*, `code`, [text](url), bare URLs, line breaks, @mentions
// All output is run through DOMPurify before return.
// ---------------------------------------------------------------------------

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderCommentMarkdown(text: string): string {
  // Escape first, then re-introduce safe HTML via patterns over the escaped text.
  let out = escape(text);

  // `inline code` — must run before bold/italic so the * inside backticks is preserved
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');

  // **bold**
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');

  // *italic* — single asterisk, but not inside an already-emitted <strong>
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?])/g, '$1<em>$2</em>');

  // [label](https://url) — only http/https/mailto schemes
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  // Bare URLs (must run AFTER markdown links so we don't double-link).
  // Skip if the URL is already inside an href="…" attribute.
  out = out.replace(
    /(^|[\s(])(https?:\/\/[^\s<)]+)/g,
    '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>',
  );

  // @mentions — wrap each @word in a styled span (lime)
  out = out.replace(
    /(^|[\s(])(@[\w._-]+)/g,
    '$1<span class="mention">$2</span>',
  );

  // Line breaks
  out = out.replace(/\n/g, '<br/>');

  return sanitizeHtml(out);
}
