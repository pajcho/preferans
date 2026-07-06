// Generiše SQL sa dummy podacima za LOKALNI admin dashboard (pnpm cf:seed).
// Kodovi seed partija počinju sa "ZZ", useri sa "seed-" — ponovni seed prvo briše stare.
// Ovo su samo D1 metapodaci (bez DO storage-a) — za pravi log poteza vidi play-demo-game.mjs.

const now = Date.now()
const DAY = 86_400_000
const MIN = 60_000

// mali deterministički RNG da seed bude stabilan između pokretanja
let rngState = 20260706
function rnd() {
  rngState = (rngState * 1664525 + 1013904223) % 4294967296
  return rngState / 4294967296
}
const ri = (n) => Math.floor(rnd() * n)
const pick = (arr) => arr[ri(arr.length)]
const iso = (t) => new Date(t).toISOString()
const q = (s) => (s === null || s === undefined ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`)

const PLAYERS = [
  { name: 'Nikola', country: 'RS', city: 'Beograd' },
  { name: 'Marko', country: 'RS', city: 'Novi Sad' },
  { name: 'Jelena', country: 'RS', city: 'Niš' },
  { name: 'Milica', country: 'RS', city: 'Beograd' },
  { name: 'Stefan', country: 'BA', city: 'Banja Luka' },
  { name: 'Ivana', country: 'HR', city: 'Zagreb' },
  { name: 'Petar', country: 'ME', city: 'Podgorica' },
  { name: 'Ana', country: 'DE', city: 'München' },
  { name: 'Vlada', country: 'AT', city: 'Wien' },
  { name: 'Zoran', country: 'CH', city: 'Zürich' },
  { name: 'Katarina', country: 'US', city: 'Chicago' },
  { name: 'Dragan', country: 'CA', city: 'Toronto' },
].map((p, i) => ({ ...p, userId: `seed-${String(i + 1).padStart(4, '0')}-user` }))

const BOT_NAMES = ['Pera', 'Laza', 'Mika']
const CONTRACTS = ['pik', 'pik', 'pik', 'pik', 'karo', 'karo', 'karo', 'herc', 'herc', 'tref', 'betl', 'sans']
const KONTRAS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 3]

let codeSeq = 0
function nextCode() {
  codeSeq += 1
  return `ZZ${String(codeSeq).padStart(4, '0')}`
}

const out = []
out.push('-- Generisano: workers/seed/generate-seed.mjs (pnpm cf:seed) — NE menjati ručno.')
out.push("DELETE FROM hands WHERE code LIKE 'ZZ%';")
out.push("DELETE FROM game_players WHERE code LIKE 'ZZ%';")
out.push("DELETE FROM games WHERE code LIKE 'ZZ%';")
out.push("DELETE FROM players WHERE user_id LIKE 'seed-%';")

const lastSeen = new Map()
const firstSeen = new Map()

function makeGame({ status, createdAt, humans, handCount, phase, handNo }) {
  const code = nextCode()
  const startedAt = status === 'lobby' ? null : createdAt + 2 * MIN
  const durationMin = 20 + ri(50)
  const finishedAt =
    status === 'finished' || status === 'abandoned' ? createdAt + 2 * MIN + durationMin * MIN : null
  const updatedAt = finishedAt ?? (status === 'lobby' ? createdAt : now - ri(3) * MIN)

  // raspored: humans na nasumična sedišta, ostalo botovi
  const seats = [0, 1, 2]
  const humanSeats = []
  for (const _ of humans) humanSeats.push(seats.splice(ri(seats.length), 1)[0])

  const seatCfg = [0, 1, 2].map((s) =>
    humanSeats.includes(s) ? { type: 'human' } : { type: 'bot', difficulty: pick(['easy', 'medium', 'hard']) },
  )

  const scores =
    status === 'finished'
      ? (() => {
          const a = (ri(13) - 6) * 4
          const b = (ri(13) - 6) * 4
          return [a, b, -(a + b)]
        })()
      : null

  const creator = humans[0]
  for (const h of humans) {
    firstSeen.set(h.userId, Math.min(firstSeen.get(h.userId) ?? Infinity, createdAt))
    lastSeen.set(h.userId, Math.max(lastSeen.get(h.userId) ?? 0, updatedAt))
  }

  out.push(
    `INSERT INTO games (code, status, created_by, starting_bule, seats, phase, hand_no, current_actor, version, summary, created_at, started_at, finished_at, updated_at) VALUES (` +
      [
        q(code),
        q(status),
        q(creator.userId),
        40,
        q(JSON.stringify(seatCfg)),
        q(phase ?? null),
        handNo ?? (status === 'finished' ? handCount : 0),
        status === 'active' ? ri(3) : 'NULL',
        status === 'lobby' ? 0 : 20 + handCount * (20 + ri(15)),
        scores ? q(JSON.stringify({ scores })) : 'NULL',
        q(iso(createdAt)),
        startedAt ? q(iso(startedAt)) : 'NULL',
        finishedAt ? q(iso(finishedAt)) : 'NULL',
        q(iso(updatedAt)),
      ].join(', ') +
      ');',
  )

  const bySeat = new Map()
  ;[0, 1, 2].forEach((s) => {
    const humanIdx = humanSeats.indexOf(s)
    if (humanIdx >= 0) {
      const h = humans[humanIdx]
      bySeat.set(s, h)
      out.push(
        `INSERT INTO game_players (code, seat, user_id, display_name, is_bot, bot_difficulty) VALUES (${q(code)}, ${s}, ${q(h.userId)}, ${q(h.name)}, 0, NULL);`,
      )
    } else if (status !== 'lobby' || rnd() < 0.7) {
      // u lobiju bot mesta postoje odmah, human mesta čekaju
      const cfg = seatCfg[s]
      if (cfg.type === 'bot') {
        bySeat.set(s, { name: BOT_NAMES[s], userId: null })
        out.push(
          `INSERT INTO game_players (code, seat, user_id, display_name, is_bot, bot_difficulty) VALUES (${q(code)}, ${s}, NULL, ${q(BOT_NAMES[s])}, 1, ${q(cfg.difficulty)});`,
        )
      }
    }
  })

  // obodovane ruke (samo za partije koje su stvarno igrane)
  const playedHands = status === 'finished' ? handCount : status === 'active' ? (handNo ?? 1) - 1 : 0
  for (let h = 1; h <= playedHands; h += 1) {
    const declarerSeat = ri(3)
    const d = bySeat.get(declarerSeat) ?? { name: BOT_NAMES[declarerSeat], userId: null }
    const contract = pick(CONTRACTS)
    const asIgra = rnd() < 0.08 ? 1 : 0
    const kontra = pick(KONTRAS)
    const passed = rnd() < 0.22 ? 1 : 0
    const playedAt = (startedAt ?? createdAt) + Math.round(((finishedAt ?? updatedAt) - (startedAt ?? createdAt)) * (h / (playedHands + 1)))
    out.push(
      `INSERT INTO hands (code, hand_no, declarer_seat, declarer_name, declarer_user_id, contract, as_igra, kontra, passed, played_at) VALUES (` +
        [q(code), h, declarerSeat, q(d.name), q(d.userId), q(contract), asIgra, kontra, passed, q(iso(playedAt))].join(', ') +
        ');',
    )
  }
}

// ── raspored partija: 30 dana istorije, gušće poslednjih dana ──

for (let day = 29; day >= 1; day -= 1) {
  const weight = day > 14 ? 1 : day > 5 ? 2 : 3
  const games = weight + ri(2)
  for (let g = 0; g < games; g += 1) {
    const createdAt = now - day * DAY + (8 + ri(14)) * 60 * MIN
    const humanCount = 1 + (rnd() < 0.45 ? 1 : 0) + (rnd() < 0.2 ? 1 : 0)
    const humans = []
    while (humans.length < humanCount) {
      const p = pick(PLAYERS)
      if (!humans.includes(p)) humans.push(p)
    }
    const roll = rnd()
    const status = roll < 0.82 ? 'finished' : 'abandoned'
    makeGame({ status, createdAt, humans, handCount: 3 + ri(8) })
  }
}

// danas: par završenih + aktivne + lobi (da „Aktivne sada" ima šta da pokaže)
makeGame({ status: 'finished', createdAt: now - 5 * 60 * MIN, humans: [PLAYERS[0], PLAYERS[1]], handCount: 6 })
makeGame({ status: 'finished', createdAt: now - 3 * 60 * MIN, humans: [PLAYERS[2]], handCount: 4 })
makeGame({ status: 'active', createdAt: now - 42 * MIN, humans: [PLAYERS[0], PLAYERS[4]], handCount: 0, phase: 'playing', handNo: 3 })
makeGame({ status: 'active', createdAt: now - 18 * MIN, humans: [PLAYERS[7]], handCount: 0, phase: 'bidding', handNo: 2 })
makeGame({ status: 'active', createdAt: now - 7 * MIN, humans: [PLAYERS[5], PLAYERS[6], PLAYERS[9]], handCount: 0, phase: 'playing', handNo: 1 })
makeGame({ status: 'lobby', createdAt: now - 4 * MIN, humans: [PLAYERS[10]], handCount: 0 })

// ── profil igrača ──

for (const p of PLAYERS) {
  const first = firstSeen.get(p.userId) ?? now - ri(20) * DAY
  const last = lastSeen.get(p.userId) ?? first
  out.push(
    `INSERT INTO players (user_id, display_name, country, city, first_seen, last_seen) VALUES (` +
      [q(p.userId), q(p.name), q(p.country), q(p.city), q(iso(first)), q(iso(last))].join(', ') +
      ');',
  )
}

console.log(out.join('\n'))
