# Pravila preferansa — specifikacija za engine

Izvor (merodavan): **https://www.preferansklub.com/pravila1.htm** (srpski preferans).
Ovaj dokument je „izvor istine" za `src/engine`. Sve vrednosti su verbatim iz izvora.

> Napomena o varijanti: izvor ide ladder **Pik → Sans (2–7)**. „Preferans" kao ugovor
> (nosi svih 10) **ne postoji** u ovom izvoru — implementiramo Pik..Sans. Vidi `CONFIG`
> na dnu za opcione varijante (Preferans-8, otvorene igre…).

---

## 1. Špil i rang

- 32 karte: `7 8 9 10 J Q K A` u 4 boje.
- Rang u boji (jače → slabije): **A K Q J 10 9 8 7**. As najjači, 7 najslabija.
- Engine: vrednost karte `0..7` (7→0 … A→7) za poređenje u štihu.

## 2. Boje i vrednosti igre (B)

| Boja / igra | Srpski | Adut | Vrednost B |
|---|---|---|---|
| ♠ | **Pik** | da | 2 |
| ♦ | **Karo** | da | 3 |
| ♥ | **Herc** | da | 4 |
| ♣ | **Tref** | da | 5 |
| — | **Betl** | ne | 6 |
| — | **Sans** | ne | 7 |

- **Igra-X** (prijava bez uzimanja talona) = `B + 1`: Igra-Pik 3, …, Igra-Tref 6, Igra-Betl 7, Igra-Sans 8.
- Rang u licitaciji = vrednost B (Pik najslabiji, Sans najjači). Izjednačenje po B → jača prava boja / raniji sed.

## 3. Deljenje

- 3 aktivna igrača; deli se **10 + 10 + 10 i 2 u talon** („kup").
- Pattern: `5, 5, 5 → 2 u talon → 5, 5, 5`.
- Prvi prima igrač **desno od delioca**; smer **suprotno kazaljki na satu (CCW)**.
- Delilac rotira po jedno mesto svake ruke.

## 4. Licitacija

- Na potezu igrač kaže: **broj/boju** (diže), **„mogu"** (drži nivo), **„igra"** (bez talona, +1), ili **„dalje"** (pas).
- Prvi licitira igrač **desno od delioca**. Diže se **korak po korak** (ne preskače se).
- Ko je rekao „dalje" ne vraća se.
- **Dva „dalje" → treći je nosilac** na dostignutom nivou.
- **Svi „dalje" → ne igra se krug, upisuje se refe**, deli sledeći delilac.

## 5. Talon i prijava

1. Nosilac okrene/uzme 2 karte iz talona (ima 12).
2. Baca 2 karte (skrivene).
3. Prijavljuje **adut/igru** ≥ nivo iz licitacije.
4. Kod **Igra-X**: talon se NE uzima, igraju se originalnih 10.

## 6. Pragovi (prolaz/pad)

- **Adutske igre i Sans:** nosilac ≥ **6 štihova** = prolaz; < 6 = pad.
- **Betl:** nosilac sme **0 štihova**; ≥1 = pad.
- **Pratioci** (vidi §7): 1 prati → ≥2; 2 prate → ≥4 zajedno; kontra → ≥5 zajedno; pozvan → ≥4 sa pozivaocem.

## 7. Pratnja, kontra, invit

- Po prijavi, druga dva kažu **„dođem"** (prati) ili **„ne dođem"**. U **betlu svi obavezno** igraju.
- **Kontra** (pratilac, uveren u rušenje): zahteva ≥5 štihova para; **svi poeni ×2**.
- Lanac: **Kontra ×2 → Rekontra ×4 → Subkontra ×8 → Mortkontra ×16**.
- **Kontra je obavezna na pik** (CONFIG: `mandatoryKontraOnPik`, default ON).
- **Invit / „pozivanje":** ako samo jedan prati, može pozvati onog koji ne prati; pozvani je „siguran", a pozivalac nosi odgovornost. Kontra automatski uvlači nepratećeg.

## 8. Igranje štihova (obaveze)

1. **Mora se odgovoriti na traženu boju** ako je igrač ima.
2. Ako nema boju, a igra ima adut → **mora adut**. (Adut uvek jači.)
3. Ako nema ni boju ni adut → bilo koja karta.
4. **Sans/Betl:** nema adut → ako nema boju, bilo koja karta.
- **Prvi štih:** vodi **forhand** (desno od delioca; ako ne prati, sledeći aktivni). **Izuzetak — Sans:** „igra se kroz vodioca" → prvi vodi **pratilac levo od nosioca** (`right(right(nosilac))`), pa nosilac igra drugi; ako levi pratilac ne dođe, vodi drugi pratilac.
- Štih nosi najveći adut; ako nema aduta, najveća karta tražene boje. Pobednik štiha vodi sledeći.

## 9. Bodovanje — bule i supe

Svaki igrač ima svoj „papir": **leva supa | sredina (bule) | desna supa**. Crveni = negativan.

**Bule (srednja kolona nosioca):**
- prolaz: `−(B × 2)`
- pad: `+(B × 2)`
- niže (negativnije) = bolje.

**Supe (bočna kolona, pratilac protiv nosioca):**
- `supa = štihovi × B × 2`
- par pratilaca: **cap 5 štihova** ukupno.
- **Betl pad:** fiksno **60** po pratiocu (Igra-Betl: **70**) — NE formula.

**Množioci (na sve):** kontra `×2/×4/×8/×16`, **refe `×2`**.

Primer: Tref (B=5), oba prate po 2 štiha, nosilac uhvatio 6 → nosilac `−10`; svaki pratilac `2×5×2 = 20` supa.

## 10. Refe (△)

- **Upisuje se SVIMA** (+1 svakom igraču) kad **svi kažu „dalje"** ili kad je **pik** prijavljen a **niko ne kontrira**.
- **NE upisuje se nikom** ako je **bilo koji igrač u minusu** (ispod kape/šešira) ili je dostignut **max broj refea** (`maxRefe`). Već upisani refe se **NE brišu** — moraju se odigrati.
- **Obavezni pik bez kontre:** ruka se **ne igra**. Ako se refe sme upisati → upiše se svima (pa novo deljenje); inače **nosilac automatski prolazi** (nosi sve = pik prolaz `−B×2`), a taj prolaz se **duplira** ako nosilac drži neodigrani refe (i refe se odpisuje).
- Neodigran refe nosioca **duplira sve poene** te ruke; po odigravanju se **precrta jedna strana trougla** (po igraču).

## 11. Kraj partije i konačni rezultat

- Partija se završava kada je **zbir svih srednjih kolona (bula) = 0**.
- **Rezultat (po igraču):**
  `Rezultat = −(zbir tvojih supa protiv protivnika) + (zbir supa protiv tebe) + (bule × 10)`
- **Ispod nule = dobar, iznad nule = loš.** Najniži = pobednik. (Bule teže ×10, supe ×1.)

---

## CONFIG (house rules) — defaults prate preferansklub.com

| Flag | Default | Opis |
|---|---|---|
| `direction` | `CCW` | smer deljenja/igre (suprotno kazaljki) |
| `mustOvertrump` (prebijanje) | `false` | da li, kad seče, mora da prebije najjači adut ako može |
| `mustHeadSuit` | `false` | da li, kad prati boju, mora jaču kartu ako može |
| `mandatoryKontraOnPik` | `true` | obavezna kontra na pik |
| `startingBule` | `100` | početne bule (dužina partije); broj refea vezan za ovo |
| `maxRefe` | po dogovoru | gornja granica refea |
| `preferans8` | `false` | dodatni ugovor „nosi svih 10" (nije u izvoru) |
| `openGames` (otvoreno) | `false` | betl/sans otvoreno (nije u izvoru) |

⚠️ **Pažnja pri implementaciji:** (a) srednja kolona je *signed* i u finalu se množi ×10, supe ×1 — lako se pogreši znak; (b) betl pad = fiksnih 60/70, ne formula; (c) supe cap na 5 štihova; (d) `prolaz = −`, `pad = +` (negativno je dobro). Pokriti sve ovo testovima.
