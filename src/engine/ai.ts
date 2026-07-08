import type {
  Action,
  BidLevel,
  Card,
  Contract,
  ContractKind,
  Difficulty,
  GameState,
  PlayedCard,
  Seat,
  Suit,
} from './types.ts';
import { SUITS, RANKS } from './types.ts';
import { rankIndex } from './deck.ts';
import { SUIT_BID_VALUE, trumpOf } from './contract.ts';
import { legalBidOptions, right } from './bidding.ts';
import { legalCards, trickWinner } from './play.ts';
import { activeSeatCount } from './reducer.ts';

// ─────────────────────────────────────────────────────────────
// AI protivnik. Čita SAMO svoju ruku + javno stanje (odigrane karte, štih, ugovor) —
// nikad ne zaviruje u tuđe ruke; sve je determinističko (bez Math.random/Date.now).
// JEDINI izuzetak: hard pri LICITACIJI „viri" u talon (zna tačnu ruku posle škarta) —
// namerna mala prednost najtežeg nivoa; u igri karata i hard vidi samo javno.
//
// Licitacija (nosiocu treba 6 od 10 štihova; bolji pas nego pad):
//   easy   — gruba HCP procena (ume da preceni ruku), ne objavljuje „igru"
//   medium — realna procena štihova: simulacija izvlačenja aduta, stoperi po bojama
//            za sans (nosilac sansa NIKAD ne vodi prvi), prolaz po boji za betl
//   hard   — ista procena, ali na TAČNOJ ruci posle talona i škarta (viri u talon)
// „Moje" (HOLD) se preuzima samo kad ruka zaista nosi taj nivo — bez otimanja licitacije.
// Nivo dizanja pokriva samo boje čija je vrednost ≥ nivo (ko digne na 4 ne može igrati pik).
//
// Igra karata — nivoi se razlikuju kao i ranije:
//   easy   — pohlepno, bez pamćenja: uzima kad može, „preuzme" i suigrača (greška)
//   medium — pamti odigrano: kešira sigurne štihove (master), nosilac vadi adute
//   hard   — kao medium + brani suigrača „masterom" u 2. ruci, gradi najdužu boju
// ─────────────────────────────────────────────────────────────

const HCP: Record<string, number> = { A: 4, K: 3, Q: 2, J: 1 };

function suitLengths(cards: readonly Card[]): Record<Suit, number> {
  const l: Record<Suit, number> = { pik: 0, karo: 0, herc: 0, tref: 0 };
  for (const c of cards) l[c.suit]++;
  return l;
}

function suitHcp(cards: readonly Card[], suit: Suit): number {
  let h = 0;
  for (const c of cards) if (c.suit === suit) h += HCP[c.rank] ?? 0;
  return h;
}

function handStrength(cards: readonly Card[]): number {
  let hcp = 0;
  for (const c of cards) hcp += HCP[c.rank] ?? 0;
  const lens = suitLengths(cards);
  const longest = Math.max(lens.pik, lens.karo, lens.herc, lens.tref);
  return hcp + Math.max(0, longest - 4) * 2;
}

// ── Procena ruke za licitaciju ──

/** Rangovi (rankIndex) mojih karata u boji, rastuće. */
function suitRanks(cards: readonly Card[], suit: Suit): number[] {
  return cards
    .filter((c) => c.suit === suit)
    .map((c) => rankIndex(c.rank))
    .sort((a, b) => a - b);
}

/** Rangovi boje koje NE držim (kod protivnika ili u talonu), rastuće. */
function missingRanks(mine: readonly number[]): number[] {
  const out: number[] = [];
  for (let r = 0; r < RANKS.length; r++) if (!mine.includes(r)) out.push(r);
  return out;
}

/** Neprekinut niz najjačih karata boje od asa naniže (A=1, AK=2, AKQ=3…). */
function topRun(mine: readonly number[]): number {
  let run = 0;
  for (let r = RANKS.length - 1; r >= 0; r--) {
    if (!mine.includes(r)) break;
    run++;
  }
  return run;
}

/**
 * Simulacija izvlačenja aduta: ja vodim najjačim; protivnici nose kad mogu
 * (pobednikov saigrač podbaci), inače obojica podbacuju najniže.
 * Vraća broj mojih adutskih štihova (uključuje dužinu kad protivnicima ponestane).
 */
function trumpTricks(mine: readonly number[]): number {
  const m = [...mine];
  const o = missingRanks(mine);
  let wins = 0;
  while (m.length) {
    if (!o.length) return wins + m.length;
    if (m[m.length - 1] > o[o.length - 1]) {
      wins += 1;
      m.pop();
      o.shift();
      if (o.length) o.shift();
    } else {
      o.pop(); // njihov jači adut nosi
      m.shift(); // ja podbacim najnižu
      if (o.length) o.shift(); // pobednikov saigrač podbaci
    }
  }
  return wins;
}

/**
 * Procena štihova sa adutom `trump` (radi na 10 i 12 karata).
 * Namerno umereno konzervativna — bolji pas nego pad na prvoj karti.
 */
function estimateSuitTricks(cards: readonly Card[], trump: Suit): number {
  const t = suitRanks(cards, trump);
  if (t.length < 4) return 0; // premalo aduta za adutsku igru
  let est = trumpTricks(t);
  const spareTrumps = Math.max(0, t.length - 4);
  for (const s of SUITS) {
    if (s === trump) continue;
    const side = suitRanks(cards, s);
    const run = topRun(side);
    // vrh-niz sa strane; kasniji krugovi se često seku, zato opadajuće težine
    est += [0, 1, 1.75, 2.25][Math.min(run, 3)];
    if (run === 0 && side.includes(rankIndex('K')) && side.length >= 2) est += 0.4; // čuvani kralj
    if (side.length === 0 && spareTrumps > 0)
      est += 0.8; // sečenje na prazno
    else if (side.length === 1 && spareTrumps > 0) est += 0.4; // singl → sečenje od 2. kruga
  }
  return est;
}

/** Sigurni štihovi boje bez aduta: vrh-niz + cela dužina kad protivnicima ponestane. */
function sureNoTrumpTricks(mine: readonly number[]): number {
  if (!mine.length) return 0;
  const run = topRun(mine);
  return 8 - mine.length <= run ? mine.length : run;
}

/**
 * „Curenje" boje u sansu: koliko štihova odbrana uzme u njoj pre nego što je zaustavim.
 * Nosilac sansa NIKAD ne vodi prvi štih (igra se kroz njega), pa boja bez pokrića
 * znači da odbrana istrči svoje karte pre nego što uopšte dođem na potez.
 */
function sansLeak(mine: readonly number[]): number {
  if (!mine.length) return 5; // prazna boja — nezaustavljivo
  if (mine.includes(rankIndex('A'))) return 0;
  const hasK = mine.includes(rankIndex('K'));
  if (hasK && mine.includes(rankIndex('Q'))) return 1;
  if (hasK && mine.length >= 2) return 2;
  if (mine.includes(rankIndex('Q')) && mine.includes(rankIndex('J')) && mine.length >= 3) return 2;
  return 4; // bez stopera
}

interface SansEval {
  sure: number;
  leak: number;
  worstLeak: number;
}

function sansEval(cards: readonly Card[]): SansEval {
  let sure = 0;
  let leak = 0;
  let worstLeak = 0;
  for (const s of SUITS) {
    const mine = suitRanks(cards, s);
    sure += sureNoTrumpTricks(mine);
    const l = sansLeak(mine);
    leak += l;
    worstLeak = Math.max(worstLeak, l);
  }
  return { sure, leak, worstLeak };
}

/** Sans je igriv tek sa ≥6 sigurnih štihova I pokrićem u SVIM bojama. */
function sansViable(cards: readonly Card[], diff: Difficulty): boolean {
  const e = sansEval(cards);
  if (diff === 'easy') return e.sure >= 7 && e.leak <= 2;
  if (diff === 'hard') return e.sure >= 6 && e.leak <= 3 && e.worstLeak <= 2;
  return e.sure >= 6 && e.leak <= 2;
}

/**
 * Betl, jedna boja: realno-pesimistička simulacija — odbrana vodi svoje najniže
 * karte (obojica podbacuju), ja bežim najvišom kartom ispod pobedničke.
 * Vraća broj prinudno odnetih štihova (opasnih karata). Najniža karta iznad 8
 * bez nižeg pokrića po pravilu palca znači opasnost — simulacija to i daje.
 */
function betlSuitDanger(mineIn: readonly number[]): number {
  const m = [...mineIn];
  const o = missingRanks(mineIn);
  let danger = 0;
  while (m.length && o.length) {
    const a = o.shift()!;
    const win = o.length ? Math.max(a, o.shift()!) : a;
    let idx = -1;
    for (let i = m.length - 1; i >= 0; i--) {
      if (m[i] < win) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) m.splice(idx, 1);
    else {
      danger += 1;
      m.pop();
    }
  }
  return danger;
}

/** Ukupan broj opasnih karata za betl (0 = gotovo siguran prolaz). */
function betlDanger(cards: readonly Card[]): number {
  let d = 0;
  for (const s of SUITS) d += betlSuitDanger(suitRanks(cards, s));
  return d;
}

/**
 * Betl pod NAJGOROM podelom: drugi branilac uopšte nema boju, pa me vodeća niska
 * karta hvata sama (kartu po kartu: moja i-ta najniža mora biti ispod njihove i-te).
 * Usamljena 8 ovde broji 1 (pada samo na podelu 7 + prazan saigrač) — zato se
 * koristi kroz kombinovani skor, ne samostalno.
 */
function betlStrictDanger(cards: readonly Card[]): number {
  let danger = 0;
  for (const s of SUITS) {
    const m = suitRanks(cards, s);
    const o = missingRanks(m);
    for (let i = 0; i < m.length && i < o.length; i++) if (m[i] >= o[i]) danger++;
  }
  return danger;
}

/**
 * Kombinovani betl skor: 0 = prolaz i pod lošim podelama; blaga rupa (prinudni
 * štih i uz saradnju podela) nosi 2, rizik od podele nosi 1.
 * Prag palca: usamljena 8 u boji = 1 (ok), usamljena 9 = 3, KJ8 = 3 (loše).
 */
function betlScore(cards: readonly Card[]): number {
  return betlDanger(cards) * 2 + betlStrictDanger(cards);
}

// ── Škart: bira se za KONKRETAN plan igre (betl škarta visoke, adutska igra niske) ──

/** Vrednost ruke za dati plan — koristi se pri izboru škarta (veće = bolje). */
function planValue(cards: readonly Card[], plan: ContractKind): number {
  const rankSum = cards.reduce((acc, c) => acc + rankIndex(c.rank), 0);
  if (plan.kind === 'suit') return estimateSuitTricks(cards, plan.trump) * 1000 + rankSum;
  if (plan.kind === 'betl') return -betlScore(cards) * 1000 - rankSum;
  const e = sansEval(cards);
  return e.sure * 1000 - e.leak * 100 + rankSum;
}

/** Najbolji škart (2 karte) za dati plan — pohlepno: 2× ukloni kartu koja najviše smeta. */
function discardFor(cards12: readonly Card[], plan: ContractKind): [Card, Card] {
  let kept = [...cards12];
  const out: Card[] = [];
  for (let k = 0; k < 2; k++) {
    let bestI = 0;
    let bestV = -Infinity;
    for (let i = 0; i < kept.length; i++) {
      if (plan.kind === 'suit' && kept[i].suit === plan.trump) continue; // adut se ne baca
      const v = planValue(
        kept.filter((_, j) => j !== i),
        plan,
      );
      if (v > bestV) {
        bestV = v;
        bestI = i;
      }
    }
    out.push(kept[bestI]);
    kept = kept.filter((_, j) => j !== bestI);
  }
  return [out[0], out[1]];
}

/** Ruka koja ostaje posle najboljeg škarta za dati plan. */
function keptFor(cards12: readonly Card[], plan: ContractKind): Card[] {
  const [d1, d2] = discardFor(cards12, plan);
  return cards12.filter((c) => c !== d1 && c !== d2);
}

export function chooseAction(s: GameState, seat: Seat, diff: Difficulty = 'medium'): Action {
  switch (s.phase) {
    case 'bidding':
      return chooseBid(s, seat, diff);
    case 'talon':
      return chooseTalon(s, seat);
    case 'following':
      return chooseFollow(s, seat, diff);
    case 'kontra':
      return chooseKontra(s, seat, diff);
    case 'playing':
      return choosePlay(s, seat, diff);
    case 'handScored':
      return { type: 'NEXT_HAND' };
    default:
      throw new Error('[ai] nema poteza u ovoj fazi');
  }
}

/**
 * Do kog nivoa je bot spreman da tera licitaciju (0 = samo „dalje").
 * Nivo pokriva SAMO boje čija je vrednost ≥ nivo, pa je willing = najveća vrednost
 * boje koja realno nosi 6 štihova (betl → 6, sans → 7 po svojim uslovima).
 */
function willingBidLevel(s: GameState, seat: Seat, diff: Difficulty): number {
  const hand = s.hands[seat];
  let willing = 0;

  if (diff === 'easy') {
    // gruba procena: ukupni HCP + bar 4 karte i neka slika u boji koju licitira
    const lens = suitLengths(hand);
    const strong = handStrength(hand) >= 13;
    for (const suit of SUITS) {
      if (strong && lens[suit] >= 4 && (suitHcp(hand, suit) >= 5 || lens[suit] >= 5)) {
        willing = Math.max(willing, SUIT_BID_VALUE[suit]);
      }
    }
    if (betlScore(hand) === 0) willing = Math.max(willing, 6);
    if (sansViable(hand, diff)) willing = Math.max(willing, 7);
    return willing;
  }

  if (diff === 'hard') {
    // hard „viri" u talon: procenjuje TAČNU ruku posle uzimanja talona i škarta
    const h12 = [...hand, ...s.talon];
    for (const suit of SUITS) {
      if (estimateSuitTricks(keptFor(h12, { kind: 'suit', trump: suit }), suit) >= 6) {
        willing = Math.max(willing, SUIT_BID_VALUE[suit]);
      }
    }
    if (betlScore(keptFor(h12, { kind: 'betl' })) === 0) willing = Math.max(willing, 6);
    if (sansViable(keptFor(h12, { kind: 'sans' }), diff)) willing = Math.max(willing, 7);
    return willing;
  }

  // medium: procena na 10 karata; talon u proseku donese malo, zato prag ispod 6
  for (const suit of SUITS) {
    if (estimateSuitTricks(hand, suit) >= 5.4) willing = Math.max(willing, SUIT_BID_VALUE[suit]);
  }
  if (betlScore(hand) <= 2) willing = Math.max(willing, 6); // sitne rupe škart može da zakrpi
  if (sansViable(hand, diff)) willing = Math.max(willing, 7);
  return willing;
}

/** „Igra" (bez talona, +1): sme samo kad je ruka samodovoljna — talon je ne popravlja. */
function desiredIgraLevel(hand: readonly Card[], diff: Difficulty): number {
  if (diff === 'easy') return 0; // easy ne objavljuje „igru"
  const suitMargin = diff === 'hard' ? 6.8 : 7.0;
  let level = 0;
  for (const suit of SUITS) {
    if (estimateSuitTricks(hand, suit) >= suitMargin) level = Math.max(level, SUIT_BID_VALUE[suit]);
  }
  if (betlScore(hand) === 0) level = Math.max(level, 6);
  const e = sansEval(hand);
  if (e.sure >= 6 && e.leak <= 2) level = Math.max(level, 7);
  return level;
}

function chooseBid(s: GameState, seat: Seat, diff: Difficulty): Action {
  const b = s.bidding;
  if (!b) return { type: 'PASS', seat };
  const opts = legalBidOptions(b);
  const willing = willingBidLevel(s, seat, diff);
  const desiredIgra = desiredIgraLevel(s.hands[seat], diff);
  const igra = opts
    .filter((o): o is { type: 'IGRA'; level: BidLevel } => o.type === 'IGRA')
    .filter((o) => o.level <= desiredIgra)
    .sort((a, b) => b.level - a.level)[0];
  if (igra) return { type: 'IGRA', seat, level: igra.level };

  // „moje" samo kad ruka zaista nosi trenutni nivo — bez otimanja licitacije reda radi
  if (opts.some((o) => o.type === 'HOLD') && (b.level ?? 0) <= willing) {
    return { type: 'HOLD', seat };
  }
  const raise = opts.find((o): o is { type: 'RAISE'; level: BidLevel } => o.type === 'RAISE');
  if (raise && raise.level <= willing) return { type: 'RAISE', seat, level: raise.level };
  return { type: 'PASS', seat };
}

/**
 * Izbor igre na 12 karata (pre škarta): najsigurnija koja zadovoljava dostignut nivo.
 * Ista funkcija se zove i pri škartu i pri objavi (DECLARE rekonstruiše 12 karata
 * iz ruke + sopstvenog škarta) — deterministički daje isti plan.
 */
function choosePlan(cards12: readonly Card[], minLevel: number): ContractKind {
  const sansE = sansEval(keptFor(cards12, { kind: 'sans' }));
  const sansOk = sansE.sure >= 6 && sansE.leak <= 3 && sansE.worstLeak <= 2;
  const betlKept = keptFor(cards12, { kind: 'betl' });
  const betlClean = betlScore(betlKept) === 0;

  if (minLevel >= 7) return { kind: 'sans' };
  if (minLevel >= 6) {
    if (betlClean && !(sansOk && sansE.sure >= 7)) return { kind: 'betl' };
    if (sansOk) return { kind: 'sans' };
    return betlDanger(betlKept) <= 1 || sansE.sure < 5 ? { kind: 'betl' } : { kind: 'sans' }; // manje zlo
  }

  let bestTrump: Suit = 'tref';
  let bestEst = -1;
  for (const suit of SUITS) {
    if (SUIT_BID_VALUE[suit] < minLevel) continue;
    const est = estimateSuitTricks(keptFor(cards12, { kind: 'suit', trump: suit }), suit);
    if (est >= bestEst) {
      bestEst = est;
      bestTrump = suit;
    }
  }
  // betl/sans umesto adutske igre samo kad su UBEDLJIVO sigurniji/vredniji
  if (sansOk && sansE.sure >= 7 && bestEst < 7) return { kind: 'sans' };
  if (betlClean && bestEst < 6) return { kind: 'betl' };
  return { kind: 'suit', trump: bestTrump };
}

/** Objava za dobijenu „igru" (bez talona): bira se na postojećih 10 karata. */
function chooseIgraContract(hand: readonly Card[], wonLevel: number): Contract {
  if (wonLevel >= 7) return { kind: 'sans', asGame: true };
  if (wonLevel >= 6) {
    const e = sansEval(hand);
    if (betlScore(hand) === 0 && !(e.sure >= 7 && e.leak <= 2)) return { kind: 'betl', asGame: true };
    if (e.sure >= 6 && e.leak <= 2) return { kind: 'sans', asGame: true };
    return { kind: 'betl', asGame: true };
  }
  let best: Suit = 'tref';
  let bestEst = -1;
  for (const suit of SUITS) {
    if (SUIT_BID_VALUE[suit] < wonLevel) continue;
    const est = estimateSuitTricks(hand, suit);
    if (est >= bestEst) {
      bestEst = est;
      best = suit;
    }
  }
  return { kind: 'suit', trump: best, asGame: true };
}

function chooseTalon(s: GameState, seat: Seat): Action {
  if (s.talonReveal) return { type: 'ACK_TALON', seat };
  // „igra" (bez talona): odmah objavi
  if (s.wonAsIgra) {
    return { type: 'DECLARE', seat, contract: chooseIgraContract(s.hands[seat], s.wonLevel ?? 2) };
  }
  // AI uvek uzme talon (ne najavljuje „igru" iz talon faze u v1)
  if (!s.talonTaken) return { type: 'TAKE_TALON', seat };
  if (s.hands[seat].length === 12) {
    const plan = choosePlan(s.hands[seat], s.wonLevel ?? 2);
    return { type: 'DISCARD', seat, cards: discardFor(s.hands[seat], plan) };
  }
  // objava: isti plan kao pri škartu (12 karata = ruka + sopstveni škart)
  const plan = choosePlan([...s.hands[seat], ...s.discard], s.wonLevel ?? 2);
  return { type: 'DECLARE', seat, contract: { ...plan, asGame: false } };
}

/** Gruba procena broja štihova koje ruka može da odbrani (aduti, asovi, dugi adut). */
function estimateDefTricks(hand: readonly Card[], trump: Suit | null): number {
  let t = 0;
  for (const suit of SUITS) {
    const cs = hand.filter((c) => c.suit === suit);
    if (cs.length === 0) continue;
    const ranks = cs.map((c) => c.rank);
    const isTrump = suit === trump;
    if (ranks.includes('A')) t += isTrump ? 1 : 0.9;
    if (ranks.includes('K')) t += cs.length >= 2 ? (isTrump ? 0.7 : 0.5) : 0.2;
    if (isTrump && ranks.includes('Q') && cs.length >= 3) t += 0.3;
    if (isTrump && cs.length >= 4) t += (cs.length - 3) * 0.4; // dug adut
  }
  return t;
}

function chooseFollow(s: GameState, seat: Seat, diff: Difficulty): Action {
  const trump = s.contract ? trumpOf(s.contract) : null;
  const est = estimateDefTricks(s.hands[seat], trump);
  // jedan branilac treba ~2 štiha; prati samo ako ruka realno može da pomogne (inače „ne dođem")
  const threshold = diff === 'easy' ? 1.2 : diff === 'hard' ? 1.9 : 1.6;
  return { type: 'FOLLOW', seat, value: est >= threshold };
}

function chooseKontra(s: GameState, seat: Seat, diff: Difficulty): Action {
  const canRaise = s.kontra < 4;
  if (!canRaise) return { type: 'PROCEED', seat };

  const isDeclarer = seat === s.declarer;
  if (isDeclarer) {
    // rekontra samo kad finalna ruka (posle škarta) i dalje ubedljivo nosi ugovor
    let confident = false;
    if (s.contract?.kind === 'betl') confident = betlScore(s.hands[seat]) === 0;
    else if (s.contract?.kind === 'sans') confident = sansEval(s.hands[seat]).sure >= (diff === 'hard' ? 6 : 7);
    else if (s.contract) confident = estimateSuitTricks(s.hands[seat], s.contract.trump) >= (diff === 'hard' ? 6.5 : 7);
    if (s.kontra > 0 && confident) return { type: 'KONTRA', seat };
    return { type: 'PROCEED', seat };
  }

  // obavezna kontra na pik: branilac uvek kontrira (inače nosilac badava dobije refe/prolaz)
  if (s.config.mandatoryKontraOnPik && s.contract?.kind === 'suit' && s.contract.trump === 'pik' && s.kontra === 0) {
    return { type: 'KONTRA', seat };
  }

  const trump = s.contract ? trumpOf(s.contract) : null;
  const est = estimateDefTricks(s.hands[seat], trump);
  const defenders = s.declarer === null ? [] : ([right(s.declarer), right(right(s.declarer))] as Seat[]);
  const activeDefenders = defenders.filter((d) => s.following[d]);
  const canInvite =
    s.contract?.kind !== 'betl' &&
    s.kontra === 0 &&
    s.inviteCaller === null &&
    s.following[seat] &&
    activeDefenders.length === 1;

  if (canInvite && est >= (diff === 'hard' ? 1.4 : 1.7)) return { type: 'INVITE', seat };
  if (est >= (diff === 'hard' ? 2.6 : 3.1)) return { type: 'KONTRA', seat };
  return { type: 'PROCEED', seat };
}

// ── Pamćenje karata (medium/hard): šta je već viđeno + „master" karte ──

/** Sve već viđene karte: odigrane u prošlim štihovima + karte u tekućem štihu (sve javno). */
function seenCards(s: GameState): Card[] {
  const out: Card[] = [];
  for (const t of s.tricksLog) for (const pc of t.cards) out.push(pc.card);
  if (s.trick) for (const pc of s.trick.cards) out.push(pc.card);
  return out;
}

/**
 * „Master": u svojoj boji nema nijedne jače karte koja je još nepoznata (sve jače su
 * ili u mojoj ruci ili već odigrane) → siguran štih ako se odigra (sem eventualnog sečenja).
 * Zvučno — radije propusti nego da lažno tvrdi.
 */
function isMaster(card: Card, hand: readonly Card[], seen: readonly Card[]): boolean {
  const ri = rankIndex(card.rank);
  for (const r of RANKS) {
    if (rankIndex(r) <= ri) continue;
    const known =
      hand.some((c) => c.suit === card.suit && c.rank === r) || seen.some((c) => c.suit === card.suit && c.rank === r);
    if (!known) return false; // jača karta još „u igri" kod protivnika
  }
  return true;
}

/** Gornja granica aduta koje protivnici još mogu da drže (0 = sigurno svi izvučeni). */
function outstandingTrumps(hand: readonly Card[], seen: readonly Card[], trump: Suit): number {
  const mine = hand.filter((c) => c.suit === trump).length;
  const gone = seen.filter((c) => c.suit === trump).length;
  return Math.max(0, 8 - mine - gone);
}

function longestSuit(hand: readonly Card[]): Suit {
  const lens = suitLengths(hand);
  let best: Suit = 'tref';
  let bestN = -1;
  for (const s of SUITS) {
    if (lens[s] > bestN) {
      bestN = lens[s];
      best = s;
    }
  }
  return best;
}

/** Karta kojom medium/hard VODI štih: keširaj sigurne štihove → izvuci adute → niska. */
function chooseLead(
  hand: readonly Card[],
  trump: Suit | null,
  isDeclarer: boolean,
  seen: readonly Card[],
  diff: Difficulty,
): Card {
  const byRank = (a: Card, b: Card) => rankIndex(a.rank) - rankIndex(b.rank);
  const asc = [...hand].sort(byRank);

  // 1) keširaj „master" (siguran štih); adutski master ima prvenstvo — ne može se preseći
  const masters = hand.filter((c) => isMaster(c, hand, seen));
  if (masters.length) {
    const trumpMasters = trump ? masters.filter((c) => c.suit === trump) : [];
    const pool = (trumpMasters.length ? trumpMasters : masters).sort(byRank);
    return pool[pool.length - 1];
  }

  // 2) nosilac vadi adute dok ih protivnici imaju (visok adut)
  if (isDeclarer && trump && hand.some((c) => c.suit === trump) && outstandingTrumps(hand, seen, trump) > 0) {
    const trumps = hand.filter((c) => c.suit === trump).sort(byRank);
    return trumps[trumps.length - 1];
  }

  // 3) inače niska karta; medium prosto najnižu u ruci. Hard gradi najdužu boju:
  //    nosilac je forsira ODOZGO (kad ne može da bude presečen) da „očisti" boju; branilac niskom.
  if (diff === 'hard') {
    const inLongest = hand.filter((c) => c.suit === longestSuit(hand)).sort(byRank);
    if (inLongest.length) {
      const safeToEstablish = !trump || outstandingTrumps(hand, seen, trump) === 0;
      if (isDeclarer && safeToEstablish) return inLongest[inLongest.length - 1];
      return inLongest[0];
    }
  }
  return asc[0];
}

function choosePlay(s: GameState, seat: Seat, diff: Difficulty): Action {
  const trick = s.trick;
  if (!trick) throw new Error('[ai] nema štiha');
  const trump = s.contract ? trumpOf(s.contract) : null;
  const asc = legalCards(s.hands[seat], trick.cards, trump, s.config).sort(
    (a, b) => rankIndex(a.rank) - rankIndex(b.rank),
  );
  const low = asc[0];

  // Betl: nosilac beži od štiha (najviša koja gubi), branioci najnižom — isto na svim nivoima
  if (s.contract?.kind === 'betl') {
    const losing = asc.filter((c) => !wouldWinNow(trick.cards, seat, c, trump));
    if (seat === s.declarer) {
      return play(seat, losing.length ? losing[losing.length - 1] : low);
    }
    return play(seat, low);
  }

  const leading = trick.cards.length === 0;

  // EASY: pohlepno, bez pamćenja. Vođenje zavisi od uloge:
  //   nosilac grubo vadi adute (visok adut) — aktivno i pomaže ugovoru; inače niska.
  //   branilac uvek niska — pasivna odbrana, ne hrani nosioca.
  if (diff === 'easy') {
    if (leading) {
      if (seat === s.declarer && trump) {
        const myTrumps = asc.filter((c) => c.suit === trump);
        if (myTrumps.length) return play(seat, myTrumps[myTrumps.length - 1]);
      }
      return play(seat, low);
    }
    const winners = asc.filter((c) => wouldWinNow(trick.cards, seat, c, trump));
    return play(seat, winners.length ? winners[0] : low);
  }

  // MEDIUM / HARD: pamte odigrane karte
  const hand = s.hands[seat];
  const seen = seenCards(s);
  const isDeclarer = seat === s.declarer;

  if (leading) return play(seat, chooseLead(hand, trump, isDeclarer, seen, diff));

  const winners = asc.filter((c) => wouldWinNow(trick.cards, seat, c, trump));
  const currentWinner = trickWinner(trick.cards, trump).seat;

  // Nosilac: uzmi najjeftinijom kad može, inače baci najnižu
  if (isDeclarer) {
    return play(seat, winners.length ? winners[0] : low);
  }

  // Branilac: drugi ne-nosilac je suigrač. Ako suigrač već nosi štih — NE preuzimaj ga.
  const partnerWinning = currentWinner !== s.declarer;
  if (partnerWinning) {
    // hard: u 2. ruci digni „masterom" da zaključa štih (nosilac iza ne može preko)
    if (diff === 'hard' && trick.cards.length === 1) {
      const lock = winners.filter((c) => isMaster(c, hand, seen));
      if (lock.length) return play(seat, lock[0]);
    }
    return play(seat, low);
  }

  // Nosilac trenutno vodi → obij ga najjeftinijom kartom koja nosi, inače baci najnižu.
  // hard: hold-up — ne troši keca/kralja u prvom navođenju boje ako nije poslednji (čuva stoper
  //       da kasnije uhvati nosioca i prekine mu „vezu" sa dugom bojom).
  if (diff === 'hard' && winners.length) {
    const ledSuit = trick.cards[0].card.suit;
    const amLast = trick.cards.length === activeSeatCount(s) - 1;
    const myLenInLed = hand.filter((c) => c.suit === ledSuit).length;
    const ledSeen = seen.filter((c) => c.suit === ledSuit).length;
    const spendsHonor = rankIndex(winners[0].rank) >= rankIndex('K');
    if (!amLast && spendsHonor && myLenInLed >= 2 && ledSeen <= activeSeatCount(s)) {
      return play(seat, low);
    }
  }
  return play(seat, winners.length ? winners[0] : low);
}

function wouldWinNow(trickCards: readonly PlayedCard[], seat: Seat, card: Card, trump: Suit | null): boolean {
  return trickWinner([...trickCards, { seat, card }], trump).seat === seat;
}

function play(seat: Seat, card: Card): Action {
  return { type: 'PLAY', seat, card };
}
