/**
 * useRecentlyViewed — localStorage-backed recent-entity log.
 * Call `track({...})` whenever the user opens a detail page; render
 * `useRecentEntries()` on the Dashboard as a quick-access widget.
 *
 * Cap 12 entries, deduplicated by {type, id}. Survives reloads;
 * cleared on logout (handled by the caller).
 */
import { useEffect, useState } from 'react';

export type RecentEntry = {
  type: 'project' | 'task' | 'client';
  id: string;
  title: string;
  href: string;
  ts: number;
};

const KEY = 'reflect.recently-viewed';
const CAP = 12;

function load(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function trackRecentEntry(entry: Omit<RecentEntry, 'ts'>): void {
  try {
    const cur = load();
    const key = `${entry.type}:${entry.id}`;
    const filtered = cur.filter((e) => `${e.type}:${e.id}` !== key);
    const next = [{ ...entry, ts: Date.now() }, ...filtered].slice(0, CAP);
    localStorage.setItem(KEY, JSON.stringify(next));
    // Notify listeners (e.g. Dashboard widget) in the same tab
    window.dispatchEvent(new CustomEvent('reflect:recent-changed'));
  } catch { /* quota — ignore */ }
}

export function useRecentEntries(): RecentEntry[] {
  const [items, setItems] = useState<RecentEntry[]>(() => load());
  useEffect(() => {
    function refresh() { setItems(load()); }
    window.addEventListener('reflect:recent-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('reflect:recent-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return items;
}
