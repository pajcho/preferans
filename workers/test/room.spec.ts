// GameRoom DO: autorizacija poteza, bot automatika kroz alarme, log poteza, D1 sync.
import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test'
import { describe, expect, it, vi } from 'vitest'
import { chooseAction, currentActor } from '../../src/engine/index.ts'
import type { GameState, Seat } from '../../src/engine/index.ts'
import type { SeatsConfig } from '../../src/protocol/messages.ts'
import type { GameRoom } from '../src/room.ts'

const BOTS_2: SeatsConfig = [
  { type: 'human' },
  { type: 'bot', difficulty: 'easy' },
  { type: 'bot', difficulty: 'easy' },
]
const HUMANS_2: SeatsConfig = [{ type: 'human' }, { type: 'human' }, { type: 'bot', difficulty: 'easy' }]

let codeCounter = 0
function nextCode(): string {
  codeCounter += 1
  return `TEST${String(codeCounter).padStart(2, '0')}`.slice(0, 6)
}

async function createRoom(seats: SeatsConfig, createdBy = 'user-a') {
  const code = nextCode()
  const stub = env.GAME_ROOM.getByName(code)
  const res = await stub.create({ code, createdBy, displayName: 'Ana', seats, startingBule: 40 })
  if (!res.ok) throw new Error(res.message)
  return { code, stub, created: res.value }
}

function internalState(stub: DurableObjectStub<GameRoom>): Promise<GameState> {
  return runInDurableObject(stub, (inst) => {
    const state = (inst as unknown as { state: GameState | null }).state
    if (!state) throw new Error('nema state-a')
    return structuredClone(state)
  })
}

describe('GameRoom: kreiranje i priključivanje', () => {
  it('odbija drugi create na istom kodu (sudar koda)', async () => {
    const { code, stub } = await createRoom(BOTS_2)
    const res = await stub.create({ code, createdBy: 'user-x', displayName: 'X', seats: BOTS_2, startingBule: 40 })
    expect(res).toEqual({ ok: false, status: 409, message: 'code-collision' })
  })

  it('jedini čovek → partija odmah startuje, INIT u logu', async () => {
    const { stub, created } = await createRoom(BOTS_2)
    expect(created.status).toBe('active')
    const info = await stub.debugInfo()
    expect(info.meta?.status).toBe('active')
    expect(info.actions[0]?.action.type).toBe('INIT')
    expect(info.meta?.version).toBe(1)
  })

  it('2 čoveka: lobi → join popunjava sto i startuje; isti user se vraća na svoje mesto; treći je posmatrač', async () => {
    const { stub, created } = await createRoom(HUMANS_2, 'user-a')
    expect(created.status).toBe('lobby')

    const join = await stub.join({ userId: 'user-b', displayName: 'Boban' })
    expect(join.ok && join.value.role).toBe('player')
    if (!join.ok) throw new Error('join failed')
    expect(join.value.status).toBe('active')

    // reconnect: isti user dobija ISTO mesto, ne novo
    const again = await stub.join({ userId: 'user-b', displayName: 'Boban' })
    expect(again.ok && again.ok && again.value.seat).toBe(join.value.seat)

    // pun sto → posmatrač
    const spec = await stub.join({ userId: 'user-c', displayName: 'Ceca' })
    expect(spec.ok && spec.value.role).toBe('spectator')
  })

  it('view redakcija: igrač vidi samo svoju ruku, posmatrač nijednu', async () => {
    const { stub, created } = await createRoom(BOTS_2, 'user-a')
    const view = await stub.view('user-a')
    if (!view.ok) throw new Error(view.message)
    const state = view.value.state!
    const mySeat = created.seat
    const isFiller = (c: { suit: string; rank: string }) => c.suit === 'pik' && c.rank === '7'
    expect(state.hands[mySeat]).toHaveLength(10)
    expect(state.hands[mySeat].every(isFiller)).toBe(false) // svoja ruka je prava
    for (const seat of [0, 1, 2] as Seat[]) {
      if (seat === mySeat) continue
      expect(state.hands[seat]).toHaveLength(10)
      expect(state.hands[seat].every(isFiller)).toBe(true) // tuđe su filler
    }

    const specView = await stub.view('stranac')
    if (!specView.ok) throw new Error(specView.message)
    expect(specView.value.role).toBe('spectator')
    expect(specView.value.state!.hands.flat().every(isFiller)).toBe(true)
    expect(specView.value.state!.seed).toBe(0) // seed se ne otkriva
  })
})

describe('GameRoom: autorizacija poteza', () => {
  it('stranac ne može da igra; server-only potezi odbijeni; tuđe mesto odbijeno', async () => {
    const { stub, created } = await createRoom(BOTS_2, 'user-a')
    const mySeat = created.seat

    const stranger = await stub.act('stranac', { type: 'PASS', seat: mySeat })
    expect(stranger).toMatchObject({ ok: false, status: 403 })

    const serverOnly = await stub.act('user-a', { type: 'RESOLVE_TRICK' })
    expect(serverOnly).toMatchObject({ ok: false, status: 403, message: 'Ovaj potez primenjuje server' })

    const finalize = await stub.act('user-a', { type: 'FINALIZE_CLAIM' })
    expect(finalize).toMatchObject({ ok: false, status: 403 })

    const otherSeat = ((mySeat + 1) % 3) as Seat
    const foreign = await stub.act('user-a', { type: 'PASS', seat: otherSeat })
    expect(foreign).toMatchObject({ ok: false, status: 403, message: 'Ne možeš da igraš tuđ potez' })
  })

  it('nelegalan potez pada u engine-u (400), legalan menja verziju', async () => {
    const { stub, created } = await createRoom(BOTS_2, 'user-a')
    const mySeat = created.seat
    const state = await internalState(stub)

    if (currentActor(state) !== mySeat) {
      // bot je prvi na potezu — sačekaj automatiku (alarm) dok ne dođe red na čoveka
      for (let i = 0; i < 40 && currentActor(await internalState(stub)) !== mySeat; i += 1) {
        await runDurableObjectAlarm(stub)
      }
    }
    // PLAY u fazi licitacije je nelegalan
    const bad = await stub.act('user-a', { type: 'PLAY', seat: mySeat, card: { suit: 'pik', rank: '7' } })
    expect(bad).toMatchObject({ ok: false, status: 400 })

    const before = (await stub.debugInfo()).meta!.version
    const good = await stub.act('user-a', chooseAction(await internalState(stub), mySeat, 'medium'))
    expect(good).toMatchObject({ ok: true })
    expect((await stub.debugInfo()).meta!.version).toBe(before + 1)
  })
})

describe('GameRoom: bot automatika (alarmi) igra celu ruku', () => {
  it('cela ruka se odigra; log je kompletan i konzistentan; D1 meta prati stanje', async () => {
    const { code, stub, created } = await createRoom(BOTS_2, 'user-a')
    const mySeat = created.seat

    /** Teraj automatiku do kraja ruke; kad alarm stane, na potezu je čovek. */
    const driveHand = async (): Promise<void> => {
      for (let i = 0; i < 600; i += 1) {
        const ran = await runDurableObjectAlarm(stub)
        if (ran) continue
        const info = await stub.debugInfo()
        const phase = info.meta!.phase
        if (phase === 'handScored' || phase === 'gameOver') return
        const state = await internalState(stub)
        const actor = currentActor(state)
        expect(actor).toBe(mySeat) // automatika sme da stane samo na čoveku
        const res = await stub.act('user-a', chooseAction(state, mySeat, 'medium'))
        expect(res.ok).toBe(true)
      }
      throw new Error('ruka nije obodovana u 600 koraka')
    }

    // ruka legalno može da prođe BEZ ijednog PLAY (svi „dalje", ili trenutni claim
    // posle objave) — igraj ruke dok se prva stvarno ne odigra
    let playSeen = false
    for (let hand = 0; hand < 8 && !playSeen; hand += 1) {
      await driveHand()
      const info = await stub.debugInfo()
      playSeen = info.actions.some((a) => a.action.type === 'PLAY')
      if (!playSeen && info.meta!.phase === 'handScored') {
        const res = await stub.act('user-a', { type: 'NEXT_HAND' })
        expect(res.ok).toBe(true)
      } else if (!playSeen) {
        break // gameOver bez PLAY — praktično nemoguće, pušta assert dole da padne
      }
    }
    expect(playSeen).toBe(true)

    // log poteza: INIT pa neprekinut niz seq-ova do tekuće verzije
    const info = await stub.debugInfo()
    expect(info.actions[0]?.action.type).toBe('INIT')
    expect(info.actions.map((a) => a.seq)).toEqual(info.actions.map((_, i) => i + 1))
    expect(info.actions.at(-1)?.seq).toBe(info.meta!.version)

    // NEXT_HAND sme bilo koji igrač → nova ruka
    if (info.meta!.phase === 'handScored') {
      const before = info.meta!.handNo
      const res = await stub.act('user-a', { type: 'NEXT_HAND' })
      expect(res.ok).toBe(true)
      expect((await stub.debugInfo()).meta!.handNo).toBe(before + 1)
    }

    // D1 meta konzistentan sa DO stanjem (sync je asinhron — poll)
    await vi.waitFor(
      async () => {
        const row = await env.DB.prepare('SELECT status, version, hand_no FROM games WHERE code = ?')
          .bind(code)
          .first<{ status: string; version: number; hand_no: number }>()
        const meta = (await stub.debugInfo()).meta!
        expect(row?.status).toBe(meta.status)
        expect(row?.version).toBe(meta.version)
        expect(row?.hand_no).toBe(meta.handNo)
      },
      { timeout: 5000 },
    )
    const players = await env.DB.prepare('SELECT COUNT(*) AS n FROM game_players WHERE code = ?')
      .bind(code)
      .first<{ n: number }>()
    expect(players?.n).toBe(3)
  }, 60_000)
})

describe('GameRoom: otkazivanje', () => {
  it('samo kreator otkazuje; posle otkaza join vraća 410', async () => {
    const { stub } = await createRoom(HUMANS_2, 'user-a')
    expect(await stub.cancel('user-b')).toMatchObject({ ok: false, status: 403 })
    expect(await stub.cancel('user-a')).toMatchObject({ ok: true })
    expect(await stub.join({ userId: 'user-b', displayName: 'B' })).toMatchObject({ ok: false, status: 410 })
  })
})
