import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetToastsForTests,
  dismissToast,
  getToasts,
  pushToast,
  subscribe,
  toast,
} from './toast';

describe('toast store', () => {
  beforeEach(() => {
    _resetToastsForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    _resetToastsForTests();
  });

  it('starts empty', () => {
    expect(getToasts()).toEqual([]);
  });

  it('pushToast appends with monotonic ids', () => {
    const a = pushToast({ message: 'first' });
    const b = pushToast({ message: 'second' });
    expect(b).toBe(a + 1);
    expect(getToasts()).toHaveLength(2);
  });

  it('helper functions set the tone', () => {
    toast.info('i');
    toast.success('s');
    toast.error('e');
    const all = getToasts();
    expect(all.map((t) => t.tone)).toEqual(['info', 'success', 'error']);
  });

  it('dismissToast removes by id and emits', () => {
    const seen: number[] = [];
    const unsub = subscribe((q) => seen.push(q.length));
    const id = pushToast({ message: 'x' });
    dismissToast(id);
    unsub();
    // initial 0 + push 1 + dismiss 0
    expect(seen).toEqual([0, 1, 0]);
    expect(getToasts()).toEqual([]);
  });

  it('dismissToast on unknown id is a no-op', () => {
    pushToast({ message: 'y' });
    dismissToast(9999);
    expect(getToasts()).toHaveLength(1);
  });

  it('auto-dismisses after the default ttl for info (4s)', () => {
    pushToast({ message: 'auto' });
    expect(getToasts()).toHaveLength(1);
    vi.advanceTimersByTime(3999);
    expect(getToasts()).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(getToasts()).toHaveLength(0);
  });

  it('auto-dismisses after 6s for error tone', () => {
    pushToast({ message: 'oops', tone: 'error' });
    vi.advanceTimersByTime(4000);
    expect(getToasts()).toHaveLength(1);
    vi.advanceTimersByTime(2001);
    expect(getToasts()).toHaveLength(0);
  });

  it('ttl=0 makes a sticky toast that never auto-dismisses', () => {
    pushToast({ message: 'sticky', ttl: 0 });
    vi.advanceTimersByTime(60_000);
    expect(getToasts()).toHaveLength(1);
  });

  it('subscribe replays current state to new listeners', () => {
    pushToast({ message: 'pre-existing' });
    let seen: number | null = null;
    const unsub = subscribe((q) => {
      seen = q.length;
    });
    expect(seen).toBe(1);
    unsub();
  });
});
