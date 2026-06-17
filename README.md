# Prefa

**Prefa** je online preferans u troje - real-time, mobile-first. Statički frontend ide na **GitHub Pages**, backend na **Supabase** (Postgres + Realtime, free tier).

Inspiracija: [iPref](http://www.ipref.com/) i [ProfiPreferans](https://www.profipreferans.com/SR/index.html) (oba su desktop-only — ovo je web/mobilna verzija).

## Pokretanje

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # unit testovi engine-a
pnpm build        # tsc --noEmit && vite build + 404.html/.nojekyll
```

## Dokumentacija

- [docs/RULES.md](docs/RULES.md) — kompletna pravila + bodovanje (engine spec, izvor: preferansklub.com)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — arhitektura, Supabase šema, faze
- [CLAUDE.md](CLAUDE.md) — pregled za buduće sesije

## Deploy (GitHub Pages)

1. Merge PR-a u `main` (squash merge).
2. Repo → Settings → Pages → **Source: GitHub Actions**.
3. Svaki push na `main` builda, testira i deployuje (`.github/workflows/deploy.yml`).

Trenutni production path je `/preferans/` za `https://pajcho.github.io/preferans`.
Supabase tajne nisu potrebne dok je aktivan samo lokalni režim igre protiv kompjutera.

Production build pravi i `404.html`, pa normalne SPA rute rade bez hash-a na GitHub Pages:
`/preferans/`, `/preferans/vs`.

## Status

Faza 1 — engine + vs-kompjuter sto je igriv. Vidi checklistu u [CLAUDE.md](CLAUDE.md).
