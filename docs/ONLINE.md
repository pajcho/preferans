# Online multiplayer (Faza 2)

Real-time preferans za 2–3 čoveka (+ botovi), server autoritet na **Cloudflare Workers +
Durable Objects**. Backend detalji (arhitektura, API, deploy): [CLOUDFLARE.md](CLOUDFLARE.md).

> Istorijska napomena: Faza 2 je prvo implementirana na Supabase (Postgres + Realtime +
> Edge Functions) i radila je lokalno, ali je pre deploy-a prebačena na Cloudflare —
> Supabase free tier dozvoljava 2 aktivna projekta i pauzira projekte posle 7 dana
> neaktivnosti. Funkcionalnost i UX su identični; kompletna Supabase implementacija
> postoji u git istoriji (grana `feature/online-multiplayer`).

## Model ukratko

- **Server autoritet:** pun `GameState` (sve ruke, seed) živi SAMO u GameRoom DO storage-u.
  Klijent nikad ne vidi tuđe karte — `redactStateFor(seat, state)` menja tuđe ruke filler
  kartama; posmatrač ne vidi nijednu ruku.
- **Isti engine** (`src/engine`, čist TS bez zavisnosti) radi u browseru (vs-kompjuter) i
  na serveru (worker ga bundluje direktno — nema kopiranja koda).
- **Identitet:** anonimni, bez registracije — potpisan token u localStorage; sedišta vezana
  za userId (reconnect vraća na isto mesto).
- **Tok poteza:** klijent → WS `act` → DO autorizacija po mestu → engine `reduce()`
  (validira SVE; baca na nelegalno) → append u log poteza → **server gura svež redigovan
  view svima kroz WS** (bez poll-a).
- **Botovi na serveru:** DO alarmi sa UX tempom — potez 0.8s, zatvaranje štiha 1.6s,
  finalizacija claim-a 3.5s. Partija živi i kad svi zatvore tab.
- **Pauza/nastavak:** svaki potez je odmah upisan, pa je svaka partija uvek nastavljiva —
  zatvoriš tab, vratiš se preko koda ili „Moje partije".

## UX tok

1. **Početna** → „Online sa drugarima": ime + 2 protivnička mesta (igrač ili bot po težini)
   → „Napravi sto" → lobi sa kodom i share linkom (`/o/KOD`).
2. Drugar otvori link (ili ukuca kod na početnoj) → upiše ime → nasumično slobodno mesto.
   Sva mesta puna → deljenje kreće automatski.
3. Pun sto + novi posetilac → posmatrač (vidi sto bez ijedne ruke, uživo).
4. Prekid veze/izlaz: partija čeka na serveru; „Moje partije" na početnoj (ili isti link)
   vraća za sto. Igrači koji nisu povezani imaju ⌛ pored imena (WS presence).

## Kod partije

`https://<host>/o/<KOD>` — 6 znakova (A–Z/2–8 bez dvosmislenih 0/O/1/I/L), unique u D1.
Kod je ujedno ime GameRoom DO-a, pa link uvek pogađa istu partiju.

## Lokalni razvoj i testovi

```bash
pnpm cf:dev   # Cloudflare backend (wrangler dev, :8787) — bez Dockera
pnpm dev      # vite (:5173); u dev-u klijent sam gađa :8787
pnpm e2e      # Playwright: 3 browser konteksta (Ana/Boban/Ceca) — kreiranje, join kodom,
              # cela ruka, reload/reconnect, posmatrač, „Moje partije",
              # log poteza + redakcija za stranca (sam podiže oba servera)
```

## Poznata v1 ograničenja

- Ruke viđene u panelu „Potezi" se grade tokom sesije (server rekonstrukcija istorije
  ruku dolazi uz replay u Fazi 3; log poteza u DO-u je već kompletan).
- Nema chata, nema zamene diskonektovanog igrača botom, nema izlaska sa mesta u lobiju.
- Posmatrač ne vidi otvoreni talon tokom potvrde (isto kao igrači koji nisu na potezu).
