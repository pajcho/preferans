# Arhitektura

## Pregled

```
┌─────────────────────────┐         ┌──────────────────────────────┐
│  GitHub Pages (static)   │         │  Supabase (hostovano, free)  │
│  React 19 + Vite build   │ ◀─────▶ │  Postgres + Realtime + Auth  │
│  BrowserRouter (/r/<id>)  │  wss/   │  (RLS skriva tuđe karte)     │
│  engine (pure TS)        │  https  │  Edge Functions (Faza 3)     │
└─────────────────────────┘         └──────────────────────────────┘
```

- **Frontend** je čist statički sajt → savršeno za GitHub Pages. Ne hostujemo server.
- **Supabase** je hostovani backend (njihov cloud): baza, realtime, auth. „Bez baze koju ti održavaš."
- **Engine** (`src/engine`) je **čist TypeScript**, bez React/DOM/mreže — deterministički (seeded RNG), jedinično testabilan, i **autoritativan izvor istine**. Isti kod radi u browseru (host) sada i u Supabase Edge Function-u kasnije (Faza 3) bez izmena.

## Stack

Vite 8 · React 19 · TypeScript · Tailwind v4 (`@tailwindcss/vite`) · Zustand (view state) ·
čist reducer (faze igre) · Motion (animacije) · Howler (zvuk) · nanoid (room id) · Zod (validacija) ·
`@supabase/supabase-js`. Test: Vitest.

## Model autoriteta

- **Faza 2 — host-autoritativni klijent:** browser jednog igrača vrti engine, piše autoritativni
  *snapshot* u Supabase; ostali šalju **namere** (intents) i slušaju Realtime. Skrivene karte: RLS
  (svako čita samo svoju ruku). Stanje je u bazi → preživljava refresh i pad veze.
- **Faza 3 — server-autoritativno:** engine se preseli u **Edge Function (Deno)** → nema „host"
  poverenja, anti-varanje, prava redakcija (karte nikad ne stignu pogrešnom igraču). Migracija je
  jeftina jer je engine već čist i izomorfan.

## Sinhronizacija

- **Supabase Realtime / Postgres Changes** na `snapshots`, `moves`, `messages`.
- **Broadcast / Presence** za „ko je online", „kuca poruku", turn ping.
- Klijent šalje **intent** (`PLACE_BID`, `PLAY_CARD`, …) → autoritet primeni `reduce(state, action)` →
  upiše novi snapshot + event → svi dobiju redaktovan pogled (`redactFor(seat)`).

## Link za priključivanje

GitHub Pages project URL: `https://<user>.github.io/prefa/r/<roomId>`, `roomId = nanoid(8)`.
Custom domen kasnije: `https://prefa.online/r/<roomId>`.
GitHub Pages dobija `404.html` SPA fallback, pa BrowserRouter rute rade bez hash-a. Link je samo ključ sobe; stanje je u bazi.

## Šema (skica)

| Tabela | Ključne kolone | Svrha |
|---|---|---|
| `rooms` | `id`, `code` (unique), `status`, `settings` jsonb, `seed`, `host` | soba/partija |
| `players` | `room_id`, `seat 0..2`, `name`, `user_id`/`client_id`, `connected` | sedišta |
| `snapshots` | `room_id`, `seq`, `state` jsonb (javni deo), `updated_at` | tekuće stanje |
| `hands` | `room_id`, `hand_no`, `seat`, `cards` jsonb · **RLS: vlasnik** | skrivene karte |
| `moves` | `room_id`, `seq`, `hand_no`, `seat`, `action` jsonb | **append-only log → replay/istorija** |
| `messages` | `room_id`, `seat`, `text`, `created_at` | chat |

- **Replay & istorija:** `moves` je kompletan event-log; partija se rekonstruiše re-primenom poteza
  od `seed`-a (engine je deterministički). Završene partije ostaju za pregled.
- **RLS:** igrač čita `rooms/players/messages/moves` sobe u kojoj je; `hands` samo svoje.
  Upisi: Faza 2 veruje hostu; Faza 3 validira Edge Function.

## Faze

1. **Engine + vs-kompjuter sto** (bez backenda) — pravila + UI na jednom uređaju. *(gotovo)*
2. **Supabase**: šema, Realtime sync, link, chat, spisak poteza, statistika, RLS skrivanje karata.
3. **Poliranje**: istorija svih partija + replay, animacije, zvuk, podešavanja partije, (opc.) Edge Function autoritet.
