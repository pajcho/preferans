// Redigovan pogled na partiju za pozivaoca (igrač ili posmatrač).
// Usput „šutne" bot automatiku ako je stanje zaglavljeno (npr. server restart).
import { HttpError, handle, json, waitUntil } from '../_shared/http.ts'
import { adminClient, requireUser } from '../_shared/db.ts'
import { automationPending, buildView, loadGame, runAutomation } from '../_shared/game.ts'
import type { GetViewRequest } from '../_shared/protocol/messages.ts'

const STALL_MS = 5000

Deno.serve(
  handle(async (req) => {
    const admin = adminClient()
    const user = await requireUser(req, admin)
    const body = (await req.json()) as GetViewRequest
    if (!body.gameId && !body.code) throw new HttpError(400, 'Nedostaje id ili kod partije')

    const ctx = await loadGame(admin, body.gameId ? { id: body.gameId } : { code: body.code! })

    // automatika je možda umrla (restart edge runtime-a) — pokreni je ako stoji predugo
    if (automationPending(ctx)) {
      const age = Date.now() - new Date(ctx.row.updated_at).getTime()
      if (age > STALL_MS) waitUntil(runAutomation(admin, ctx.row.id))
    }

    return json(buildView(ctx, user.id))
  }),
)
