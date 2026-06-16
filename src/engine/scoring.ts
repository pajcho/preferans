import type { Contract, Seat, Trip } from './types'
import { baseValue } from './contract'

export interface HandOutcome {
  contract: Contract
  declarer: Seat
  /** ko brani (nosilac je uvek "u igri"; betl: oba prate) */
  following: Trip<boolean>
  kontra: number // 0..4
  /** nosilac igra neodigrani refe (duplira sve) */
  refeApplies: boolean
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

  bule[o.declarer] = passed ? -unit : unit

  for (const d of [0, 1, 2] as Seat[]) {
    if (d === o.declarer || !o.following[d]) continue
    if (isBetl) {
      if (!passed) supe[d][o.declarer] = (o.contract.asGame ? 70 : 60) * M
    } else {
      supe[d][o.declarer] = o.tricksWon[d] * B * 2 * M
    }
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
