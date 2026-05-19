/**
 * useAutoFocus — focus the first focusable input/textarea/select inside the
 * supplied ref on mount. Modals/popovers should call this so keyboard users
 * land in the form immediately (PRD §6.6 a11y).
 */
import { RefObject, useEffect } from 'react';

const FOCUSABLE_SELECTOR = 'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])';

export function useAutoFocus<T extends HTMLElement>(ref: RefObject<T>, enabled = true): void {
  useEffect(() => {
    if (!enabled || !ref.current) return;
    const first = ref.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    if (first) {
      // Defer to next tick so any modal-open animation doesn't steal focus
      window.setTimeout(() => first.focus(), 0);
    }
  }, [enabled, ref]);
}
