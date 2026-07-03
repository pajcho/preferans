// Kreira partiju: games red (kod), game_players (kreator + botovi).
// Ako je kreator jedini čovek → partija odmah startuje (deljenje + bot automatika).
import { HttpError, handle, json, waitUntil } from '../_shared/http.ts'
import { adminClient, requireUser } from '../_shared/db.ts'
import {
  cleanName,
  generateCode,
  loadGame,
  randomInt,
  runAutomation,
  startGame,
  upsertProfileName,
} from '../_shared/game.ts'
import type { CreateGameRequest, CreateGameResponse, SeatsConfig } from '../_shared/protocol/messages.ts'

const DIFFICULTIES = new Set(['easy', 'medium', 'hard'])

function validateSeats(raw: unknown): SeatsConfig {
  if (!Array.isArray(raw) || raw.length !== 3) throw new HttpError(400, 'Konfiguracija mora imati tačno 3 mesta')
  const seats = raw.map((s) => {
    if (s && s.type === 'human') return { type: 'human' as const }
    if (s && s.type === 'bot' && DIFFICULTIES.has(s.difficulty)) {
      return { type: 'bot' as const, difficulty: s.difficulty }
    }
    throw new HttpError(400, 'Svako mesto je "human" ili "bot" (easy/medium/hard)')
  })
  if (!seats.some((s) => s.type === 'human')) throw new HttpError(400, 'Bar jedno mesto mora biti za tebe')
  return seats as SeatsConfig
}

Deno.serve(
  handle(async (req) => {
    const admin = adminClient()
    const user = await requireUser(req, admin)
    const body = (await req.json()) as CreateGameRequest

    const displayName = cleanName(body.displayName)
    const seats = validateSeats(body.seats)
    const startingBule = Number.isInteger(body.startingBule) && body.startingBule! >= 10 && body.startingBule! <= 200
      ? body.startingBule!
      : 40

    await upsertProfileName(admin, user.id, displayName)

    // insert sa retry-jem na (malo verovatan) sudar koda
    let gameId: string | null = null
    let code = ''
    for (let attempt = 0; attempt < 5 && !gameId; attempt += 1) {
      code = generateCode()
      const { data, error } = await admin
        .from('games')
        .insert({ code, status: 'lobby', created_by: user.id, config: { startingBule, seats } })
        .select('id')
        .single()
      if (data) gameId = data.id
      else if (error && error.code !== '23505') throw new HttpError(500, error.message)
    }
    if (!gameId) throw new HttpError(500, 'Neuspešno generisanje koda partije')

    // kreator seda na nasumično "human" mesto; botovi na svoja
    const humanSeats = ([0, 1, 2] as const).filter((i) => seats[i].type === 'human')
    const creatorSeat = humanSeats[randomInt(humanSeats.length)]

    const rows = [
      { game_id: gameId, seat: creatorSeat, user_id: user.id, display_name: displayName, is_bot: false },
      ...([0, 1, 2] as const)
        .filter((i) => seats[i].type === 'bot')
        .map((i) => ({
          game_id: gameId,
          seat: i,
          user_id: null,
          display_name: ['Pera', 'Laza', 'Mika'][i],
          is_bot: true,
          bot_difficulty: (seats[i] as { type: 'bot'; difficulty: string }).difficulty,
        })),
    ]
    const { error: pErr } = await admin.from('game_players').insert(rows)
    if (pErr) throw new HttpError(500, pErr.message)

    // jedini čovek? — odmah start
    const ctx = await loadGame(admin, { id: gameId })
    if (humanSeats.length === 1) {
      await startGame(ctx)
      waitUntil(runAutomation(admin, gameId))
    }

    const res: CreateGameResponse = { gameId, code, seat: creatorSeat, status: ctx.row.status }
    return json(res)
  }),
)
