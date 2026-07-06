# Admin dashboard (interni)

Interna statistika korišćenja + debug drill-down do svakog poteza. Ruta: **`/admin`**
(lazy-loaded — ne ulazi u bundle za igrače). Podaci žive u D1 + GameRoom DO storage-u.

## Pristup

- Server: `/api/admin/*` traži `Authorization: Bearer <ADMIN_TOKEN>`.
  - `ADMIN_TOKEN` je Worker **secret**. Bez njega admin API vraća **404** (kao da ne postoji).
  - Poređenje tokena je timing-safe (SHA-256 + `crypto.subtle.timingSafeEqual`).
  - Produkcija: `wrangler secret put ADMIN_TOKEN -c workers/wrangler.jsonc` (dugačak random string).
  - Lokalno: `workers/.dev.vars` → `ADMIN_TOKEN=dev-admin-prefa-lokalno` (ensure-dev-vars ga dopiše).
- Klijent: token se unosi na `/admin` i čuva u localStorage (`prefa-admin-token`); 401 vraća na prijavu.

## Šta prikazuje

- **Kartice**: partije ukupno / aktivne sada (promena u poslednjih 10 min) / završene / lobi / otkazane / igrači / ruke.
- **Aktivnost (30 dana)**: kreirane vs završene partije po danu.
- **Šta se igra**: breakdown obodovanih ruku po ugovoru (+ „igra" varijante) sa procentom padova.
- **Partije**: filter po statusu, pretraga (kod / ime / userId — dovoljan prefiks), paginacija; klik → drill-down.
- **Igrači**: ko najviše igra — partije, završene, pobede (najbolji `finalScore`), koliko puta nosilac,
  poslednja aktivnost, lokacija.
- **Lokacije**: zemlje igrača (iz `request.cf.country/city` pri create/join).
- **Drill-down `/admin/g/:code`**: meta + igrači (presence 🟢 preko WS), obodovane ruke,
  **ceo log poteza** iz DO-a (čitljivi opisi, filter po ruci), pun neredigovan `GameState` JSON
  (debug — sve karte). Aktivna partija se osvežava na 10 s (može da se gleda uživo).
  Seed/istorijske partije bez DO-a prikazuju samo D1 meta podatke.

## Odakle podaci

- **D1** (`workers/migrations/`):
  - `games`, `game_players` — postoje od ranije (DO ih sinhronizuje).
  - `players` (0002) — profil po anonimnom `userId`: poslednje ime, zemlja/grad, first/last seen.
    Upis: worker na create/join (`upsertPlayer`, `ctx.waitUntil`).
  - `hands` (0002) — svaka obodovana ruka: nosilac, ugovor, kontra, pad. Upis: GameRoom DO
    (`recordHand`) kad `reduce` proizvede novi `lastHand`.
- **DO storage**: `adminDump()` RPC vraća meta + pun state + `actions` log (samo za admin rute).

## Endpointi

| Ruta | Vraća |
| --- | --- |
| `GET /api/admin/ping` | provera tokena |
| `GET /api/admin/stats` | kartice + dnevna serija + ugovori + zemlje |
| `GET /api/admin/games?status=&q=&limit=&offset=` | lista partija |
| `GET /api/admin/games/:code` | D1 meta + hands + DO dump (state, potezi, presence) |
| `GET /api/admin/players?limit=&offset=` | igrači sa agregatima i pobedama |

Tipovi: [src/protocol/admin.ts](../src/protocol/admin.ts) (deli ih worker i klijent).

## Lokalni demo podaci

```bash
pnpm cf:seed       # dummy: 60+ partija / 12 igrača sa lokacijama / 300+ ruku (30 dana istorije)
pnpm cf:dev        # backend (:8787)
pnpm cf:demo-game  # odigra PRAVU partiju protiv botova → pun log poteza za drill-down
pnpm dev           # frontend → http://localhost:5173/admin (token: dev-admin-prefa-lokalno)
```

Seed partije imaju kodove `ZZ....`, useri `seed-...` — ponovni `cf:seed` prvo obriše stare.
Testovi: `workers/test/admin.spec.ts` (auth 401/200, stats, lista+detalj, upis igrača).
