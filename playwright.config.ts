import { defineConfig } from '@playwright/test'

// E2E multiplayer testovi — traže pokrenut lokalni Supabase (pnpm sb:start
// + supabase functions serve) i koriste dev server na :5173.
export default defineConfig({
  testDir: './e2e',
  timeout: 300_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
