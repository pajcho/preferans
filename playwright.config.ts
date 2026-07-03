import { defineConfig } from '@playwright/test'

// E2E multiplayer testovi — Playwright sam podiže vite dev (:5173)
// i Cloudflare backend (wrangler dev, :8787). Bez Dockera.
export default defineConfig({
  testDir: './e2e',
  timeout: 300_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
  },
  webServer: [
    {
      command: 'pnpm dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'pnpm cf:dev',
      url: 'http://localhost:8787',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
})
