# Cloudflare backend (Workers + Durable Objects)

Online multiplayer backend: **Cloudflare Worker** (router) + **GameRoom Durable Object**
(1 partija = 1 DO) + **D1** (lookup po kodu i „Moje partije"). Sve radi lokalno kroz
`wrangler dev` — bez Dockera. Kod je u [workers/](../workers/).

> Zašto Cloudflare umesto Supabase: free tier bez „spavanja" projekata (Supabase pauzira
> posle 7 dana neaktivnosti i ograničava na 2 aktivna projekta), a model 1 partija = 1 DO
> prirodno leži uz preferans sto (serijalizovani potezi bez CAS-a, WebSocket push, alarmi
> za bot tempo). Detalji istorije odluka: [ARCHITECTURE.md](ARCHITECTURE.md).

## Arhitektura ukratko

- **GameRoom DO = autoritet jedne partije.** Ime DO-a je kod partije (6 znakova), pa
  `getByName(code)` uvek pogađa istu instancu. Pun `GameState` (sve ruke, seed) živi SAMO
  u DO storage-u; klijent dobija **redigovan view** (`redactStateFor(seat, state)` — tuđe
  ruke su filler karte, seed obrisan; posmatrač ne vidi nijednu ruku).
- **Isti engine** (`src/engine`, čist TS) radi u browseru (vs-kompjuter) i u DO-u — worker
  ga importuje direktno (esbuild bundle), **bez kopiranja** (sync-shared skripta iz Supabase
  faze više ne postoji).
- **Potezi su serijalizovani prirodom DO-a** (single-threaded) — nema potrebe za
  optimističkim zaključavanjem (CAS) kao na Postgres-u.
- **WebSocket push:** klijent drži WS ka DO-u (`/api/games/:code/ws`); posle SVAKE promene
  server gura svež redigovan view svakom klijentu po njegovom sedištu. Nema poll-a niti
  „broadcast pa refetch" sklopa. WS koristi **Hibernation API** (konekcije prežive
  eviction DO-a; `ping`→`pong` auto-odgovor ne budi DO).
- **Botovi na serveru preko DO Alarms** (ne setTimeout petlje): potez 0.8s, zatvaranje
  štiha 1.6s, finalizacija claim-a 3.5s. Alarm preživljava eviction/restart; „stall kick"
  u view/sync/WS-connect putanjama ga po potrebi ponovo zakazuje.
- **Append-only log poteza** u DO SQLite tabeli `actions` (seq = verzija stanja, INIT sa
  seed-om) → partija je replay-ready i uvek nastavljiva.
- **D1** drži samo metapodatke (`games`, `game_players`) koje DO asinhrono sinhronizuje
  (`waitUntil`) — za listu „Moje partije" i status na početnoj.
- **Identitet:** anonimni — `POST /api/auth/anon` izdaje `{ userId, token }` (UUID +
  HMAC-SHA256 potpis sa `AUTH_SECRET`). Klijent ga čuva u localStorage i šalje kao
  `Authorization: Bearer` (REST) odnosno `?token=` (WS). Bez registracije; sedišta su
  vezana za `userId` pa reconnect vraća na isto mesto.
- **Nalog (opciono):** `POST /api/auth/register` veže email+lozinku za TRENUTNI `userId`
  (workers/src/account.ts) — identitet se NE menja, pa sve dotadašnje partije automatski
  ostaju u istoriji. Prijava (`/api/auth/login`) vraća isti `userId` + token (HMAC je
  deterministički) na svakom uređaju → ista „Moje partije" svuda. Lozinke: PBKDF2-SHA256,
  100k iteracija (WebCrypto; kolone `email` + `password_hash` u D1 `players`, migracija 0003).
  Bez email potvrde — samo UNIQUE provera zauzetosti emaila. Odjava = klijent obriše
  identitet iz localStorage (sledeći put dobija nov anoniman).

## HTTP/WS API (workers/src/index.ts)

| Ruta | Metod | Opis |
|---|---|---|
| `/api/auth/anon` | POST | izdaje anonimni identitet `{ userId, token }` |
| `/api/auth/register` | POST | nadogradnja identiteta u nalog: `{ email, password, displayName? }` → `AccountResponse`; zauzet email → 409; već registrovan → 409 |
| `/api/auth/login` | POST | bez Bearer-a: `{ email, password }` → `{ userId, token, email, displayName }` naloga; pogrešni kredencijali → 401 |
| `/api/auth/me` | GET | status naloga za pozivaoca: `{ userId, registered, email, displayName }` |
| `/api/auth/profile` | POST | izmena profila: `displayName` / `email` (provera zauzetosti) / `newPassword`+`currentPassword` (403 na pogrešnu trenutnu) |
| `/api/games` | POST | kreiranje partije (ime OPCIONO — server dodeli `Gost-XXXX`, ne gazi već poznato ime; default = kreator + 2 slobodna mesta, bule 100, refe 2); kreator na nasumično „human" mesto; NEMA auto-starta. „Igraj protiv kompjutera" = create sa seats `[human, bot, bot]` + odmah `start` |
| `/api/games/join` | POST | join po kodu: postojeći igrač → reconnect; slobodno mesto → nasumična dodela; pun lobi → čekaonica (`waitingPos`); posle starta → `spectator` |
| `/api/games/mine` | GET | nezavršene (lobby/active) partije pozivaoca (iz D1) |
| `/api/games/history` | GET | ZAVRŠENE partije pozivaoca (server-backed istorija); imena TRENUTNA (COALESCE `players.display_name`) |
| `/api/games/:code/replay` | GET | pun log ZAVRŠENE partije — SAMO učesnik (403 stranac, 409 nezavršena) → klijent rekonstruiše karte/štihove kroz engine |
| `/api/games/:code/config` | POST | podešavanje lobija — SAMO kreator, samo u lobiju: mesto igrač/bot(+težina) i pravila (bule/refe); zauzeto mesto → 409; oslobođeno mesto odmah dobija prvi POVEZANI iz čekaonice |
| `/api/games/:code/start` | POST | start partije — SAMO kreator; traži popunjena sva mesta (409 inače); prazni čekaonicu (ostali su posmatrači) |
| `/api/games/:code/leave` | POST | izlazak iz čekaonice ILI ustajanje sa mesta — samo u lobiju (posle starta 409); kreator ne može (403 — ima cancel); oslobođeno mesto odmah dobija prvi POVEZANI iz čekaonice |
| `/api/games/:code/view` | GET | jednokratni redigovan pogled (prvi render pre WS-a) |
| `/api/games/:code/cancel` | POST | otkazivanje — samo kreator |
| `/api/games/:code/ws` | GET | WebSocket upgrade (token u query-ju; Origin provera) |
| `/api/games/:code/debug` | GET | log poteza + meta — SAMO uz `DEBUG_API=1` (lokalno/E2E) |

WS poruke ([src/protocol/messages.ts](../src/protocol/messages.ts)):
klijent šalje `{type:'act', reqId, action}` i `{type:'sync'}`; server šalje
`{type:'view'}`, `{type:'presence'}` (ko je online — ⌛ indikator), `{type:'ack'|'error', reqId}`.

Autorizacija poteza (u DO-u, ista pravila kao ranije): svako igra samo svoje mesto;
`NEXT_HAND` sme bilo koji igrač; `PROCEED` se vezuje za pozivaoca;
`RESOLVE_TRICK`/`FINALIZE_CLAIM` primenjuje isključivo server (alarm).

## Lokalni razvoj

```bash
pnpm cf:dev   # .dev.vars iz primera + D1 migracije + wrangler dev (http://localhost:8787)
pnpm dev      # vite (http://localhost:5173) — u dev-u klijent sam gađa localhost:8787
```

Bez ikakvog podešavanja: `workers/.dev.vars` se automatski pravi iz
[.dev.vars.example](../workers/.dev.vars.example) (dev `AUTH_SECRET` + `DEBUG_API=1`).

## Testovi

```bash
pnpm test          # vitest — engine (101 test)
pnpm test:workers  # vitest u workerd runtime-u (@cloudflare/vitest-pool-workers):
                   # DO create/join/act autorizacija, redakcija, alarmi (cela ruka),
                   # D1 sync, REST + WS integracija
pnpm e2e           # Playwright multiplayer (3 browser konteksta) — sam podiže oba servera
```

## Deploy (URAĐENO ✅)

Produkcija: **`https://prefa-backend.pajcho.workers.dev`** (D1 `prefa`, region EEUR).
Novi deploy posle izmena koda: `wrangler deploy -c workers/wrangler.jsonc`.

Šta je podešeno (za istoriju / novi nalog):

```bash
wrangler login
wrangler secret put AUTH_SECRET -c workers/wrangler.jsonc   # dugačak random string
wrangler d1 create prefa                                    # pa upiši database_id u wrangler.jsonc
wrangler d1 migrations apply prefa --remote -c workers/wrangler.jsonc
wrangler deploy -c workers/wrangler.jsonc
# GH Actions build: repo secret VITE_API_URL = https://prefa-backend.pajcho.workers.dev
```

> **Gotcha:** novi Cloudflare nalozi u dashboardu NEMAJU UI za registraciju workers.dev
> subdomena (deploy pada uz kod 10063). Registruje se direktno kroz API:
> `PUT /accounts/:id/workers/subdomain` sa `{"subdomain":"..."}` (Bearer = wrangler OAuth token).

`ALLOWED_ORIGINS` u [wrangler.jsonc](../workers/wrangler.jsonc) pokriva
`https://pajcho.github.io` i localhost. `DEBUG_API` u produkciji NE postavljati.

## Limiti free tier-a (za referencu)

- Workers: 100k zahteva/dan, 10ms CPU po invokaciji (engine potez je sub-ms; claim solver
  je najteži — meriti ako zapne).
- Durable Objects (SQLite-backed): uključeni u free plan, WebSocket hibernation ne broji
  vreme mirovanja.
- D1: 5GB, 100k upisa/dan (jedan upis meta po potezu + igrači pri join-u).
