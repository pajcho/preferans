# Arhitektura

## Pregled

```
┌─────────────────────────┐         ┌──────────────────────────────┐
│  GitHub Pages (static)   │         │  Supabase (hostovano, free)  │
│  React 19 + Vite build   │ ◀─────▶ │  Postgres + Realtime + Auth  │
│  BrowserRouter (/o/<kod>) │  wss/   │  Edge Functions (Deno) =     │
│  engine (pure TS)        │  https  │  server autoritet + botovi   │
└─────────────────────────┘         └──────────────────────────────┘
```

- **Frontend** je čist statički sajt → savršeno za GitHub Pages. Ne hostujemo server.
- **Supabase** je hostovani backend (njihov cloud): baza, realtime, auth, edge funkcije.
- **Engine** (`src/engine`) je **čist TypeScript**, bez React/DOM/mreže — deterministički (seeded RNG),
  jedinično testabilan, i **autoritativan izvor istine**. Isti kod radi u browseru (vs-kompjuter)
  i u Supabase Edge funkcijama (online) — `scripts/sync-shared.sh` kopira ga u
  `supabase/functions/_shared/` (engine importi zato nose `.ts` ekstenzije, Deno ih zahteva).

## Stack

Vite 8 · React 19 · TypeScript · Tailwind v4 (`@tailwindcss/vite`) · Zustand (view state) ·
čist reducer (faze igre) · Motion (animacije) · Howler (zvuk) · Zod (validacija) ·
`@supabase/supabase-js`. Test: Vitest + Playwright (multiplayer E2E).

## Model autoriteta (Faza 2 — IMPLEMENTIRANO)

**Server-autoritativno od starta** (preskočili smo host-klijent varijantu — detalji u
[ONLINE.md](ONLINE.md)):

- Pun `GameState` (sve ruke + seed) živi SAMO u `game_states` (RLS deny-all; pristup isključivo
  kroz edge funkcije sa service role ključem).
- Klijent šalje `act` (edge funkcija) → autorizacija po mestu → engine `reduce(state, action)`
  (validacija svih pravila) → CAS upis (`version + 1`) → append u `game_actions` → realtime
  broadcast → svi klijenti povuku **redigovan pogled** (`redactStateFor(seat, state)` — tuđe ruke
  su filler karte, seed obrisan; posmatrač ne vidi nijednu ruku).
- **Botovi igraju na serveru** (`runAutomation` u pozadini poziva, sa UX tempom: potez 0.8s,
  zatvaranje štiha 1.6s, claim 3.5s) — partija živi i kad kreator zatvori tab.
- **Identitet**: Supabase anonymous auth (tihi trajni nalog po browseru, bez registracije);
  kasnije opciono povezivanje sa Google nalogom (`linkIdentity`).

## Sinhronizacija

- **Realtime Broadcast** na javnom kanalu `game:{uuid}` — server šalje `{version, status, phase,
  actor}` posle svakog poteza (REST broadcast API iz edge funkcije); klijenti na event rade
  `get-view`. **Presence** na istom kanalu daje „ko je online" (⌛ indikator).
- Fallback: klijentski poll na 12s + „stall kick" u `get-view` (restartuje bot automatiku ako
  stoji > 5s).

## Link za priključivanje

`https://<host>/o/<KOD>` — kod partije je **6 znakova** (A–Z/2–8 bez dvosmislenih, unique u bazi).
Otvaranje linka: igrač za stolom → reconnect na svoje mesto; slobodno mesto → forma za ime +
nasumična dodela; pun sto → posmatrač. GitHub Pages ima `404.html` SPA fallback pa BrowserRouter
rute rade bez hash-a.

## Šema (implementirano — supabase/migrations)

| Tabela | Ključne kolone | RLS |
|---|---|---|
| `profiles` | `id` (auth.users), `display_name` | svoj red |
| `games` | `id`, `code` unique, `status`, `config` jsonb, `version`, `phase`, `summary` | SELECT: samo igrači partije |
| `game_players` | `game_id`, `seat 0..2`, `user_id` (bot ⇒ null), `display_name`, `is_bot`, `bot_difficulty` | SELECT: samo igrači partije |
| `game_states` | `game_id`, `state` jsonb (PUN state), `version` | **deny all** (service role) |
| `game_actions` | `game_id`, `seq` (= version), `hand_no`, `seat`, `action` jsonb | **deny all** (service role) |

- **Replay & istorija:** `game_actions` je kompletan event-log (uklj. `INIT` sa seed-om);
  partija se rekonstruiše re-primenom poteza (engine je deterministički).
- **Pauza/nastavak:** svaki potez je odmah u bazi → partija je uvek nastavljiva; „Moje partije"
  na početnoj (RLS filtrira na moje) + isti share link vraćaju za sto.

## Faze

1. **Engine + vs-kompjuter sto** (bez backenda) — pravila + UI na jednom uređaju. *(gotovo)*
2. **Online multiplayer** — server autoritet, lobi, kodovi, posmatrač, reconnect, bot automatika,
   E2E. *(core gotovo lokalno; ostaje deploy na hostovani Supabase, chat, statistika)*
3. **Poliranje**: replay iz `game_actions`, Google link identiteta, animacije, zvuk, podešavanja
   partije, zamena diskonektovanog igrača botom.
