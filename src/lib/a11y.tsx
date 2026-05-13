/**
 * Accessibility utilities — focus trap + screen reader announcer.
 *
 * `useFocusTrap` confines Tab navigation to elements inside a container,
 * remembers the previously focused element, and restores it on unmount.
 * Use inside modals/drawers so Tab doesn't escape to the background page.
 *
 * `announce` writes to a single `aria-live=polite` region for Realtime
 * updates (new task, status change, new notification). Mount the
 * `<LiveAnnouncer />` once at app root; call `announce(message)` anywhere.
 */
import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useFocusTrap<T extends HTMLElement>(active: boolean = true) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!active || !ref.current) return;
    const container = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Focus the first focusable element on mount so screen readers
    // announce the dialog content immediately.
    const focusables = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    const first = focusables[0];
    if (first) first.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const list = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    container.addEventListener('keydown', onKey);
    return () => {
      container.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, [active]);

  return ref;
}

// --- Live announcer ---------------------------------------------------------

let announcerEl: HTMLDivElement | null = null;

export function announce(message: string) {
  if (typeof document === 'undefined') return;
  if (!announcerEl) {
    announcerEl = document.getElementById('a11y-live-region') as HTMLDivElement | null;
  }
  if (!announcerEl) return;
  // Toggle text to force re-announcement of identical strings.
  announcerEl.textContent = '';
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  void announcerEl.offsetHeight;
  announcerEl.textContent = message;
}

export function LiveAnnouncer() {
  return (
    <div
      id="a11y-live-region"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: 'hidden',
        clip: 'rect(0,0,0,0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    />
  );
}
