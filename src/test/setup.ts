import '@testing-library/jest-dom/vitest';

// Stable "now" so relativeTime / health-color tests don't drift across CI runs.
// Individual tests can override with `vi.setSystemTime(...)`.
import { beforeAll, vi } from 'vitest';

beforeAll(() => {
  vi.setSystemTime(new Date('2026-05-08T12:00:00+04:00'));
});
