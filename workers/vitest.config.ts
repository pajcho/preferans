// Testovi Worker-a + GameRoom DO-a unutar workerd runtime-a
// (pokretanje: pnpm test:workers iz korena repoa).
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(here, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: path.join(here, 'wrangler.jsonc') },
        miniflare: {
          bindings: {
            AUTH_SECRET: 'test-secret',
            DEBUG_API: '1',
            ADMIN_TOKEN: 'test-admin',
            TEST_MIGRATIONS: migrations,
          },
        },
      }),
    ],
    test: {
      include: [path.join(here, 'test/**/*.spec.ts')],
      setupFiles: [path.join(here, 'test/apply-migrations.ts')],
    },
  };
});
