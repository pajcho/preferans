// Zajednički HTTP sloj za edge funkcije: CORS + JSON + greške.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message)
  }
}

/** Sudar verzija (CAS) — neko je već primenio potez; pozivalac treba da učita novo stanje. */
export class ConflictError extends Error {
  constructor() {
    super('Stanje se promenilo — pokušaj ponovo')
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function handle(fn: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    try {
      return await fn(req)
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status)
      if (e instanceof ConflictError) return json({ error: e.message, code: 'conflict' }, 409)
      console.error('[fn] neočekivana greška:', e)
      return json({ error: 'Interna greška servera' }, 500)
    }
  }
}

/** Pozadinski rad koji preživi slanje odgovora (bot potezi). */
export function waitUntil(p: Promise<unknown>): void {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime
  if (rt?.waitUntil) rt.waitUntil(p)
  else void p.catch((e) => console.error('[bg]', e))
}
