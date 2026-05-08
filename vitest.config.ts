import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest config — added per PRD §3.1 stack note (test runner approved
 * separately from the original stack list). Tests live in tests/.
 *
 * Two test surfaces today:
 *   - migrations.test.ts: file-system invariants from §9.3 (every up.sql has
 *     a paired down.sql). Runs without a database.
 *   - parity.test.ts: SQL parity smoke (counts + sums on hot tables). Skipped
 *     when DATABASE_URL is not set, so local dev and CI without a DB pass.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    reporters: 'default',
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
