# Arhitektura

## Pregled

```
┌──────────────────────────┐         ┌────────────────────────────────┐
│  GitHub Pages (static)   │         │  Cloudflare (free tier)        │
│  React 19 + Vite build   │ ◀─────▶ │  Worker (router, auth, CORS)   │
│  BrowserRouter (/o/<kod>)│  wss/   │  GameRoom DO = 1 partija       │
│  engine (pure TS)        │  https  │  (state+log+WS+alarmi) · D1    │
└──────────────────────────┘         └────────────────────────────────┘
```

- **Frontend** je čist statički sajt → savršeno za GitHub Pages. Ne hostujemo server.
- **Backend** je Cloudflare Worker + **GameRoom Durable Object** (SQLite-backed) po partiji
  + **D1** za lookup/liste. Detalji: [CLOUDFLARE.md](CLOUDFLARE.md).
- **Engine** (`src/engine`) je **čist TypeScript**, bez React/DOM/mreže — deterministički
  (seeded RNG), jedinično testabilan, i **autoritativan izvor istine**. Isti kod radi u
  browseru (vs-kompjuter) i u DO-u (online) — worker ga importuje direktno, bez kopiranja.

## Stack

Vite 8 · React 19 · TypeScript · Tailwind v4 (`@tailwindcss/vite`) · Zustand (view state) ·
čist reducer (faze igre) · Motion (animacije) · Howler (zvuk) · Zod (validacija) ·
Wrangler (Cloudflare dev/deploy). Test: Vitest (engine) + `@cloudflare/vitest-pool-workers`
(DO/worker u workerd runtime-u) + Playwright (multiplayer E2E).

## Model autoriteta (Faza 2 — IMPLEMENTIRANO)

**Server-autoritativno od starta** (detalji u [ONLINE.md](ONLINE.md)):

- Pun `GameState` (sve ruke + seed) živi SAMO u GameRoom DO storage-u; klijent dobija
  **redigovan pogled** (`redactStateFor(seat, state)` — tuđe ruke su filler karte, seed
  obrisan; posmatrač ne vidi nijednu ruku).
- Klijent šalje potez kroz WS → DO autorizacija po mestu → engine `reduce(state, action)`
  (validacija svih pravila) → append u log poteza (`actions`, seq = verzija) → **DO gura
  svež redigovan view svakom klijentu** po njegovom sedištu (bez poll-a/refetch-a).
- Potezi su **serijalizovani prirodom DO-a** (single-threaded po partiji) — nema CAS-a.
- **Botovi igraju na serveru** preko DO Alarms sa UX tempom (potez 0.8s, zatvaranje štiha
  1.6s, claim 3.5s) — partija živi i kad kreator zatvori tab.
- **Identitet**: anonimni `{ userId, HMAC token }` u localStorage (bez registracije);
  kasnije opciono vezivanje naloga (Faza 3).

## Sinhronizacija

- **WebSocket na GameRoom DO** (Hibernation API): server šalje `view` posle svake promene i
  `presence` (ko je online — ⌛ indikator). Klijent ima reconnect sa backoff-om i heartbeat
  (`ping`→`pong` auto-odgovor koji ne budi DO).
- Jednokratni REST `view` pri ulasku na sto (brz prvi render + jasna 404 za pogrešan kod);
  „stall kick" u view/sync putanjama ponovo zakazuje alarm automatike ako je nestao.

## Link za priključivanje

`https://<host>/o/<KOD>` — kod partije je **6 znakova** (A–Z/2–8 bez dvosmislenih, unique u
D1) i ujedno **ime GameRoom DO-a** (`getByName(code)`). Otvaranje linka: igrač za stolom →
reconnect na svoje mesto; slobodno mesto → forma za ime + nasumična dodela; pun sto →
posmatrač. GitHub Pages ima `404.html` SPA fallback pa BrowserRouter rute rade bez hash-a.

## Skladištenje (implementirano)

| Gde | Šta | Pristup |
|---|---|---|
| GameRoom DO storage (KV) | `meta` (status, igrači, verzija...), `state` (PUN GameState) | samo DO |
| GameRoom DO storage (SQL) | `actions` — append-only log poteza (seq = version, INIT sa seed-om) | samo DO |
| D1 `games` | code (PK), status, phase, hand_no, current_actor, version, summary | worker (mine/lookup); piše DO (async sync) |
| D1 `game_players` | code, seat 0–2, user_id (bot ⇒ null), display_name, is_bot, bot_difficulty | isto |

- **Replay & istorija:** log poteza u DO-u je kompletan event-log; partija se rekonstruiše
  re-primenom poteza (engine je deterministički).
- **Pauza/nastavak:** svaki potez je odmah upisan → partija je uvek nastavljiva; „Moje
  partije" na početnoj (D1 filtrira po mom userId) + isti share link vraćaju za sto.

## Faze

1. **Engine + vs-kompjuter sto** (bez backenda) — pravila + UI na jednom uređaju. *(gotovo)*
2. **Online multiplayer** — server autoritet, lobi, kodovi, posmatrač, reconnect, bot
   automatika, E2E. *(core gotovo lokalno na Cloudflare stack-u; ostaje deploy, chat, statistika)*
3. **Poliranje**: replay iz loga poteza, vezivanje naloga, animacije, zvuk, podešavanja
   partije, zamena diskonektovanog igrača botom.
