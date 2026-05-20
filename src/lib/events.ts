/**
 * Tiny typed event bus over window.dispatchEvent. Centralises the
 * cross-component custom events so the name + payload shape live in one
 * place — string literals scattered across files rot silently when
 * either side changes.
 *
 * Currently only used by the "open task" flow:
 * - TaskCommentsModal dispatches when the user clicks a subtask or the
 *   parent back-chip inside the modal.
 * - TasksPage listens (owns the modal) and swaps the open task without
 *   re-rendering the whole tree.
 */

export type OpenTaskEventDetail = { id: string; title: string };

const OPEN_TASK_EVENT = 'reflect:open-task';

export function dispatchOpenTask(detail: OpenTaskEventDetail): void {
  window.dispatchEvent(new CustomEvent(OPEN_TASK_EVENT, { detail }));
}

/** Subscribe to "open task" requests. Returns an unsubscribe function. */
export function onOpenTask(handler: (detail: OpenTaskEventDetail) => void): () => void {
  function listener(e: Event) {
    const detail = (e as CustomEvent).detail as Partial<OpenTaskEventDetail> | undefined;
    if (detail && typeof detail.id === 'string' && typeof detail.title === 'string') {
      handler({ id: detail.id, title: detail.title });
    }
  }
  window.addEventListener(OPEN_TASK_EVENT, listener);
  return () => window.removeEventListener(OPEN_TASK_EVENT, listener);
}
