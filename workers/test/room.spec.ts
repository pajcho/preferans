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

/** Kreira sobu; po defaultu je i startuje (partija više NIKAD ne startuje sama). */
async function createRoom(seats: SeatsConfig, createdBy = 'user-a', start = true) {
  const code = nextCode()
  const stub = env.GAME_ROOM.getByName(code)
  const res = await stub.create({ code, createdBy, displayName: 'Ana', seats, startingBule: 40, maxRefe: 1 })
  if (!res.ok) throw new Error(res.message)
  if (start) {
    const s = await stub.start(createdBy)
    if (!s.ok) throw new Error(s.message)
  }
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
    const res = await stub.create({
      code,
      createdBy: 'user-x',
      displayName: 'X',
      seats: BOTS_2,
      startingBule: 40,
      maxRefe: 1,
    })
    expect(res).toEqual({ ok: false, status: 409, message: 'code-collision' })
  })

  it('create ostaje u lobiju; start (samo kreator) deli karte, INIT u logu', async () => {
    const { stub, created } = await createRoom(BOTS_2, 'user-a', false)
    expect(created.status).toBe('lobby')
    expect((await stub.debugInfo()).meta?.status).toBe('lobby')

    // samo kreator startuje
    expect(await stub.start('user-x')).toMatchObject({ ok: false, status: 403 })

    expect(await stub.start('user-a')).toMatchObject({ ok: true })
    const info = await stub.debugInfo()
    expect(info.meta?.status).toBe('active')
    expect(info.actions[0]?.action.type).toBe('INIT')
    expect(info.meta?.version).toBe(1)

    // drugi start → 409
    expect(await stub.start('user-a')).toMatchObject({ ok: false, status: 409 })
  })

  it('2 čoveka: join popunjava sto BEZ auto-starta; reconnect na isto mesto; pun lobi → čekaonica', async () => {
    const { stub, created } = await createRoom(HUMANS_2, 'user-a', false)
    expect(created.status).toBe('lobby')

    // start pre popune mesta → 409
    expect(await stub.start('user-a')).toMatchObject({ ok: false, status: 409 })

    const join = await stub.join({ userId: 'user-b', displayName: 'Boban' })
    expect(join.ok && join.value.role).toBe('player')
    if (!join.ok) throw new Error('join failed')
    expect(join.value.status).toBe('lobby') // više nema auto-starta

    // reconnect: isti user dobija ISTO mesto, ne novo
    const again = await stub.join({ userId: 'user-b', displayName: 'Boban' })
    expect(again.ok && again.value.seat).toBe(join.value.seat)

    // pun lobi → čekaonica (FIFO pozicije)
    const wait1 = await stub.join({ userId: 'user-c', displayName: 'Ceca' })
    expect(wait1.ok && wait1.value).toMatchObject({ role: 'spectator', waitingPos: 1 })
    const wait2 = await stub.join({ userId: 'user-d', displayName: 'Dara' })
    expect(wait2.ok && wait2.value).toMatchObject({ role: 'spectator', waitingPos: 2 })

    // start posle popune radi; čekaonica se prazni (preostali su posmatrači)
    expect(await stub.start('user-a')).toMatchObject({ ok: true })
    const view = await stub.view('user-c')
    expect(view.ok && view.value.role).toBe('spectator')
    expect(view.ok && view.value.game.waiting).toEqual([])
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

describe('GameRoom: podešavanje lobija (configure) i čekaonica', () => {
  it('samo kreator; toggle igrač↔bot; zauzeto mesto ne može; pravila (bule/refe) se menjaju', async () => {
    const { stub } = await createRoom(HUMANS_2, 'user-a', false)

    expect(await stub.configure('user-x', { maxRefe: 2 })).toMatchObject({ ok: false, status: 403 })

    // pravila
    expect(await stub.configure('user-a', { startingBule: 60, maxRefe: 2 })).toMatchObject({ ok: true })
    const v1 = await stub.view('user-a')
    expect(v1.ok && v1.value.game.startingBule).toBe(60)
    expect(v1.ok && v1.value.game.maxRefe).toBe(2)

    // slobodno (igračko) mesto → bot
    const meta1 = (await stub.debugInfo()).meta!
    const taken = new Set(meta1.players.map((p) => p.seat))
    const freeSeat = ([0, 1, 2] as Seat[]).find((i) => !taken.has(i))!
    expect(
      await stub.configure('user-a', { seat: freeSeat, seatConfig: { type: 'bot', difficulty: 'hard' } }),
    ).toMatchObject({ ok: true })
    const meta2 = (await stub.debugInfo()).meta!
    expect(meta2.seats[freeSeat]).toEqual({ type: 'bot', difficulty: 'hard' })
    expect(meta2.players.find((p) => p.seat === freeSeat)?.isBot).toBe(true)

    // kreatorovo (zauzeto) mesto ne može da se menja
    const creatorSeat = meta2.players.find((p) => p.userId === 'user-a')!.seat
    expect(
      await stub.configure('user-a', { seat: creatorSeat, seatConfig: { type: 'bot', difficulty: 'easy' } }),
    ).toMatchObject({ ok: false, status: 409 })

    // bot mesto nazad na igrača → mesto se oslobađa (bot izlazi iz players)
    expect(await stub.configure('user-a', { seat: freeSeat, seatConfig: { type: 'human' } })).toMatchObject({
      ok: true,
    })
    expect((await stub.debugInfo()).meta!.players.some((p) => p.seat === freeSeat)).toBe(false)
  })

  it('start koristi podešena pravila (state.config), a posle starta configure ne prolazi', async () => {
    const { stub } = await createRoom(BOTS_2, 'user-a', false)
    expect(await stub.configure('user-a', { startingBule: 30, maxRefe: 3 })).toMatchObject({ ok: true })
    expect(await stub.start('user-a')).toMatchObject({ ok: true })

    const state = await internalState(stub)
    expect(state.config.startingBule).toBe(30)
    expect(state.config.maxRefe).toBe(3)
    expect(state.ledger.bule).toEqual([30, 30, 30])

    expect(await stub.configure('user-a', { maxRefe: 1 })).toMatchObject({ ok: false, status: 409 })
  })

  it('leave: izlazak iz čekaonice, ustajanje sa mesta (ne kreator), posle starta 409', async () => {
    const { stub } = await createRoom(HUMANS_2, 'user-a', false)
    await stub.join({ userId: 'user-b', displayName: 'Boban' }) // poslednje igračko mesto
    await stub.join({ userId: 'user-c', displayName: 'Ceca' }) // čekaonica #1
    await stub.join({ userId: 'user-d', displayName: 'Dara' }) // čekaonica #2

    // izlazak iz reda: Ceca odlazi, Dara postaje #1
    expect(await stub.leave('user-c')).toMatchObject({ ok: true })
    expect((await stub.debugInfo()).meta!.waiting.map((w) => w.userId)).toEqual(['user-d'])

    // kreator ne može da napusti sto (ima „Otkaži partiju")
    expect(await stub.leave('user-a')).toMatchObject({ ok: false, status: 403 })

    // igrač ustaje → mesto se oslobađa i ostaje prazno (Dara NIJE povezana → ne seda sama)
    const seatB = (await stub.debugInfo()).meta!.players.find((p) => p.userId === 'user-b')!.seat
    expect(await stub.leave('user-b')).toMatchObject({ ok: true })
    const meta = (await stub.debugInfo()).meta!
    expect(meta.players.some((p) => p.userId === 'user-b')).toBe(false)
    expect(meta.seats[seatB]).toEqual({ type: 'human' })
    expect(meta.waiting.map((w) => w.userId)).toEqual(['user-d'])

    // idempotentno za nekog ko niti čeka niti sedi
    expect(await stub.leave('user-x')).toMatchObject({ ok: true })

    // posle starta nema izlaska
    await stub.join({ userId: 'user-b', displayName: 'Boban' })
    expect(await stub.start('user-a')).toMatchObject({ ok: true })
    expect(await stub.leave('user-b')).toMatchObject({ ok: false, status: 409 })
  })

  it('nepovezan čekač NE seda automatski kad se oslobodi mesto, ali seda kroz ponovni join', async () => {
    const { stub } = await createRoom(HUMANS_2, 'user-a', false)
    await stub.join({ userId: 'user-b', displayName: 'Boban' }) // popunjeno poslednje igračko mesto
    const w = await stub.join({ userId: 'user-c', displayName: 'Ceca' })
    expect(w.ok && w.value.waitingPos).toBe(1)

    // bot mesto → igrač: mesto se oslobađa, ali user-c nema WS konekciju → ostaje u redu
    const botSeat = (await stub.debugInfo()).meta!.players.find((p) => p.isBot)!.seat
    expect(await stub.configure('user-a', { seat: botSeat, seatConfig: { type: 'human' } })).toMatchObject({
      ok: true,
    })
    let meta = (await stub.debugInfo()).meta!
    expect(meta.players.some((p) => p.seat === botSeat)).toBe(false)
    expect(meta.waiting.map((x) => x.userId)).toEqual(['user-c'])

    // ponovni join dok postoji slobodno mesto → seda i izlazi iz čekaonice
    const joined = await stub.join({ userId: 'user-c', displayName: 'Ceca' })
    expect(joined.ok && joined.value).toMatchObject({ role: 'player', seat: botSeat })
    meta = (await stub.debugInfo()).meta!
    expect(meta.waiting).toEqual([])
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
    const { stub } = await createRoom(HUMANS_2, 'user-a', false)
    expect(await stub.cancel('user-b')).toMatchObject({ ok: false, status: 403 })
    expect(await stub.cancel('user-a')).toMatchObject({ ok: true })
    expect(await stub.join({ userId: 'user-b', displayName: 'B' })).toMatchObject({ ok: false, status: 410 })
  })
})
