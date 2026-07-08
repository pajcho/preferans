import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = mode === 'production' ? env.VITE_BASE_PATH || '/preferans/' : '/';

  return {
    // Production default targets GitHub Pages project URLs:
    // https://<user>.github.io/preferans/. For a custom domain set VITE_BASE_PATH=/.
    base,
    plugins: [react(), tailwindcss()],
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
