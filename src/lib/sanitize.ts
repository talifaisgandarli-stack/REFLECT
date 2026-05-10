/**
 * PRD §9.1: HTML sanitization for rich text — DOMPurify wrapper.
 * Use sanitize() before any dangerouslySetInnerHTML call.
 * Plain-text rendering never needs this; only HTML-string rendering does.
 */
import DOMPurify from 'dompurify';

const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'a', 'blockquote', 'code', 'pre', 'h1', 'h2', 'h3'];
const ALLOWED_ATTR = ['href', 'target', 'rel'];

// Ensure external links can't inject javascript: and always open safely.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('rel', 'noopener noreferrer');
    node.setAttribute('target', '_blank');
    const href = node.getAttribute('href') ?? '';
    if (href.toLowerCase().startsWith('javascript:')) {
      node.removeAttribute('href');
    }
  }
});

export function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORCE_BODY: true,
  }) as unknown as string;
}
