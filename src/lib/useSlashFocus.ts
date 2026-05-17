/**
 * PRD §6.3 — Slack/GitHub-style "/" keyboard shortcut that focuses + selects
 * the page's primary search input. Ignored while typing in any other input
 * so it never steals keystrokes mid-edit.
 *
 * Usage:
 *   const searchRef = useRef<HTMLInputElement>(null);
 *   useSlashFocus(searchRef);
 *   <input ref={searchRef} placeholder="Axtar… (/)" />
 */
import { useEffect, type RefObject } from 'react';

export function useSlashFocus(ref: RefObject<HTMLInputElement | null>): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/') return;
      const tag = (e.target as HTMLElement).tagName;
      const editing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;
      if (editing) return;
      e.preventDefault();
      ref.current?.focus();
      ref.current?.select();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ref]);
}
