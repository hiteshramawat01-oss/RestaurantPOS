/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const buildTime = new Date().toISOString();

/**
 * Base path. GitHub Pages serves the app from /<repo-name>/ (set BASE_PATH
 * in the deploy workflow). The Android (Capacitor) build uses './'.
 */
const base = process.env.BASE_PATH || '/';

/** Release notes for the current version, taken from CHANGELOG.md. */
function releaseNotes(version: string): string[] {
  try {
    const text = readFileSync(new URL('./CHANGELOG.md', import.meta.url), 'utf8');
    const start = text.indexOf(`## ${version}`);
    if (start < 0) return [];
    const rest = text.slice(start).split('\n').slice(1);
    const end = rest.findIndex((l) => l.startsWith('## '));
    return (end < 0 ? rest : rest.slice(0, end))
      .filter((l) => l.trim().startsWith('- '))
      .map((l) => l.trim().slice(2));
  } catch {
    return [];
  }
}

/** Emits /version.json describing the deployed release (read by "Check for updates"). */
function versionManifest(): Plugin {
  return {
    name: 'pos-version-manifest',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: pkg.version, releasedAt: buildTime, notes: releaseNotes(pkg.version) }, null, 2),
      });
    },
  };
}

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  plugins: [
    react(),
    versionManifest(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        id: './',
        name: 'Restaurant POS',
        short_name: 'POS',
        description: 'Offline order taking, kitchen slips and billing for the restaurant.',
        lang: 'en-IN',
        theme_color: '#26336b',
        background_color: '#f3f4f7',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // version.json must always come from the network so update checks are real.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,ico}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/version\.json$/],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 2000,
  },
  server: {
    host: true, // reachable from a phone on the same Wi-Fi during development
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
});
