# Online multiplayer (Faza 2)

Real-time preferans za 2–3 čoveka (+ botovi), server autoritet na Supabase Edge Functions.
Sve ispod radi **lokalno** (Docker); deploy na hostovani Supabase je opisan na dnu.

## Arhitektura ukratko

- **Server autoritet**: pun `GameState` (sve ruke, seed) živi SAMO u tabeli `game_states`
  (RLS deny-all → čita/piše isključivo service role kroz edge funkcije). Klijent nikad ne
  vidi tuđe karte — `redactStateFor(seat, state)` menja tuđe ruke filler kartama.
- **Isti engine** (`src/engine`, čist TS bez zavisnosti) radi u browseru (vs-kompjuter) i
  u Deno edge funkcijama (`scripts/sync-shared.sh` kopira ga u `supabase/functions/_shared/`).
- **Identitet**: Supabase anonymous auth — svako tiho dobije trajni nalog u browseru
  (bez registracije). Kasnije: „Poveži Google" preko `linkIdentity` (Faza 3).
- **Tok poteza**: klijent → `act` edge funkcija → autorizacija po mestu → `reduce()` →
  CAS upis (`version+1`) → append u `game_actions` → realtime broadcast na `game:{id}` →
  svi klijenti povuku svež redigovan pogled (`get-view`).
- **Botovi na serveru**: posle svakog poteza `runAutomation` (EdgeRuntime.waitUntil)
  vuče bot poteze sa tempom 0.8s, zatvara štih posle 1.6s, finalizuje claim posle 3.5s.
  Ako automatika „umre" (restart), sledeći `get-view` je ponovo pokreće (stall kick > 5s),
  a klijent ima i poll fallback na 12s.
- **Pauza/nastavak**: svaki potez je u bazi, pa je svaka partija uvek nastavljiva —
  zatvoriš tab, vratiš se preko koda ili „Moje partije". Sedišta su vezana za user id
  (reconnect vraća na isto mesto).

## Šema (migrations/20260703000000_online_schema.sql)

| Tabela | Sadržaj | RLS |
|---|---|---|
| `profiles` | display_name (auto-trigger na signup) | vidiš/menjaš samo svoj |
| `games` | metapodaci: code (6 znakova), status, phase, version, config | SELECT samo igrači te partije |
| `game_players` | seat 0–2, user ili bot (+ težina) | SELECT samo igrači te partije |
| `game_states` | pun GameState (jsonb) + version | **deny all** (service role) |
| `game_actions` | append-only log poteza (seq = version) | **deny all** (service role) |

Status partije: `lobby → active → finished` (ili `abandoned` preko cancel-a).

## Edge funkcije (supabase/functions)

- `create-game` — kod (6 znakova, bez 0/O/1/I/L), kreator na nasumično „human" mesto,
  botovi odmah sedaju; ako je kreator jedini čovek → partija odmah počinje.
- `join-game` — po kodu: postojeći igrač → reconnect; slobodno mesto → nasumična dodela;
  pun sto → `role: spectator`. Kad poslednje mesto sedne → deljenje + start.
- `get-view` — redigovan pogled za pozivaoca (igrač/posmatrač) + stall kick automatike.
- `act` — autorizacija (svoje mesto; `NEXT_HAND` bilo ko; `RESOLVE_TRICK`/`FINALIZE_CLAIM`
  samo server; `PROCEED` se vezuje za pozivaoca), validacija kroz engine `reduce`.
- `cancel-game` — samo kreator; partija → `abandoned`.

## Lokalni razvoj

```bash
pnpm sb:start                  # engine:sync + supabase start (Docker; portovi 563xx)
supabase functions serve       # edge funkcije (posebna konzola; restart posle izmena)
pnpm dev                       # http://localhost:5173
```

`.env.local` (auto-gitignored):

```
VITE_SUPABASE_URL=http://127.0.0.1:56321
VITE_SUPABASE_ANON_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
```

> **Napomena:** `config.toml` drži `edge_runtime.policy = "per_worker"` jer bot automatika
> (background task posle odgovora) sa `oneshot` politikom umire. Zbog toga lokalne izmene
> funkcija traže restart `supabase functions serve`. Posle izmene engine-a: `pnpm engine:sync`.

## Testovi

```bash
pnpm test   # vitest (uklj. redactStateFor — dokaz da nema curenja karata)
pnpm e2e    # Playwright: 3 browser konteksta (Ana/Boban/Ceca) — kreiranje, join kodom,
            # cela ruka (licitacija→talon→pratnja→igra→bodovanje), reload/reconnect,
            # posmatrač, provera game_actions/game_states, RLS negativni test
```

## UX tok

1. **Početna** → „Online sa drugarima": ime + 2 protivnička mesta (igrač ili bot po težini)
   → „Napravi sto" → lobi sa kodom i share linkom (`/o/KOD`).
2. Drugar otvori link (ili ukuca kod na početnoj) → upiše ime → nasumično slobodno mesto.
   Sva mesta puna → deljenje kreće automatski.
3. Pun sto + novi posetilac → posmatrač (vidi sto bez ijedne ruke, uživo).
4. Prekid veze/izlaz: partija čeka u bazi; „Moje partije" na početnoj (ili isti link)
   vraća za sto. Igrači koji nisu povezani imaju ⌛ pored imena (realtime presence).

## Deploy na hostovani Supabase (kada dođe vreme)

```bash
supabase link --project-ref <ref>
supabase db push                              # migracije
pnpm engine:sync && supabase functions deploy # sve funkcije
# GH Actions build: VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY kao repo secrets
```

## Poznata v1 ograničenja

- Ruke viđene u panelu „Potezi" se grade tokom sesije (server rekonstrukcija istorije
  ruku dolazi uz replay u Fazi 3; log poteza je već kompletan u `game_actions`).
- Nema chata, nema zamene diskonektovanog igrača botom, nema izlaska sa mesta u lobiju.
- Posmatrač ne vidi otvoreni talon tokom potvrde (isto kao igrači koji nisu na potezu).
