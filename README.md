# Preferans

Online preferans u troje — real-time, mobile-first. Statički frontend na **GitHub Pages**, backend na **Supabase** (Postgres + Realtime, free tier).

Inspiracija: [iPref](http://www.ipref.com/) i [ProfiPreferans](https://www.profipreferans.com/SR/index.html) (oba su desktop-only — ovo je web/mobilna verzija).

## Pokretanje

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # unit testovi engine-a
pnpm build        # tsc --noEmit && vite build  -> dist/
```

## Dokumentacija

- [docs/RULES.md](docs/RULES.md) — kompletna pravila + bodovanje (engine spec, izvor: preferansklub.com)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — arhitektura, Supabase šema, faze
- [CLAUDE.md](CLAUDE.md) — pregled za buduće sesije

## Deploy (GitHub Pages)

1. Push na `main`.
2. Repo → Settings → Pages → **Source: GitHub Actions**.
3. Repo → Settings → Secrets and variables → Actions → dodaj `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY`.
4. Svaki push na `main` builda i deployuje (`.github/workflows/deploy.yml`).

## Status

Faza 1 — engine + hotseat sto (u toku). Vidi checklistu u [CLAUDE.md](CLAUDE.md).
