import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// base: './' -> relativne putanje, radi na GitHub Pages project sajtu
// (https://<user>.github.io/<repo>/) bez hardkodovanja imena repoa.
// Rute idu preko HashRouter-a pa nema 404 na refresh.
export default defineConfig({
  base: './',
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
  },
})
