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

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: { port: 5173 },
  // Note: dev-only console.warn/info/debug calls are stripped from production via
  // `import.meta.env.DEV` guards at the call sites (Vite statically eliminates
  // the dead branch). A build-time `esbuild.pure` was tried but rolldown-vite's
  // oxc minifier ignores it, so the guards are the source of truth.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(gitSha()),
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
});
