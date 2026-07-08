// HTTP sloj Worker-a: JSON odgovori, greške i CORS za browser klijente.

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function allowedOrigin(allowedList: string, origin: string | null): string | null {
  if (!origin) return null
  const allowed = allowedList
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  return allowed.includes(origin) ? origin : null
}

export function corsHeaders(allowedList: string, origin: string | null): Record<string, string> {
  const allow = allowedOrigin(allowedList, origin)
  if (!allow) return {}
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

/** Dodaj CORS zaglavlja na odgovor (101/WebSocket odgovori se ne diraju). */
export function withCors(res: Response, allowedList: string, origin: string | null): Response {
  if (res.status === 101) return res
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(corsHeaders(allowedList, origin))) headers.set(k, v)
  return new Response(res.body, { status: res.status, headers })
}

export function cleanName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim().slice(0, 20) : ''
  if (!name) throw new HttpError(400, 'Unesi ime (1–20 znakova)')
  return name
}
