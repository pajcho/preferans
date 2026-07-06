// Odigra PRAVU partiju protiv lokalnog backenda (wrangler dev na :8787):
// anoniman identitet → kreiraj sto sa 2 bota → igraj nasumične legalne poteze
// preko WebSocket-a dok partija ne bude finished. Rezultat: partija sa punim
// logom poteza u DO storage-u — za demo admin drill-downa.
//
// Pokretanje (uz pokrenut `pnpm cf:dev`):  pnpm cf:demo-game
import { currentActor, legalActions } from '../../src/engine/index.ts'

const BASE = process.env.PREFA_API ?? 'http://localhost:8787'
const NAME = process.env.PREFA_NAME ?? 'Nikola'
const TIMEOUT_MS = 12 * 60_000

/** Legalan potez za moje sedište (rukuje i slučajevima van legalActions liste). */
function chooseFor(state, seat) {
  if (state.phase === 'handScored') return { type: 'NEXT_HAND' } // bilo ko sme da nastavi
  if (state.phase === 'claim') return null // finalizuje server (alarm)
  // u licitaciji uvek „dalje", u kontri „može" — botovi nose igre pa partija brzo konvergira
  // (padovi VRAĆAJU bule, potpuno nasumična igra ume dugo da ne završi partiju)
  if (state.phase === 'bidding') return { type: 'PASS', seat }
  if (state.phase === 'kontra') return { type: 'PROCEED', seat }
  // DISCARD parove legalActions ne nabraja — biramo 2 nasumične karte iz ruke od 12
  if (state.phase === 'talon' && state.talonTaken && !state.talonReveal && state.hands[seat].length === 12) {
    const hand = state.hands[seat]
    const i = Math.floor(Math.random() * hand.length)
    let j = Math.floor(Math.random() * (hand.length - 1))
    if (j >= i) j += 1
    return { type: 'DISCARD', seat, cards: [hand[i], hand[j]] }
  }
  const options = legalActions(state)
  if (options.length === 0) return null
  return options[Math.floor(Math.random() * options.length)]
}

async function main() {
  const anonRes = await fetch(`${BASE}/api/auth/anon`, { method: 'POST' })
  if (!anonRes.ok) throw new Error(`auth ${anonRes.status} — da li je pokrenut pnpm cf:dev?`)
  const { token } = await anonRes.json()

  const createRes = await fetch(`${BASE}/api/games`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: NAME,
      seats: [{ type: 'human' }, { type: 'bot', difficulty: 'medium' }, { type: 'bot', difficulty: 'hard' }],
      startingBule: 10, // kratka partija — brže do "finished"
    }),
  })
  if (!createRes.ok) throw new Error(`create ${createRes.status}: ${await createRes.text()}`)
  const { code, seat } = await createRes.json()
  console.log(`[demo] partija ${code}, moje sedište ${seat} — igram...`)

  const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/api/games/${code}/ws?token=${encodeURIComponent(token)}`)
  let lastActedVersion = 0
  let reqSeq = 0

  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('demo partija nije završena u roku')), TIMEOUT_MS)

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.type === 'error') console.error('[demo] server:', msg.message)
      if (msg.type !== 'view') return
      const { game, state } = msg.view

      if (game.status === 'finished') {
        clearTimeout(timer)
        console.log(`[demo] završena posle ${game.handNo} ruku, ${game.version} poteza ✔`)
        resolve(code)
        return
      }
      if (!state || game.version <= lastActedVersion) return
      const actor = currentActor(state)
      const myTurn = actor === seat || (actor === null && state.phase === 'handScored')
      if (!myTurn) return

      const action = chooseFor(state, seat)
      if (!action) return
      if (action.type === 'NEXT_HAND') console.log(`[demo] ruka ${state.handNo} obodovana (verzija ${game.version})`)
      lastActedVersion = game.version
      reqSeq += 1
      ws.send(JSON.stringify({ type: 'act', reqId: `demo-${reqSeq}`, action }))
    }
    ws.onerror = (e) => reject(new Error(`WebSocket greška: ${e.message ?? e}`))
    ws.onclose = () => reject(new Error('WebSocket zatvoren pre kraja partije'))
  })

  const finishedCode = await done
  ws.onclose = null
  ws.close()
  console.log(`[demo] drill-down: http://localhost:5173/admin/g/${finishedCode}`)
}

main().catch((e) => {
  console.error('[demo]', e.message)
  process.exit(1)
})
