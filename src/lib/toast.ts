/**
 * Lightweight toast queue (slice 146).
 *
 * Replaces inline error <p> tags + window.alert() / window.confirm() in
 * mutation handlers with non-blocking transient feedback. Pure
 * external-store pattern (no React dependency in the publisher) so it
 * can be called from useMutation onError, /api fetch error branches,
 * realtime callbacks, anywhere.
 *
 * The accompanying <ToastContainer /> component (toast.tsx) renders
 * the queue inside an aria-live region for screen-reader announcement.
 */

export type ToastTone = 'info' | 'success' | 'error';

export type Toast = {
  id: number;
  tone: ToastTone;
  message: string;
  /** ms until auto-dismiss; 0 = sticky. Defaults to 4000 / 6000 by tone. */
  ttl: number;
};

type Listener = (toasts: Toast[]) => void;

let queue: Toast[] = [];
const listeners = new Set<Listener>();
let nextId = 1;

function emit(): void {
  for (const l of listeners) l(queue);
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  l(queue);
  return () => {
    listeners.delete(l);
  };
}

export function getToasts(): Toast[] {
  return queue;
}

export function dismissToast(id: number): void {
  const next = queue.filter((t) => t.id !== id);
  if (next.length === queue.length) return;
  queue = next;
  emit();
}

function defaultTtl(tone: ToastTone): number {
  return tone === 'error' ? 6000 : 4000;
}

export function pushToast(input: {
  message: string;
  tone?: ToastTone;
  ttl?: number;
}): number {
  const tone = input.tone ?? 'info';
  const id = nextId++;
  const ttl = input.ttl ?? defaultTtl(tone);
  const toast: Toast = { id, tone, message: input.message, ttl };
  queue = [...queue, toast];
  emit();
  if (ttl > 0 && typeof window !== 'undefined') {
    window.setTimeout(() => dismissToast(id), ttl);
  }
  return id;
}

/** Convenience helpers — same as pushToast but with the tone preset. */
export const toast = {
  info: (message: string, ttl?: number) =>
    pushToast({ message, tone: 'info', ttl }),
  success: (message: string, ttl?: number) =>
    pushToast({ message, tone: 'success', ttl }),
  error: (message: string, ttl?: number) =>
    pushToast({ message, tone: 'error', ttl }),
};

/** Test-only — wipes the queue and listeners between specs. */
export function _resetToastsForTests(): void {
  queue = [];
  listeners.clear();
  nextId = 1;
}
