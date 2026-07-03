// Priključivanje partiji preko koda: postojeći igrač → reconnect na svoje mesto;
// slobodno mesto u lobiju → nasumična dodela; pun sto → posmatrač.
import { HttpError, handle, json, waitUntil } from '../_shared/http.ts'
import { adminClient, requireUser } from '../_shared/db.ts'
import {
  cleanName,
  loadGame,
  notify,
  randomInt,
  runAutomation,
  startGame,
  upsertProfileName,
} from '../_shared/game.ts'
import type { JoinGameRequest, JoinGameResponse } from '../_shared/protocol/messages.ts'
import type { Seat } from '../_shared/engine/index.ts'

Deno.serve(
  handle(async (req) => {
    const admin = adminClient()
    const user = await requireUser(req, admin)
    const body = (await req.json()) as JoinGameRequest
    if (!body.code || typeof body.code !== 'string') throw new HttpError(400, 'Nedostaje kod partije')

    let ctx = await loadGame(admin, { code: body.code })
    if (ctx.row.status === 'abandoned') throw new HttpError(410, 'Partija je otkazana')

    const respond = (role: 'player' | 'spectator', seat: Seat | null): Response => {
      const res: JoinGameResponse = {
        gameId: ctx.row.id,
        code: ctx.row.code,
        role,
        seat,
        status: ctx.row.status,
      }
      return json(res)
    }

    // već sedi za stolom → reconnect
    const existing = ctx.players.find((p) => p.user_id === user.id)
    if (existing) return respond('player', existing.seat as Seat)

    if (ctx.row.status !== 'lobby') return respond('spectator', null)

    const displayName = cleanName(body.displayName)
    const humanSeats = ([0, 1, 2] as const).filter((i) => ctx.row.config.seats[i]?.type === 'human')

    // dodela nasumičnog slobodnog mesta uz retry (trka dva istovremena join-a)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const taken = new Set(ctx.players.map((p) => p.seat))
      const free = humanSeats.filter((s) => !taken.has(s))
      if (free.length === 0) return respond('spectator', null)

      const seat = free[randomInt(free.length)]
      const { error } = await admin.from('game_players').insert({
        game_id: ctx.row.id,
        seat,
        user_id: user.id,
        display_name: displayName,
        is_bot: false,
      })
      if (!error) {
        await upsertProfileName(admin, user.id, displayName)
        ctx = await loadGame(admin, { id: ctx.row.id })
        const stillFree = humanSeats.filter((s) => !ctx.players.some((p) => p.seat === s))
        if (stillFree.length === 0) {
          await startGame(ctx)
          waitUntil(runAutomation(admin, ctx.row.id))
        } else {
          await notify(ctx.row.id, { version: ctx.version, status: ctx.row.status, players: true })
        }
        return respond('player', seat)
      }
      if (error.code !== '23505') throw new HttpError(500, error.message)
      // 23505: mesto je upravo zauzeto ili je user već ubačen paralelno — učitaj pa pokušaj opet
      ctx = await loadGame(admin, { id: ctx.row.id })
      const mine = ctx.players.find((p) => p.user_id === user.id)
      if (mine) return respond('player', mine.seat as Seat)
    }
    throw new HttpError(409, 'Nije uspelo zauzimanje mesta — pokušaj ponovo')
  }),
)
