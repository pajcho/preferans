# CLAUDE.md

Pregled projekta za buduće sesije. Detalji: [docs/RULES.md](docs/RULES.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/ONLINE.md](docs/ONLINE.md), [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md), [docs/ADMIN.md](docs/ADMIN.md).

## Šta je ovo

**Prefa** je online **preferans u troje**, real-time, mobile-first. Statički frontend na **GitHub Pages**,
backend na **Cloudflare Workers + Durable Objects + D1** (free tier). Inspiracija iPref i ProfiPreferans
(oba se plaćaju; Prefa je besplatna). UI i domenski termini su na **srpskom**.

## Zaključane odluke

- **Hosting:** GitHub Pages (samo statika) + **Cloudflare Workers/DO/D1** (backend).
  Istorija: prvo je odbačen P2P (PeerJS — pada na mobilnom, partija pukne kad host zatvori tab),
  pa je Faza 2 urađena na **Supabase** (radi lokalno, grana `feature/online-multiplayer`), ali je
  pre deploy-a prebačena na Cloudflare: Supabase free tier = max 2 aktivna projekta + pauziranje
  posle 7 dana neaktivnosti. Cloudflare free (Workers 100k req/dan, SQLite DO sa WS hibernation,
  D1 5GB) ne spava i arhitektonski bolje leži (**1 partija = 1 DO**, potezi serijalizovani bez CAS-a).
- **Ruleset:** preferansklub.com — ladder **Pik..Sans (2–7)**, bez „Preferans-8" po defaultu.
- **Engine je svet za sebe:** `src/engine` nema import iz React/DOM/mreže; deterministički (seeded RNG);
  sve pokriveno Vitest testovima. Isti engine radi u browseru (vs-cpu) I u GameRoom DO-u (online) —
  worker ga importuje direktno (esbuild bundle), bez kopiranja. (Importi nose `.ts` ekstenzije —
  ostavština Deno faze, radi svuda.)
- **Online = server autoritet** (Faza 2, vidi docs/CLOUDFLARE.md): pun state samo u DO storage-u,
  klijent dobija redigovan pogled (`redactStateFor`) **push-om kroz WebSocket** posle svake promene;
  botovi igraju na serveru (DO alarmi); identitet anonimni `{userId, HMAC token}` u localStorage
  (bez registracije); kod partije 6 znakova = ime DO-a + share link `/o/KOD`.

## Stack

Vite · React 19 · TypeScript (strict) · Tailwind v4 · Zustand · Motion · Howler · nanoid · Zod · Vitest · clsx + tailwind-merge (`cn()`) · Wrangler (`workers/`). Paketi: **pnpm**.

> Engine koristi **čist reducer** (`reduce(state, action)`), ne XState — jednostavnije i trivijalno se serijalizuje u JSON (DO storage).

## Skilovi (.claude/skills → .agents/skills)

Instalirani skilovi; aktiviraju se po potrebi:
- **wrangler** + **durable-objects** + **workers-best-practices** — Cloudflare backend (GameRoom DO, D1, deploy)
- **vitest** — testovi engine-a i DO-a · **vite** — build/config
- **tailwind-v4-shadcn** + **shadcn** + **frontend-design** — styling, UI komponente (lobby/dijalozi), polish
- **vercel-react-best-practices** + **vercel-composition-patterns** — React performanse (re-render) i čiste komponente
- **tanstack-query-best-practices** — (opciono) učitavanje istorije partija / statistike
- (supabase skilovi su ostali instalirani ali se više ne koriste — backend je Cloudflare)

**Styling arhitektura** (po tailwind-v4-skilu): semantički tokeni u `:root` + `@theme inline` mapiranje;
domenski tokeni `felt / card-face / suit-red / suit-black`; helper `cn()` u [src/lib/utils.ts](src/lib/utils.ts). shadcn-ready.

## Struktura

```
src/
  engine/      pure TS: types, rng, deck, contract, bidding, play, scoring, reducer, playerView, ai
    __tests__/
  protocol/    wire poruke (messages.ts) — REST + WS tipovi; importuje ga i worker
  net/         config.ts (VITE_API_URL), auth.ts (anonimni identitet), api.ts (REST), socket.ts (WS)
  state/       Zustand: gameStore (vs-cpu), onlineStore (online), historyStore
  ui/
    screens/   Home, Table (vs-cpu wrapper), TableView (zajednički sto), OnlineTable (+lobi), History
    components/ Card, Hand, TrickArea, ScoreBox, ...
workers/
  wrangler.jsonc   Worker config (GameRoom DO binding, D1, migrations, ALLOWED_ORIGINS)
  src/             index.ts (router+auth+CORS), room.ts (GameRoom DO), auth.ts, http.ts, random.ts
  migrations/      D1 šema (games, game_players — samo meta; state/log su u DO storage-u)
  test/            vitest-pool-workers testovi (DO + REST + WS u workerd runtime-u)
e2e/           Playwright multiplayer test (3 browser konteksta)
docs/          RULES.md, ARCHITECTURE.md, ONLINE.md, CLOUDFLARE.md
.github/workflows/deploy.yml   GH Pages deploy (VITE_API_URL repo secret)
```

## Konvencije

- **Srpski** za UI tekst i domenske termine: Pik/Karo/Herc/Tref/Betl/Sans, dalje/mogu/igra,
  dođem/ne dođem, kontra/rekontra, bule/supe/refe.
- Engine: jedini ulaz za mutaciju je `reduce(state, action)`; bez `Math.random`/`Date.now` u logici
  (seed se prosleđuje). `redactFor(seat, state)` skriva tuđe ruke.
- **Bodovanje je škakljivo** (znakovi, ×10 na bule, betl 60/70, cap 5) — vidi RULES.md §9–11, testirati.
- Path alias-i: `@engine`, `@ui`, `@net`, `@state`, `@`.

## Komande

```bash
pnpm dev           # http://localhost:5173 (u dev-u klijent sam gađa :8787)
pnpm cf:dev        # Cloudflare backend lokalno (wrangler dev, :8787; bez Dockera)
pnpm test          # vitest — engine
pnpm test:workers  # vitest — GameRoom DO + worker (workerd runtime)
pnpm typecheck     # tsc --noEmit (root + workers)
pnpm build         # tsc --noEmit && vite build && postbuild Pages fallback
pnpm cf:types      # regeneriši workers/worker-configuration.d.ts posle izmene wrangler.jsonc
pnpm e2e           # Playwright multiplayer E2E (sam podiže vite + wrangler dev)
pnpm cf:seed       # dummy podaci za /admin u LOKALNI D1 (60+ partija, igrači, ruke)
pnpm cf:demo-game  # odigra pravu partiju protiv botova lokalno (pun log za admin drill-down)
```

## Status / checklist

**Faza 1 — engine + vs-kompjuter (GOTOVO ✅, igrivo)**
- [x] Skela + GH Pages config + Actions deploy
- [x] Dokumentacija (RULES/ARCHITECTURE/CLAUDE) + skilovi
- [x] Engine: types, rng, deck, contract, bidding, play, scoring + finale
- [x] Engine: reducer (pun tok: deljenje→licitacija→talon→pratnja→igra→bodovanje), legalActions, createGame
- [x] Engine: playerView (skrivene karte)
- [x] AI (easy/medium/hard) — 3 bota odigraju celu partiju
- [x] vs-kompjuter sto UI (mobile-first, igrivo) — **101 test zelen**

Pokretanje vs-kompjuter: `pnpm dev` → Početna → „Igraj protiv kompjutera". Sve lokalno, bez backenda.

**Faza 2 — online (Cloudflare) — CORE GOTOVO ✅ lokalno (grana `feature/cloudflare-backend`, vidi docs/CLOUDFLARE.md)**
- [x] GameRoom DO = server autoritet: create/join/act autorizacija po sedištu, pun state + append-only log u DO storage-u (karte STVARNO skrivene — redakcija na serveru)
- [x] WebSocket push view-a (Hibernation API) — bez poll-a; presence (⌛ offline indikator)
- [x] Bot automatika preko DO alarma (0.8s potez / 1.6s štih / 3.5s claim) + stall kick
- [x] Anonimni identitet (HMAC token u localStorage, bez registracije)
- [x] Kod partije (6 znakova) = ime DO-a + share link `/o/KOD`; random dodela mesta; pun sto → posmatrač
- [x] Lobi (mesta igrač/bot po težini), reconnect na svoje mesto, „Moje partije" (D1)
- [x] **Lobi v2**: kreiranje samo sa imenom (default 3 „human" mesta) → podešavanje u lobiju:
      toggle Igrač/Kompjuter(+težina) po slobodnom mestu (zauzeto se ne menja), pravila
      bule/refe (default 100/2), **eksplicitni start kreatora** (nema auto-starta),
      **čekaonica** (pun lobi → FIFO red; prvi POVEZANI automatski seda kad se mesto
      oslobodi; na start ostali postaju posmatrači), **izlazak** („Izađi iz reda" /
      „Ustani od stola" pre starta — kreator ima samo cancel). REST `config`+`start`+`leave`
- [x] Svaki potez u DO `actions` logu (replay-ready), verzija = seq
- [x] Testovi: 36 vitest-pool-workers (DO/REST/WS: i configure/start/čekaonica + nalozi) + 3 Playwright E2E (3 identiteta: lobi-podešavanje→start→cela ruka, reload usred partije, posmatrač, redakcija, „Moje partije"; čekaonica sa auto-sedanjem; nalozi: registracija→odjava→prijava „na drugom uređaju") — **zeleno, ~40s**
- [x] **Deploy ✅**: `https://prefa-backend.pajcho.workers.dev` (D1 `prefa` EEUR, AUTH_SECRET postavljen, DEBUG_API isključen, workers.dev subdomen `pajcho` registrovan kroz API — dashboard za nove naloge nema taj UI). Smoke: health, auth, partija sa botovima (alarmi rade), WS view push, redakcija, cancel — sve ✅
- [x] GH Pages repo secret `VITE_API_URL` + merge u main (PR #9) — **ONLINE UŽIVO** na https://pajcho.github.io/preferans (bundle gađa prefa-backend.pajcho.workers.dev)
- [x] **Admin dashboard** `/admin` (interni, Bearer `ADMIN_TOKEN` secret — vidi docs/ADMIN.md):
      statistika korišćenja (partije/igrači/ruke/aktivnost 30d), „šta se igra", lokacije (request.cf),
      top igrači, lista partija + drill-down do svakog poteza (DO log) i punog state-a (debug);
      D1 `players`+`hands` (migracija 0002), `pnpm cf:seed` + `pnpm cf:demo-game` za lokalne demo podatke.
      **Produkcija: postaviti `wrangler secret put ADMIN_TOKEN` (bez njega admin API vraća 404).**
- [x] **Nalozi** (opciona nadogradnja anonimnog identiteta, vidi docs/CLOUDFLARE.md):
      registracija email+lozinka (PBKDF2-SHA256 100k, bez email potvrde — samo UNIQUE
      provera zauzetosti), prijava vraća isti `userId`+token na svakom uređaju → ista
      „Moje partije" svuda; registracija NE menja userId pa partije od pre registracije
      automatski ostaju uz nalog. Stranica `/profil` (registracija/prijava; promena
      imena/emaila/lozinke; odjava) + header link/odjava na početnoj. REST
      `/api/auth/{register,login,me,profile}` (`workers/src/account.ts`), D1 migracija
      0003 (`players.email/password_hash`), klijent `src/state/authStore.ts`.
      **Produkcija: pre deploy-a `wrangler d1 migrations apply prefa --remote`.**
- [ ] Chat, replay iz loga poteza, zamena diskonektovanog botom

**Istorija:** Supabase implementacija Faze 2 (potpuna, lokalno zelena) je u grani
`feature/online-multiplayer` — zamenjena Cloudflare-om zbog free tier ograničenja (2 projekta, spavanje posle 7 dana).

**Polish**
- [x] UX v0.2: auto-sort ruke, pauza štiha 1.6s + isticanje pobednika, panel „Potezi", jasnija pratnja, badge licitacije ispod karata
- [x] Licitacija v2 (po pravilima): **strogi redosled 2→7**, **prvenstvo („mogu"/HOLD)**, **„igra" (bez talona)** — engine + UI + testovi; talon tok (uzmi/škart/objavi) potvrđen i za čoveka
- [x] Bid-log: ceo tok licitacije se beleži (`bidLog`) → badge ispod karata ostaje do igre + cela licitacija u panelu „Potezi" (ko šta rekao i kad „dalje")
- [x] UX v0.3: štih u **trouglu** (karta na poziciji igrača L/D/dole-sredina); karte **boja ispod broja** + centar pip; **hover samo gore** (ne prekriva susednu kartu); **„štihovi" skriveni** dok ne počne igra
- [x] Rezultat po igraču ispod karata: `[leva supa | bule | desna supa]` + ukupno (iPref raspored; `ScoreBox`). `finalScore` se brojčano poklapa sa iPref-om.
- [x] Disabled (nelegalne) karte: svetlo-sive i NEPROVIDNE (ne vidi se karta ispod)
- [x] **Manuelna kontra** (Kontra→Rekontra→Subkontra→Mortkontra; faza `kontra`); **igra-betl / igra-sans** u objavama; **refe vidljiv** (△ u ScoreBox); ScoreBox pun širinom + moj ispod karata
- [x] Minimalne animacije (CSS „card-in" pop pri igranju karte — bez extra biblioteke); fix selekcije škarta (selektovana karta se SAMO podiže, bez z-skoka, ne prekriva susednu); AI „dođem/ne dođem" po realnoj proceni snage ruke (ne prati uvek)
- [x] Auto-završetak kad je ishod forsiran (double-dummy „nosi sve / nema pad") — `claim.ts` (brza „power" + rekurzivna provera za adut/sans, rekurzija za betl, sve ZVUČNO), faza `claim` + otkrivanje karata + poruka, config `autoFinish` (default on). **Grana `auto-finish` (revert: `git checkout main`).**
- [x] Gameplay kompletiranje: supe cap 5 + trenutni pad nosioca kad odbrana skupi 5 štihova, pad pratioca u bule, invit/pozivanje, kontra-runda za oba pratioca + betl, AI betl/sans/„igra"/kontra, dvostruka „igra" rezolucija po nivou/boji
- [ ] Zvuk (Howler)

**v1 pojednostavljenja** (refine kasnije): regularni betl/sans (brojčana licitacija) uzimaju talon, a igra-betl/igra-sans (bez talona) postoje; isti nivo „igre" ostaje prvom koji ga je prijavio (po pravilima izvor nije potpuno siguran za retki slučaj).

**Faza 3 — poliranje**
- [ ] Istorija partija + replay, animacije, zvuk, podešavanja
