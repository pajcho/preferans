import { describe, it, expect } from 'vitest'
import { createGame, reduce, currentActor, legalActions } from '../reducer'
import { redactStateFor, redactFor } from '../playerView'
import { chooseAction } from '../ai'
import { DEFAULT_CONFIG } from '../types'
import type { Card, GameState, Seat } from '../types'

const cfg = { ...DEFAULT_CONFIG, startingBule: 30, mandatoryKontraOnPik: false }

const isFiller = (c: Card) => c.suit === 'pik' && c.rank === '7'

/**
 * Tuđe ruke moraju biti UNIFORMNO filler (pik 7) — to dokazuje da redigovano
 * stanje ne nosi nikakvu informaciju o skrivenim kartama.
 */
function leaks(real: GameState, redacted: GameState, seat: Seat | null): string[] {
  const found: string[] = []
  for (const other of [0, 1, 2] as Seat[]) {
    if (other === seat) continue
    if (!redacted.hands[other].every(isFiller)) found.push(`hands[${other}] nije filler`)
    if (!redacted.initialHands[other].every(isFiller)) found.push(`initialHands[${other}] nije filler`)
  }
  if (seat !== real.declarer && redacted.discard.length > 0) found.push('discard vidljiv')
  return found
}

function playUntil(s: GameState, phase: GameState['phase'], maxSteps = 200): GameState {
  let state = s
  for (let i = 0; i < maxSteps && state.phase !== phase; i += 1) {
    if (state.phase === 'playing' && state.trick && currentActor(state) === null) {
      state = reduce(state, { type: 'RESOLVE_TRICK' })
      continue
    }
    if (state.phase === 'claim') {
      state = reduce(state, { type: 'FINALIZE_CLAIM' })
      continue
    }
    if (state.phase === 'handScored') {
      state = reduce(state, { type: 'NEXT_HAND' })
      continue
    }
    const actor = currentActor(state)
    if (actor === null) throw new Error(`zaglavljen u fazi ${state.phase}`)
    state = reduce(state, chooseAction(state, actor, 'medium'))
  }
  return state
}

describe('redactStateFor — server redakcija', () => {
  it('krije tuđe ruke, seed i rngState u licitaciji', () => {
    const s = createGame(cfg, 42, 0)
    for (const seat of [0, 1, 2] as Seat[]) {
      const r = redactStateFor(seat, s)
      expect(r.seed).toBe(0)
      expect(r.rngState).toBe(0)
      expect(r.hands[seat]).toEqual(s.hands[seat])
      expect(leaks(s, r, seat)).toEqual([])
      // broj karata sačuvan (za prikaz poleđina)
      expect(r.hands.map((h) => h.length)).toEqual(s.hands.map((h) => h.length))
      // talon skriven u licitaciji
      expect(r.talon).toEqual([])
    }
  })

  it('posmatrač (seat=null) ne vidi nijednu ruku', () => {
    const s = createGame(cfg, 42, 0)
    const r = redactStateFor(null, s)
    expect(leaks(s, r, null)).toEqual([])
    expect(r.hands.map((h) => h.length)).toEqual(s.hands.map((h) => h.length))
  })

  it('legalActions za igrača na potezu su iste na redigovanom stanju', () => {
    let s = createGame(cfg, 7, 0)
    for (let step = 0; step < 60 && s.phase !== 'gameOver'; step += 1) {
      const actor = currentActor(s)
      if (actor === null) {
        s = playUntil(s, s.phase === 'playing' ? 'playing' : s.phase, 1)
        if (currentActor(s) === null && s.phase === 'playing') s = reduce(s, { type: 'RESOLVE_TRICK' })
        if (s.phase === 'claim') s = reduce(s, { type: 'FINALIZE_CLAIM' })
        if (s.phase === 'handScored') break
        continue
      }
      const r = redactStateFor(actor, s)
      expect(legalActions(r)).toEqual(legalActions(s))
      s = reduce(s, chooseAction(s, actor, 'medium'))
    }
  })

  it('redactFor radi nad redigovanim stanjem (handCounts, yourTurn)', () => {
    const s = createGame(cfg, 99, 0)
    const actor = currentActor(s)!
    const r = redactStateFor(actor, s)
    const view = redactFor(actor, r)
    expect(view.handCounts).toEqual([10, 10, 10])
    expect(view.yourTurn).toBe(true)
    expect(view.hand).toEqual(s.hands[actor])
  })

  it('u fazi claim sve ruke su otvorene', () => {
    // traži seed koji dovede do claim faze
    for (let seed = 1; seed < 300; seed += 1) {
      let s = createGame({ ...cfg, autoFinish: true }, seed, 0)
      try {
        s = playUntil(s, 'claim', 300)
      } catch {
        continue
      }
      if (s.phase !== 'claim') continue
      const r = redactStateFor(0, s)
      expect(r.hands).toEqual(s.hands)
      return
    }
    throw new Error('nijedan seed nije dao claim fazu')
  })

  it('u handScored talon i ruke su javni (pregled ruke)', () => {
    let s = createGame(cfg, 3, 0)
    s = playUntil(s, 'handScored', 400)
    expect(s.phase).toBe('handScored')
    const r = redactStateFor(1, s)
    expect(r.talon).toEqual(s.talon)
    expect(r.lastHand).toEqual(s.lastHand)
  })

  it('škart vidi samo nosilac dok ruka traje', () => {
    let s = createGame(cfg, 11, 0)
    s = playUntil(s, 'playing', 300)
    if (s.discard.length === 2 && s.declarer !== null) {
      const declarer = s.declarer
      const other = ((declarer + 1) % 3) as Seat
      expect(redactStateFor(declarer, s).discard).toEqual(s.discard)
      expect(redactStateFor(other, s).discard).toEqual([])
      expect(redactStateFor(null, s).discard).toEqual([])
    }
  })
})
