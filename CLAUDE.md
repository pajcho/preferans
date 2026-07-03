# CLAUDE.md

Pregled projekta za buduće sesije. Detalji: [docs/RULES.md](docs/RULES.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/ONLINE.md](docs/ONLINE.md).

## Šta je ovo

**Prefa** je online **preferans u troje**, real-time, mobile-first. Statički frontend na **GitHub Pages**,
backend na **Supabase** (Postgres + Realtime, free tier). Inspiracija iPref i ProfiPreferans
(oba desktop-only; ovo je web/mobilna verzija). UI i domenski termini su na **srpskom**.

## Zaključane odluke

- **Hosting:** GitHub Pages (samo statika) + Supabase (hostovani backend). **NE** PartyKit/Cloudflare
  (GH Pages ne hostuje server kod). **NE** PeerJS/P2P — odbačen jer pada na mobilnom (~1/3 bez TURN-a)
  i partija pukne kad host zatvori tab; Supabase je pouzdaniji + daje persistenciju/replay.
- **Ruleset:** preferansklub.com — ladder **Pik..Sans (2–7)**, bez „Preferans-8" po defaultu.
- **Engine je svet za sebe:** `src/engine` nema import iz React/DOM/mreže; deterministički (seeded RNG);
  sve pokriveno Vitest testovima. Isti engine radi u browseru (vs-cpu) I u Edge funkcijama (online) —
  `scripts/sync-shared.sh` kopira `src/engine` + `src/protocol` u `supabase/functions/_shared/`
  (zato engine importi imaju `.ts` ekstenzije — Deno ih zahteva).
- **Online = server autoritet** (Faza 2, vidi docs/ONLINE.md): pun state samo u `game_states`
  (RLS deny-all), klijent dobija redigovan pogled (`redactStateFor`); botovi igraju na serveru;
  identitet preko anonymous auth (bez registracije); kod partije 6 znakova + share link `/o/KOD`.

## Stack

Vite · React 19 · TypeScript (strict) · Tailwind v4 · Zustand · Motion · Howler · nanoid · Zod · @supabase/supabase-js · Vitest · clsx + tailwind-merge (`cn()`). Paketi: **pnpm**.

> Engine koristi **čist reducer** (`reduce(state, action)`), ne XState — jednostavnije i trivijalno se serijalizuje u Supabase JSONB.

## Skilovi (.claude/skills → .agents/skills)

Instalirano 10 skilova (kopirano iz `family-assistant-react`); aktiviraju se po potrebi:
- **supabase** + **supabase-postgres-best-practices** — backend, šema, RLS (skrivanje karata), Realtime, Edge Functions
- **vitest** — testovi engine-a · **vite** — build/config
- **tailwind-v4-shadcn** + **shadcn** + **frontend-design** — styling, UI komponente (lobby/dijalozi), polish
- **vercel-react-best-practices** + **vercel-composition-patterns** — React performanse (re-render) i čiste komponente
- **tanstack-query-best-practices** — (opciono) učitavanje istorije partija / statistike

**Styling arhitektura** (po tailwind-v4-skilu): semantički tokeni u `:root` + `@theme inline` mapiranje;
domenski tokeni `felt / card-face / suit-red / suit-black`; helper `cn()` u [src/lib/utils.ts](src/lib/utils.ts). shadcn-ready.

## Struktura

```
src/
  engine/      pure TS: types, rng, deck, contract, bidding, play, scoring, reducer, playerView, ai
    __tests__/
  protocol/    wire poruke (messages.ts) — kopira se i u edge funkcije
  net/         supabase.ts (klijent + anonimna sesija), api.ts (edge pozivi + myGames)
  state/       Zustand: gameStore (vs-cpu), onlineStore (online), historyStore
  ui/
    screens/   Home, Table (vs-cpu wrapper), TableView (zajednički sto), OnlineTable (+lobi), History
    components/ Card, Hand, TrickArea, ScoreBox, ...
supabase/
  migrations/  online šema (games, game_players, game_states, game_actions, profiles + RLS)
  functions/   create-game, join-game, get-view, act, cancel-game, _shared (http, db, game + sync kopije)
e2e/           Playwright multiplayer test (3 browser konteksta)
scripts/       sync-shared.sh (engine+protocol → functions/_shared)
docs/          RULES.md, ARCHITECTURE.md, ONLINE.md
.github/workflows/deploy.yml   GH Pages deploy
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
pnpm dev        # http://localhost:5173
pnpm test       # vitest
pnpm typecheck  # tsc --noEmit
pnpm build      # tsc --noEmit && vite build && postbuild Pages fallback
pnpm sb:start   # engine:sync + lokalni Supabase (Docker, portovi 563xx)
supabase functions serve   # edge funkcije (posebna konzola; restart posle izmena — per_worker)
pnpm e2e        # Playwright multiplayer E2E (traži sb:start + functions serve)
```

## Status / checklist

**Faza 1 — engine + vs-kompjuter (GOTOVO ✅, igrivo)**
- [x] Skela + GH Pages config + Actions deploy
- [x] Dokumentacija (RULES/ARCHITECTURE/CLAUDE) + 10 skilova
- [x] Engine: types, rng, deck, contract, bidding, play, scoring + finale
- [x] Engine: reducer (pun tok: deljenje→licitacija→talon→pratnja→igra→bodovanje), legalActions, createGame
- [x] Engine: playerView (skrivene karte)
- [x] AI (easy/medium/hard) — 3 bota odigraju celu partiju
- [x] vs-kompjuter sto UI (mobile-first, igrivo: bidding/talon/pratnja/igra/bula/kraj) — **37 testa zelena**

Pokretanje vs-kompjuter: `pnpm dev` → Početna → „Igraj protiv kompjutera". Sve lokalno, bez Supabase.

**Faza 2 — online (Supabase) — CORE GOTOVO ✅ lokalno (grana `feature/online-multiplayer`, vidi docs/ONLINE.md)**
- [x] Šema + RLS: karte STVARNO skrivene (game_states/game_actions deny-all, redakcija na serveru)
- [x] Edge funkcije = server autoritet: create/join/get-view/act/cancel + bot automatika na serveru
- [x] Anonimni auth za sve (bez registracije); Google link kasnije (linkIdentity)
- [x] Kod partije (6 znakova) + share link `/o/KOD`; random dodela mesta; pun sto → posmatrač
- [x] Lobi (mesta igrač/bot po težini), reconnect na svoje mesto, „Moje partije" (pauza/nastavak)
- [x] Realtime broadcast + presence (⌛ offline indikator) + poll fallback
- [x] Svaki potez u `game_actions` (replay-ready), stanje verzionisano (CAS)
- [x] E2E Playwright: 3 identiteta, cela ruka, reload usred partije, posmatrač, RLS provera
- [ ] Deploy na hostovani Supabase + GH Pages secrets (čeka zeleno svetlo)
- [ ] Chat, statistika, replay iz game_actions, zamena diskonektovanog botom

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
- [ ] Istorija partija + replay, animacije, zvuk, podešavanja, (opc.) Edge Function autoritet
