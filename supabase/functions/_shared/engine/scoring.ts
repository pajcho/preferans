import type { Contract, Seat, Trip } from './types.ts'
import { baseValue } from './contract.ts'

export interface HandOutcome {
  contract: Contract
  declarer: Seat
  /** ko brani (nosilac je uvek "u igri"; betl: oba prate) */
  following: Trip<boolean>
  /** pratilac koji je pozvao nepratioca; pozvani samo pomaže */
  inviteCaller: Seat | null
  kontra: number // 0..4
  /** pratilac koji nosi odgovornost za kontru/subkontru */
  kontraBy: Seat | null
  /** nosilac igra neodigrani refe (duplira sve) */
  refeApplies: boolean
  /** cap obračuna supa odbrane na 5 štihova */
  supaCap5: boolean
  tricksWon: Trip<number>
}

export interface LedgerDelta {
  bule: Trip<number>
  /** supe[from][against] */
  supe: Trip<Trip<number>>
}

function zeroSupe(): Trip<Trip<number>> {
  return [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
}

const SEATS = [0, 1, 2] as Seat[]

function defendersOf(o: Pick<HandOutcome, 'declarer' | 'following'>): Seat[] {
  return SEATS.filter((seat) => seat !== o.declarer && o.following[seat])
}

function cappedTeamTricks(tricks: number, cap: boolean): number {
  return cap ? Math.min(tricks, 5) : tricks
}

function cappedIndividualTricks(o: HandOutcome, defenders: readonly Seat[]): Trip<number> {
  const out: Trip<number> = [0, 0, 0]
  const total = defenders.reduce<number>((sum, seat) => sum + o.tricksWon[seat], 0)
  if (!o.supaCap5 || total <= 5) {
    for (const seat of defenders) out[seat] = o.tricksWon[seat]
    return out
  }

  let remaining = 5
  const byTricksDesc = defenders.slice().sort((a, b) => o.tricksWon[b] - o.tricksWon[a] || a - b)
  for (const seat of byTricksDesc) {
    const n = Math.min(o.tricksWon[seat], remaining)
    out[seat] = n
    remaining -= n
  }
  return out
}

/**
 * Bodovanje jedne odigrane ruke (docs/RULES.md §9–10).
 *   prolaz = −(B×2)·M,  pad = +(B×2)·M,  supa = štihovi×B×2·M
 *   betl pad = 60 (igra-betl 70) po pratiocu;  M = 2^kontra × (refe ? 2 : 1)
 */
export function scoreHand(o: HandOutcome): LedgerDelta {
  const B = baseValue(o.contract) + (o.contract.asGame ? 1 : 0)
  const M = 2 ** o.kontra * (o.refeApplies ? 2 : 1)
  const unit = B * 2 * M

  const bule: Trip<number> = [0, 0, 0]
  const supe = zeroSupe()

  const isBetl = o.contract.kind === 'betl'
  const declarerTricks = o.tricksWon[o.declarer]
  const passed = isBetl ? declarerTricks === 0 : declarerTricks >= 6
  const defenders = defendersOf(o)
  const defenderTricks = defenders.reduce<number>((sum, seat) => sum + o.tricksWon[seat], 0)

  bule[o.declarer] = passed ? -unit : unit

  if (isBetl) {
    if (o.kontraBy !== null && passed) {
      bule[o.kontraBy] = unit
    }
    if (!passed) {
      if (o.kontraBy !== null) {
        supe[o.kontraBy][o.declarer] = (o.contract.asGame ? 70 : 60) * M
      } else {
        for (const d of defenders) supe[d][o.declarer] = (o.contract.asGame ? 70 : 60) * M
      }
    }
    return { bule, supe }
  }

  if (o.kontraBy !== null) {
    if (defenderTricks < 5) bule[o.kontraBy] = unit
    supe[o.kontraBy][o.declarer] = cappedTeamTricks(defenderTricks, o.supaCap5) * B * 2 * M
    return { bule, supe }
  }

  if (o.inviteCaller !== null) {
    if (defenderTricks < 4) bule[o.inviteCaller] = unit
    supe[o.inviteCaller][o.declarer] = cappedTeamTricks(defenderTricks, o.supaCap5) * B * 2 * M
    return { bule, supe }
  }

  const scoreableTricks = cappedIndividualTricks(o, defenders)
  for (const d of defenders) {
    if (o.tricksWon[d] < 2) bule[d] = unit
    supe[d][o.declarer] = scoreableTricks[d] * B * 2 * M
  }

  return { bule, supe }
}

/**
 * Konačan rezultat igrača (docs/RULES.md §11). Ispod nule = bolje.
 *   Rezultat = −(tvoje supe protiv drugih) + (supe protiv tebe) + bule×10
 */
export function finalScore(bule: number, supaFor: number, supaAgainst: number): number {
  return -supaFor + supaAgainst + bule * 10
}
