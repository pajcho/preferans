// Otkazivanje partije — sme samo kreator; lobby ili active → abandoned.
import { HttpError, handle, json } from '../_shared/http.ts'
import { adminClient, requireUser } from '../_shared/db.ts'
import { loadGame, notify } from '../_shared/game.ts'
import type { CancelGameRequest } from '../_shared/protocol/messages.ts'

Deno.serve(
  handle(async (req) => {
    const admin = adminClient()
    const user = await requireUser(req, admin)
    const body = (await req.json()) as CancelGameRequest
    if (!body.gameId) throw new HttpError(400, 'Nedostaje gameId')

    const ctx = await loadGame(admin, { id: body.gameId })
    if (ctx.row.created_by !== user.id) throw new HttpError(403, 'Samo kreator može da otkaže partiju')
    if (ctx.row.status === 'finished') throw new HttpError(409, 'Partija je već završena')

    const { error } = await admin.from('games').update({ status: 'abandoned' }).eq('id', ctx.row.id)
    if (error) throw new HttpError(500, error.message)

    await notify(ctx.row.id, { version: ctx.version, status: 'abandoned' })
    return json({ ok: true })
  }),
)
