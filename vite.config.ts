import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { execSync } from 'node:child_process';
import pkg from './package.json';

// PRD §9.4 — build-time stamps so the Settings page can show what's deployed.
// Fail-soft: missing git → empty string (e.g. zipped source).
function gitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return '';
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: { port: 5173 },
  // Strip dev-only console noise from the production bundle. Marking these as
  // /* @__PURE__ */ lets esbuild's minifier drop the calls (their return value
  // is always unused). console.error is intentionally kept — Sentry hooks it and
  // it is the channel for genuine production failures.
  esbuild:
    mode === 'production'
      ? { pure: ['console.warn', 'console.info', 'console.debug', 'console.log'] }
      : {},
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(gitSha()),
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
}));
