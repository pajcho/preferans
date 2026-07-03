import { applyD1Migrations, env } from 'cloudflare:test'

// D1 migracije se primenjuju pre svakog test fajla (izolovan storage po testu)
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
