/**
 * useUnsavedChanges — guards a form/page that has unsaved edits.
 * Hooks `window.beforeunload` so closing the tab / reloading shows the
 * browser's native "leave?" prompt. Re-set `dirty` to false after save.
 *
 * Usage:
 *   const [dirty, setDirty] = useState(false);
 *   useUnsavedChanges(dirty);
 *   <input onChange={(e) => { setX(e.target.value); setDirty(true); }} />
 */
import { useEffect } from 'react';

export function useUnsavedChanges(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Modern browsers ignore returnValue text but still require it to be set
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
}
