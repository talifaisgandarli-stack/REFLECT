import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
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
  plugins: [
    react(),
    // PWA — installable "Add to Home Screen" app (chameleon-eye icon). The
    // service worker precaches the built app shell for instant/offline load;
    // /api and Supabase calls always hit the network (navigateFallback denies
    // /api, and only build assets are precached), so live data is never stale.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['apple-touch-icon.png', 'favicon-32.png', 'icon.svg', 'mascot.svg'],
      manifest: {
        name: 'REFLECT — Architects OS',
        short_name: 'Reflect',
        description: 'Memarlıq studiyası üçün əməliyyat platforması — layihələr, tapşırıqlar, CRM, maliyyə.',
        lang: 'az',
        dir: 'ltr',
        theme_color: '#0E1611',
        background_color: '#0E1611',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
        cleanupOutdatedCaches: true,
        // Pull in the Web Push handlers (public/push-sw.js) without giving up
        // generateSW's automatic precaching — keeps the SW change low-risk.
        importScripts: ['push-sw.js'],
      },
    }),
  ],
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
