// Primena poteza igrača: autorizacija po mestu, validacija kroz engine reduce,
// pa bot/sistem automatika u pozadini. Vraća svež redigovan pogled.
import { HttpError, handle, json, waitUntil } from '../_shared/http.ts'
import { adminClient, requireUser } from '../_shared/db.ts'
import { applyAction, buildView, loadGame, runAutomation } from '../_shared/game.ts'
import type { ActRequest } from '../_shared/protocol/messages.ts'
import type { Action, Seat } from '../_shared/engine/index.ts'

Deno.serve(
  handle(async (req) => {
    const admin = adminClient()
    const user = await requireUser(req, admin)
    const body = (await req.json()) as ActRequest
    if (!body.gameId || !body.action || typeof body.action.type !== 'string') {
      throw new HttpError(400, 'Nedostaje gameId ili action')
    }

    const ctx = await loadGame(admin, { id: body.gameId })
    const me = ctx.players.find((p) => p.user_id === user.id)
    if (!me) throw new HttpError(403, 'Ne sediš za ovim stolom')
    const mySeat = me.seat as Seat

    // autorizacija po tipu akcije
    const action = { ...body.action } as Action
    switch (action.type) {
      case 'RESOLVE_TRICK':
      case 'FINALIZE_CLAIM':
        throw new HttpError(403, 'Ovaj potez primenjuje server')
      case 'NEXT_HAND':
        break // bilo koji igrač sme da nastavi na sledeću ruku
      case 'PROCEED':
        action.seat = mySeat // seat je opcion — uvek ga vežemo za pozivaoca
        break
      default:
        if (action.seat !== mySeat) throw new HttpError(403, 'Ne možeš da igraš tuđ potez')
    }

    await applyAction(ctx, action, mySeat)
    waitUntil(runAutomation(admin, ctx.row.id))

    return json(buildView(ctx, user.id))
  }),
)
