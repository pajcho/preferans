import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = mode === 'production' ? env.VITE_BASE_PATH || '/preferans/' : '/';

  // Ne pokrećemo PWA plugin pod vitest-om (engine testovi ne treba da grade SW).
  const underTest = process.env.VITEST === 'true';

  return {
    // Production default targets GitHub Pages project URLs:
    // https://<user>.github.io/preferans/. For a custom domain set VITE_BASE_PATH=/.
    base,
    plugins: [
      react(),
      tailwindcss(),
      ...(underTest
        ? []
        : [
            VitePWA({
              // injectManifest: mi posedujemo src/sw.ts (push + notificationclick),
              // Workbox samo za precache + navigation fallback.
              strategies: 'injectManifest',
              srcDir: 'src',
              filename: 'sw.ts',
              registerType: 'prompt',
              injectRegister: false,
              manifest: {
                name: 'Prefa — preferans online u troje',
                short_name: 'Prefa',
                description: 'Online preferans u troje, mobile-first. Igraj protiv kompjutera ili sa društvom.',
                lang: 'sr',
                theme_color: '#0f5132',
                background_color: '#0f5132',
                display: 'standalone',
                orientation: 'portrait',
                start_url: '.',
                scope: '.',
                categories: ['games', 'entertainment'],
                icons: [
                  { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
                  { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                  { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
                  { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
              },
              injectManifest: {
                globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
                // Ne precache-uj velike deljene slike / iOS splash screen-ove.
                globIgnores: ['**/apple-splash-*.png', '**/og-image.png'],
              },
              devOptions: {
                enabled: true,
                type: 'module',
                navigateFallback: 'index.html',
              },
            }),
          ]),
    ],
    resolve: {
      alias: {
        '@engine': fileURLToPath(new URL('./src/engine', import.meta.url)),
        '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
        '@net': fileURLToPath(new URL('./src/net', import.meta.url)),
        '@state': fileURLToPath(new URL('./src/state', import.meta.url)),
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.{test,spec}.ts'],
      // Neki testovi voze cele partije kroz engine (AI + rekurzivni claim double-dummy) —
      // sporiji CI runner (npr. Node 24 forsiran) preko podrazumevanih 5s. Dovoljna margina.
      testTimeout: 20000,
    },
  };
});
